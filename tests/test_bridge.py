import asyncio
import importlib.util
import json
import pathlib
import unittest
from unittest.mock import ANY, AsyncMock, patch

spec = importlib.util.spec_from_file_location('bridge', pathlib.Path(__file__).parents[1]/'python/bridge.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


class SerializationTests(unittest.TestCase):
    def test_real_package_preserves_emg_samples_and_payload(self):
        from meta_neural_py import EMGBatch, ClockDomain
        event = EMGBatch(received_at=1.5, source_clock=ClockDomain.EMG, sequence=3,
                         timestamp=99, values=tuple(tuple(range(8)) for _ in range(16)), payload=b'\x00\xff')
        result = json.loads(json.dumps(bridge.packet(event)))
        self.assertEqual(result['source_clock'], 'device_emg_us')
        self.assertEqual(result['values'], [list(range(8))]*16)
        self.assertEqual(result['payload'], {'encoding':'hex','data':'00ff'})

    def test_unknown_gesture_codes_remain_inspectable(self):
        from meta_neural_py import Gesture, ClockDomain
        result = bridge.packet(Gesture(received_at=1, source_clock=ClockDomain.GESTURE,
            sequence=1, timestamp=2, finger_code=99, action_code=98, derived_action_code=97, synthetic=False))
        self.assertEqual(result['finger'], 'unknown:99')
        self.assertEqual(result['action_code'], 98)
        self.assertEqual(result['derived_action'], 'unknown:97')


class CommandTests(unittest.IsolatedAsyncioTestCase):
    async def test_air_preview_requires_explicit_opt_in(self):
        worker=bridge.Bridge()
        self.assertFalse(worker.shortcuts.air_preview_enabled)
        await worker.command({'action':'air_preview','enabled':True})
        self.assertTrue(worker.shortcuts.air_preview_enabled)
        await worker.command({'action':'air_preview','enabled':False})
        self.assertFalse(worker.shortcuts.air_preview_enabled)

    async def test_disconnect_awaits_subscription_cleanup(self):
        worker=bridge.Bridge()
        closed=asyncio.Event()
        async def session():
            try:
                await asyncio.Future()
            finally:
                closed.set()
        worker.session=asyncio.create_task(session())
        await asyncio.sleep(0)
        await worker.disconnect()
        self.assertTrue(closed.is_set())
        self.assertIsNone(worker.session)


    async def test_failed_old_session_does_not_block_reconnect(self):
        worker=bridge.Bridge()
        async def failed_session():
            raise RuntimeError('Band L2CAP stream closed')
        worker.session=asyncio.create_task(failed_session())
        await asyncio.sleep(0)
        with patch.object(bridge,'emit'):
            await worker.disconnect()
        self.assertIsNone(worker.session)
        # A subsequent cleanup/connect attempt no longer awaits the failed task.
        await worker.disconnect()


class ActivationTests(unittest.IsolatedAsyncioTestCase):
    async def run_stream(self, failure=None, quiet=False):
        calls = []
        class Subscription:
            async def __aenter__(self):
                calls.append('subscribe')
                return self
            async def __aexit__(self, *_): pass
            def __aiter__(self): return self
            async def __anext__(self): raise StopAsyncIteration
        class FakeBand:
            device_info = None
            band_verified = True
            def __init__(self, *_): pass
            async def __aenter__(self): return self
            async def __aexit__(self, *_): calls.append('closed')
            async def read_hand(self): return None
            async def read_battery(self): return None
            async def _rpc(self, *args):
                calls.append(args)
                if failure:
                    raise failure
                return b''
            def subscribe(self, streams): return Subscription()
        worker = bridge.Bridge()
        with patch('meta_neural_py.Band', FakeBand), patch.object(bridge, 'emit') as emit:
            await worker.stream('band', quiet=quiet)
        self.assertIsNone(worker.band)
        return calls, emit

    async def test_activation_completes_before_subscription(self):
        calls, emit = await self.run_stream()
        self.assertEqual(calls, [('request_active', 6, 5, b'\x30\x02'), 'subscribe', 'closed'])
        emit.assert_any_call('state', state='connected')

    async def test_activation_timeout_is_visible_and_closes_connection(self):
        from meta_neural_py.errors import RequestTimeout
        calls, emit = await self.run_stream(RequestTimeout('activation expired', stage='ready'))
        self.assertEqual(calls[-1], 'closed')
        self.assertNotIn('subscribe', calls)
        self.assertFalse(any(c.args == ('identity_recovery',) for c in emit.call_args_list))
        self.assertTrue(any(c.args == ('error',) and 'activation expired' in c.kwargs['message'] for c in emit.call_args_list))
        emit.assert_any_call('state', state='disconnected')

    async def test_quiet_connection_failure_stays_quiet_for_another_try(self):
        from meta_neural_py.errors import RequestTimeout
        _, emit = await self.run_stream(RequestTimeout('band not ready', stage='connecting'), quiet=True)
        self.assertFalse(any(c.args == ('error',) for c in emit.call_args_list))
        emit.assert_any_call('state', state='connecting')
        emit.assert_any_call('state', state='disconnected')


class DiscoveryTests(unittest.IsolatedAsyncioTestCase):
    async def test_discovery_preserves_request_id(self):
        worker = bridge.Bridge()
        devices = [{'id':'one','name':'Meta Band'}]
        with patch('meta_neural_py.Band.discover', new_callable=AsyncMock, return_value=devices) as discover, patch.object(bridge, 'emit') as emit:
            await worker.command({'action':'discover','request_id':'startup'})
        discover.assert_awaited_once_with(timeout=5)
        emit.assert_called_once_with('devices',devices=devices,request_id='startup')

    async def test_watch_scan_uses_a_short_timeout_and_hides_bluetooth_misses(self):
        worker = bridge.Bridge()
        with patch('meta_neural_py.Band.discover', new_callable=AsyncMock, side_effect=RuntimeError('bluetooth off')) as discover, patch.object(bridge, 'emit') as emit:
            await worker.command({'action':'discover','request_id':'watch:4','timeout':3,'quiet':True})
        discover.assert_awaited_once_with(timeout=3)
        emit.assert_called_once_with('devices', devices=[], request_id='watch:4')

    async def test_discovery_does_not_scan_while_a_band_is_connected(self):
        worker = bridge.Bridge()
        worker.band = object()
        with patch('meta_neural_py.Band.discover', new_callable=AsyncMock) as discover, patch.object(bridge, 'emit') as emit:
            await worker.command({'action':'discover','request_id':'watch:2','timeout':3})
        discover.assert_not_called()
        emit.assert_called_once_with('devices', devices=[], request_id='watch:2')

    def test_discovery_timeout_rejects_bad_values(self):
        self.assertEqual(bridge.discovery_timeout(None), 5)
        self.assertEqual(bridge.discovery_timeout('soon'), 5)
        self.assertEqual(bridge.discovery_timeout(0), 5)
        self.assertEqual(bridge.discovery_timeout(30), 8)
        self.assertEqual(bridge.discovery_timeout(2.5), 2.5)


class ShortcutFeedbackTests(unittest.TestCase):
    def test_permission_failure_keeps_recognition_and_recovers(self):
        worker = bridge.Bridge()
        worker.shortcuts.configure([{'id':'swipe-left','enabled':True,
            'shortcut':{'key':'C','modifiers':['command']}}])
        worker.shortcuts.suspended = False
        event = {'type':'Gesture','action':'left'}
        with patch.object(bridge,'emit') as emit, patch.object(worker.keyboard,'send',
                side_effect=[RuntimeError('Accessibility required'),RuntimeError('Accessibility required'),None]) as send:
            for now in [1,2,3]:
                worker.shortcuts.clock = lambda: now
                worker.shortcuts.ingest(event)
            self.assertEqual(send.call_count,3)
            self.assertEqual(sum(call.args == ('motion',) for call in emit.call_args_list),3)
            self.assertEqual(sum(call.args == ('error',) for call in emit.call_args_list),1)
            self.assertFalse(worker.shortcuts.suspended)
            self.assertIsNone(worker.shortcut_error)


class EnrollmentRecoveryTests(unittest.IsolatedAsyncioTestCase):
    def test_only_identity_failures_and_trust_timeouts_recover(self):
        from meta_neural_py.errors import IdentityMismatch, IdentityStoreError, RequestTimeout, DeviceDisconnected, TrustVerificationFailed
        for error in (IdentityMismatch('stale'), RequestTimeout('expired', stage='trust'), IdentityStoreError('No verified identity saved; run Band.enroll explicitly.')):
            self.assertTrue(bridge.Bridge.needs_enrollment(error))
        for error in (RequestTimeout('expired', stage='connecting'), DeviceDisconnected('closed'), TrustVerificationFailed('proof invalid'), IdentityStoreError('Keychain denied')):
            self.assertFalse(bridge.Bridge.needs_enrollment(error))

    async def test_trust_failure_releases_connection_before_one_reenrollment(self):
        from meta_neural_py.errors import RequestTimeout
        from types import SimpleNamespace
        worker = bridge.Bridge()
        closed = []
        class FailedBand:
            def __init__(self, *_): pass
            async def __aenter__(self): return self
            async def __aexit__(self, *_): closed.append(True)
            device_info = None
            band_verified = False
            async def read_hand(self): raise RequestTimeout('expired', stage='trust')
        async def enroll(*_, **kwargs):
            self.assertTrue(closed)
            self.assertTrue(kwargs['allow_missing_band_key'])
        with patch('meta_neural_py.Band', FailedBand), patch('meta_neural_py.identity.keychain.KeychainIdentityStore.load', return_value=SimpleNamespace(allow_missing_band_key=True)), patch.object(FailedBand, 'enroll', new=AsyncMock(side_effect=enroll), create=True) as enrollment, patch.object(bridge, 'emit') as emit:
            await worker.stream('band')
        self.assertEqual(enrollment.await_count, 1)
        self.assertEqual(len(closed), 2)
        self.assertEqual(sum(c.args == ('identity_recovery',) for c in emit.call_args_list), 1)
        self.assertEqual(sum(c.args == ('error',) for c in emit.call_args_list), 1)

    async def test_cancel_enrollment_awaits_cleanup(self):
        worker = bridge.Bridge()
        started = asyncio.Event()
        finished = asyncio.Event()
        async def enroll(*args, **kwargs):
            started.set()
            try: await asyncio.Future()
            finally: finished.set()
        with patch('meta_neural_py.Band.enroll', side_effect=enroll), patch.object(bridge, 'emit'):
            await worker.command({'action':'enroll','device_id':'band','allow_missing_band_key':False})
            await started.wait()
            await worker.disconnect()
        self.assertTrue(finished.is_set())
        self.assertIsNone(worker.session)

    async def test_successful_enrollment_reconnects_without_recovery_loop(self):
        worker = bridge.Bridge()
        with patch('meta_neural_py.Band.enroll', new_callable=AsyncMock) as enrollment, patch.object(worker, 'stream', new_callable=AsyncMock) as stream, patch.object(bridge, 'emit'):
            await worker.enroll('band', False)
        enrollment.assert_awaited_once_with('band', auth=ANY, allow_missing_band_key=False)
        stream.assert_awaited_once_with('band', recover_identity=False)


class MetaLoginTests(unittest.IsolatedAsyncioTestCase):
    async def test_login_callback_is_correlated_and_cancel_does_not_resolve_other_request(self):
        worker = bridge.Bridge()
        future = asyncio.get_running_loop().create_future()
        worker.login_requests['current'] = future
        await worker.command({'action': 'meta_login_result', 'request_id': 'stale', 'callback': 'wrong'})
        self.assertFalse(future.done())
        await worker.command({'action': 'meta_login_result', 'request_id': 'current', 'callback': 'expected'})
        self.assertEqual(await future, 'expected')

    async def test_cancelled_login_raises_fixed_error(self):
        from meta_neural_py.errors import LoginCancelled
        worker = bridge.Bridge()
        future = asyncio.get_running_loop().create_future()
        worker.login_requests['current'] = future
        await worker.command({'action': 'meta_login_result', 'request_id': 'current'})
        with self.assertRaises(LoginCancelled):
            await future
