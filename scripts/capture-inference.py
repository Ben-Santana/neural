"""Capture native gesture logits without generating shortcuts or changing model settings."""
import asyncio
import json
import math
from pathlib import Path
import struct
import sys
import time
from meta_neural_py import Band
from meta_neural_py.protocol.session import Session
from meta_neural_py.protocol.protobuf import Fields, field

LABELS = ['index_press','index_release','middle_press','middle_release','thumb_tap','thumb_up','thumb_down','thumb_in','thumb_out']
original_receive = Session._receive
samples = []
def receive(self, packet, now):
    kind = packet.words[-1] if packet.words else self._types.get(packet.channel)
    if self.stage == 'ready' and kind == 0x0200020c:
        f = Fields(packet.payload)
        data = f.bytes(3)
        pipeline = f.integer(10)
        if not data or len(data)%4 or len(data)>4096:
            raise ValueError(f'Invalid inference payload size: {len(data)}')
        scores = struct.unpack(f'<{len(data)//4}f',data)
        if not all(math.isfinite(v) for v in scores):
            raise ValueError('Nonfinite inference scores')
        samples.append({'sequence':f.integer(1),'timestamp':f.integer(2),'received_at':now,'pipeline':pipeline,'scores':scores})
    return original_receive(self,packet,now)
Session._receive = receive

async def main():
    async with Band(sys.argv[1]) as band:
        response = Fields(await band._rpc('read_inference_configuration',7,5))
        config = Fields(response.bytes(6))
        if 46 in config:
            f = Fields(config.bytes(46))
            print(json.dumps({'config':{str(n):[(v if isinstance(v,int) else f'{len(v)} bytes') for w,v in values] for n,values in f.values.items()}}),flush=True)
        await band._rpc('input_subscription',5,4)
        try:
            reply = Fields(await band._rpc('enable_inference',5,4,field(3,1)+field(4,1)))
            flags = Fields(reply.bytes(5))
            if flags.integer(3)!=1 or flags.integer(4)!=1:
                raise ValueError('Inference subscription not acknowledged')
            print('Scores enabled. Rest for 5 seconds, then repeat index and middle pinches and holds for 25 seconds.',flush=True)
            for second in range(30):
                await asyncio.sleep(1)
                if band._failure: raise band._failure
                if second%5==4: print(json.dumps({'elapsed':second+1,'samples':len(samples),'latest':samples[-1]['scores'] if samples else None}),flush=True)
        finally:
            reply=Fields(await band._rpc('disable_inference',5,4,field(3,0)+field(4,0)))
            flags=Fields(reply.bytes(5))
            if flags.integer(3)!=0 or flags.integer(4)!=0: raise ValueError('Inference shutdown not acknowledged')
            Path(sys.argv[2]).write_text(''.join(json.dumps(s)+'\n' for s in samples))
        print(json.dumps({'samples':len(samples),'labels':LABELS if samples and all(s['pipeline']==2 and len(s['scores'])==9 for s in samples) else None,'pipelines':sorted(set(s['pipeline'] for s in samples)), 'dimensions':sorted(set(len(s['scores']) for s in samples))}),flush=True)
asyncio.run(main())
