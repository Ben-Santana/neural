import asyncio
import struct
import tempfile
from types import SimpleNamespace
import unittest
from python.native_handwriting import NativeHandwriting, TextDecoder, CHARACTERS, STREAM_FIELDS
from meta_neural_py.protocol.protobuf import Fields, field


def scores(best):
    values = [-30.]*100
    values[best] = 0.
    return values


def sample(best, seq=1, timestamp=1, pipeline=3):
    return field(1,seq)+field(2,timestamp)+field(3,struct.pack('<100f',*scores(best)))+field(10,pipeline)


class DecoderTests(unittest.TestCase):
    def test_ctc_repeat_blank_and_edits(self):
        self.assertEqual(len(CHARACTERS),94)
        decoder=TextDecoder()
        classes=[0,0,99,0,94,97,1,88,2,95,3,87,98]
        for seq,best in enumerate(classes):
            decoder.consume(seq,seq*150000,scores(best))
        self.assertEqual(decoder.text,'aB c\nd')
        self.assertIn('⌫',decoder.raw)

    def test_clear_duplicate_and_discontinuity(self):
        decoder=TextDecoder()
        decoder.consume(1,1,scores(0))
        decoder.clear()
        decoder.consume(1,1,scores(0))
        decoder.consume(2,100000,scores(0))
        self.assertEqual(decoder.text,'')
        decoder.consume(4,400000,scores(0))
        self.assertEqual(decoder.text,'a')
        self.assertEqual(decoder.gaps,1)


class FakeBand:
    id='TEST-BAND'
    def __init__(self):
        self.values={41:0,42:2}
        # Enumeration indices intentionally differ from actual setting IDs.
        self.names={1:('settings-reset',12),2:('data-collection',41),3:('data-collection-model',42)}
        self.lookups=[]
        self.flags={n:int(n in (2,3,6,8)) for n in STREAM_FIELDS}
        self.writes=[]
        self.fail_after_write=False
        self.offline=False
        self.omit_defaults=False
        self.integer_model=False
        self.model_range=None
        self._session=SimpleNamespace(_receive=lambda p,n:(b'',[]),_types={},stage='ready')
    async def _rpc(self,op,channel,arm,body,timeout=4):
        if self.offline:
            raise ValueError('Disconnected')
        if channel==5:
            request=Fields(body)
            for n in request.values:
                self.flags[n]=request.integer(n)
            return field(2,1)+field(5,b''.join(field(n,v) for n,v in self.flags.items()))
        request=Fields(body)
        if 1 in request:
            nested=field(1,field(1,len(self.names)))
        elif 2 in request:
            index=Fields(request.bytes(2)).integer(2)
            self.lookups.append(index)
            if index not in self.names:
                raise ValueError('No descriptor at this index')
            name,ident=self.names[index]
            descriptor=field(3,name.encode())+field(4,ident)
            if name=='data-collection-model' and self.model_range:
                descriptor+=field(7,field(2,self.model_range[0])+field(3,self.model_range[1]))
            nested=field(2,descriptor)
        else:
            value=Fields(request.bytes(3))
            ident,writing=value.integer(1),value.integer(2)
            if ident not in self.values:
                raise AssertionError('Attempt to mutate an unrelated setting')
            which=int(ident==42)
            answer=field(1,ident)+(field(2,writing) if writing or not self.omit_defaults else b'')+(field(3,0) if not self.omit_defaults else b'')
            if writing:
                self.values[ident]=Fields(value.bytes((7,3 if self.integer_model else 10)[which])).integer(1,0)
                self.writes.append((ident,self.values[ident]))
                if self.fail_after_write:
                    self.fail_after_write=False
                    raise ValueError('Write applied but acknowledgement lost')
            else:
                wrapper=field(1,self.values[ident]) if self.values[ident] or not self.omit_defaults else b''
                answer+=field((8,4 if self.integer_model else 11)[which],wrapper)
            nested=field(3,answer)
        return field(2,1)+field(14,nested)


class NativeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.events=[]
        self.native=NativeHandwriting(lambda k,**v:self.events.append((k,v)),self.temp.name)
        self.band=FakeBand()
        await self.native.attach(self.band)
    async def asyncTearDown(self):
        await self.native.stop()
        self.native.detach()
        self.temp.cleanup()
    async def waiting(self):
        for _ in range(100):
            await asyncio.sleep(.001)
            if self.native.state['phase']=='waiting':
                return
        self.fail(str(self.native.state))
    async def test_proto3_zero_defaults_and_empty_boolean_wrapper(self):
        self.band.omit_defaults=True
        self.band.integer_model=True
        ids=await self.native.discover()
        self.assertEqual(await self.native.setting(ids[0],0),0)
        self.assertEqual(await self.native.setting(ids[1],1),2)
        self.assertEqual(self.native.value_fields[42],(4,3))
    async def test_integer_model_write_and_restore(self):
        self.band.omit_defaults=True
        self.band.integer_model=True
        self.band.model_range=(1,5)
        await self.native.start()
        await self.waiting()
        self.assertEqual(self.band.values,{41:1,42:5})
        await self.native.stop()
        self.assertEqual(self.band.values,{41:0,42:2})
        self.assertTrue(self.native.state['verified'])
    async def test_unsupported_model_range_never_mutates_band(self):
        self.band.omit_defaults=True
        self.band.integer_model=True
        self.band.model_range=(1,4)
        flags=dict(self.band.flags)
        await self.native.start()
        await self.native.task
        self.assertEqual(self.native.state['phase'],'error')
        self.assertIn('1–4',self.native.state['message'])
        self.assertIn('requires 5',self.native.state['message'])
        self.assertEqual(self.band.writes,[])
        self.assertEqual(self.band.flags,flags)
        self.assertFalse(self.native.journal.exists())
    async def test_missing_value_wrapper_does_not_default_to_false(self):
        async def no_value(*args,**kwargs):
            return field(2,1)+field(14,field(3,field(1,41)))
        self.band._rpc=no_value
        with self.assertRaisesRegex(ValueError,'value type'):
            await self.native.setting(41,0)
    async def test_one_based_discovery_on_27_setting_firmware(self):
        self.band.names={i:(f'setting-{i}',i+100) for i in range(1,28)}
        self.band.names[19]=('data-collection',41)
        self.band.names[20]=('data-collection-model',42)
        self.assertEqual(await self.native.discover(),[41,42])
        self.assertTrue(all(1 <= i <= 27 for i in self.band.lookups))
        self.assertNotIn(0,self.band.lookups)
        self.assertEqual(self.band.writes,[])
    async def test_lookup_failure_is_not_reported_as_missing_firmware_support(self):
        original=self.band._rpc
        async def fail(op,*args,**kwargs):
            if op=='native_hw_describe':
                raise ValueError('Band L2CAP stream closed')
            return await original(op,*args,**kwargs)
        self.band._rpc=fail
        with self.assertRaisesRegex(ValueError,'Could not read band setting.*L2CAP'):
            await self.native.discover()
        self.assertEqual(self.band.writes,[])
    async def test_immediate_stop_before_task_starts(self):
        await self.native.start()
        await self.native.stop()
        self.assertEqual(self.native.state['phase'],'idle')
        self.assertEqual(self.band.writes,[])
        self.assertFalse(self.native.journal.exists())
    async def test_native_start_decode_and_stop_restore(self):
        await self.native.start()
        await self.waiting()
        self.assertEqual(self.band.values,{41:1,42:5})
        self.assertTrue(self.native.journal.exists())
        self.native.sample(sample(99),asyncio.get_running_loop().time())
        await asyncio.sleep(.01)
        self.assertEqual(self.native.state['phase'],'listening')
        self.native.sample(sample(7,2,150001),asyncio.get_running_loop().time())
        self.native.sample(sample(8,3,300001),asyncio.get_running_loop().time())
        self.assertEqual(self.native.state['text'],'hi')
        await self.native.stop()
        self.assertEqual(self.band.values,{41:0,42:2})
        self.assertFalse(self.native.journal.exists())
        self.assertEqual([self.band.flags[n] for n in (4,22,23)],[0,0,0])
        self.assertTrue(all(self.band.flags[n] for n in (2,3,6,8)))
        self.assertTrue(self.native.state['verified'])
    async def test_ack_lost_after_mutation_is_restored(self):
        self.band.fail_after_write=True
        await self.native.start()
        await self.native.task
        self.assertEqual(self.native.state['phase'],'error')
        self.assertEqual(self.band.values,{41:0,42:2})
        self.assertFalse(self.native.journal.exists())
    async def test_disconnect_journal_survives_and_recovers(self):
        await self.native.start()
        await self.waiting()
        self.band.offline=True
        await self.native.stop()
        self.assertEqual(self.native.state['phase'],'restore_required')
        self.assertTrue(self.native.journal.exists())
        self.native.detach()
        self.band.offline=False
        # New manager simulates process restart, with no in-memory snapshot.
        self.native=NativeHandwriting(lambda *_a,**_k:None,self.temp.name)
        await self.native.attach(self.band)
        self.assertEqual(self.band.values,{41:0,42:2})
        self.assertFalse(self.native.journal.exists())
        self.assertTrue(self.native.state['verified'])
    async def test_wrong_band_never_restores_another_device(self):
        self.native.persist({'device_id':'OTHER','values':[0,2],'flags':{}})
        await self.native.attach(self.band)
        self.assertEqual(self.native.state['phase'],'restore_required')
        self.assertEqual(self.band.writes,[])
    async def test_wrong_names_never_write(self):
        self.band.names={1:('settings-reset',12),2:('something-else',41),3:('also-other',42)}
        await self.native.start()
        await self.native.task
        self.assertEqual(self.band.writes,[])
        self.assertFalse(self.native.journal.exists())
    async def test_non_handwriting_and_bad_dimensions_do_not_decode(self):
        self.native.state['phase']='listening'
        self.native.sample(sample(0,pipeline=2),1)
        self.assertEqual(self.native.state['samples'],0)
        self.native.sample(field(10,3)+field(1,1)+field(2,1)+field(3,b'bad'),1)
        self.assertIsNotNone(self.native.sample_error)
        self.assertEqual(self.native.state['text'],'')
    async def test_bad_scores_stop_and_restore(self):
        await self.native.start()
        await self.waiting()
        payload=field(1,1)+field(2,1)+field(10,3)+field(3,struct.pack('<100f',*([float('nan')]*100)))
        self.native.sample(payload,1)
        await self.native.task
        self.assertEqual(self.native.state['phase'],'error')
        self.assertEqual(self.band.values,{41:0,42:2})
    async def test_restoration_preserves_current_non_handwriting_flags(self):
        snapshot={'device_id':self.band.id,'values':[0,2],'flags':{4:0,22:0,23:1}}
        self.native.persist(snapshot)
        self.band.flags[2]=0
        await self.native.restore(snapshot)
        self.assertEqual(self.band.flags[2],0)
        self.assertEqual(self.band.flags[23],1)
