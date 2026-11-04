import asyncio
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from python.model_lab import ModelLab
from python.model_runtime import extract


class CaptureTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.events = []
        self.lab = ModelLab(lambda kind, **data: self.events.append({'kind': kind, **data}), self.temp.name)

    async def asyncTearDown(self):
        await self.lab.cancel()

    async def start(self):
        await self.lab.command({'action': 'model_capture_start', 'model': 'handwriting'}, connected=True)

    def feed(self, index):
        self.lab.ingest({'type': 'EMGBatch', 'timestamp': round(index*16/2048*1e6), 'values': [[32768+c for c in range(8)]]*16})

    async def test_requires_real_connection(self):
        with self.assertRaisesRegex(ValueError, 'real band'):
            await self.lab.command({'action': 'model_capture_start', 'model': 'pose'})

    async def test_recording_is_bounded_and_deleted_on_leave(self):
        await self.start()
        for i in range(1600):
            self.feed(i)
        self.assertIsNone(self.lab.capture)
        content = json.loads(self.lab.recording.read_text())
        self.assertEqual(len(content['rows']), 24576)
        self.assertEqual(content['channels'], 8)
        await self.lab.command({'action': 'model_leave'})
        self.assertFalse((Path(self.temp.name)/'capture.json').exists())
        self.assertEqual(self.lab.states['handwriting']['samples'], 0)

    async def test_gap_discards_recording(self):
        await self.start()
        self.feed(0)
        self.feed(2)
        self.assertIsNone(self.lab.recording)
        self.assertIsNone(self.lab.capture)
        self.assertIn('gap', self.lab.states['handwriting']['message'])

    async def test_short_capture_rejected(self):
        await self.start()
        self.feed(0)
        self.lab.finish_capture()
        self.assertIsNone(self.lab.recording)
        self.assertEqual(self.lab.states['handwriting']['phase'], 'error')

    async def test_discontinuity_and_invalid_data_rejected(self):
        for packet in [{'type': 'Discontinuity'}, {'type': 'EMGBatch', 'values': [[float('nan')]*8]}]:
            await self.start()
            self.lab.ingest(packet)
            self.assertIsNone(self.lab.capture)
            self.assertIsNone(self.lab.recording)

    async def test_clean_capture_can_be_used_by_other_model(self):
        await self.start()
        for i in range(384):
            self.feed(i)
        self.lab.finish_capture()
        self.assertEqual(self.lab.states['handwriting']['phase'], 'captured')
        with self.assertRaisesRegex(ValueError, 'Install'):
            await self.lab.command({'action': 'model_run', 'model': 'pose', 'mapping': 'repeat'})

    async def test_handwriting_rejects_duplicate_channels(self):
        self.lab.recording = Path(self.temp.name)/'capture.json'
        with self.assertRaisesRegex(ValueError, 'singular'):
            await self.lab.command({'action':'model_run','model':'handwriting','mapping':'repeat'})

    async def test_large_pose_result_is_not_truncated(self):
        from types import SimpleNamespace
        from unittest.mock import patch, AsyncMock
        result = {'angles': [[0.123456789]*20]*240}
        stream = asyncio.StreamReader()
        stream.feed_data((json.dumps({'event': 'result', 'result': result})+'\n').encode())
        stream.feed_eof()
        process = SimpleNamespace(stdout=stream, returncode=0, wait=AsyncMock(return_value=0))
        self.lab.recording = Path(self.temp.name)/'capture.json'
        with patch('asyncio.create_subprocess_exec', AsyncMock(return_value=process)):
            await self.lab.run_job('pose', {'action': 'model_run', 'mapping': 'repeat'})
        delivered = [event for event in self.events if event['kind'] == 'model_result']
        self.assertEqual(delivered[0]['result'], result)
        self.assertEqual(self.lab.states['pose']['phase'], 'ready')

    async def test_cancel_stops_subprocess(self):
        self.lab.active = 'handwriting'
        self.lab.states['handwriting']['phase'] = 'running'
        self.lab.process = await asyncio.create_subprocess_exec('sleep', '30', start_new_session=True)
        process = self.lab.process
        # Exercise the same finally cleanup as the real runner with a mocked spawn.
        from unittest.mock import patch, AsyncMock
        stream = asyncio.StreamReader()
        process.stdout = stream
        with patch('asyncio.create_subprocess_exec', AsyncMock(return_value=process)):
            self.lab.job = asyncio.create_task(self.lab.run_job('handwriting', {'action':'model_install'}))
            await asyncio.sleep(.02)
            await self.lab.cancel()
        self.assertIsNotNone(process.returncode)
        self.assertIsNone(self.lab.active)


class ArchiveTests(unittest.TestCase):
    def test_rejects_traversal_and_symlinks(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for name, kind in [('../escape', tarfile.REGTYPE), ('link', tarfile.SYMTYPE)]:
                archive = root/'archive.tar'
                with tarfile.open(archive, 'w') as tar:
                    member = tarfile.TarInfo(name)
                    member.type = kind
                    member.linkname = '/tmp'
                    tar.addfile(member, io.BytesIO())
                with self.assertRaisesRegex(ValueError, 'Unsafe'):
                    extract(archive, root/'out')
            self.assertFalse((root/'escape').exists())
