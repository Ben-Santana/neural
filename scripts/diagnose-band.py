"""Local receive-path audit; never records identity or handshake material."""
import asyncio
from collections import Counter
from dataclasses import asdict
import json
import sys
import os
import time
from meta_neural_py import Band, Streams
from meta_neural_py.protocol.session import Session
from meta_neural_py.protocol.protobuf import Fields

original = Session._receive
report = {k:Counter() for k in ('frames','channels','decode_errors','no_event')}
report['schemas'] = {}

def receive(self, packet, now):
    kind = packet.words[-1] if packet.words else self._types.get(packet.channel)
    auditing = self.stage == 'ready'
    if auditing:
        key = f'{kind:#010x}' if kind is not None else 'untyped'
        report['frames'][key] += 1
        report['channels'][str(packet.channel)] += 1
        # Only preserve sensor/unknown input schemas, never RPC or trust payloads.
        if kind is not None and kind >> 24 == 2 and key not in report['schemas']:
            try:
                fields = Fields(packet.payload)
                report['schemas'][key] = {str(n): [{'wire': w, 'value': v if isinstance(v,int) else f'{len(v)} bytes'} for w,v in vals] for n,vals in fields.values.items()}
            except Exception as exc:
                report['schemas'][key] = {'parse_error': type(exc).__name__}
    if auditing and kind == 0x02000315:
        fields = Fields(packet.payload)
        if 5 in fields:
            report.setdefault('stream_reply_fields',[]).append({str(n): [v if isinstance(v,int) else f'{len(v)} bytes' for w,v in vals] for n,vals in Fields(fields.bytes(5)).values.items()})
    try:
        result = original(self, packet, now)
    except Exception as exc:
        if auditing:
            report['decode_errors'][type(exc).__name__] += 1
        raise
    if auditing and not result[1]:
        report['no_event'][key] += 1
    return result

Session._receive = receive
original_feed = Session.feed
transport_pending = bytearray()
transport_records = Counter()
def feed(self, data, now):
    if self.stage == 'ready' and self._rx is not None:
        transport_pending.extend(data)
        while transport_pending:
            marker = transport_pending[0]
            if marker in (0x81,0x82):
                size = 2
            elif marker in (1,2):
                if len(transport_pending)<2: break
                size = 3+transport_pending[1]
            elif marker in (0x40,0x41,0x42):
                if len(transport_pending)<10: break
                size = 10+(transport_pending[9]+1)*16
            else:
                transport_records['unparsed'] += 1
                transport_pending.clear()
                break
            if len(transport_pending)<size: break
            transport_records[hex(marker)] += 1
            del transport_pending[:size]
    return original_feed(self,data,now)
Session.feed = feed

async def main():
    global report
    async with Band(sys.argv[1]) as band:
        print(json.dumps({'status':'connected','hand':await band.read_hand(),'battery':asdict(await band.read_battery())}),flush=True)
        for name, streams in [('gestures_only',Streams()),('gestures_motion',Streams(gestures=True,gyro=True,orientation=True)),('all_streams',Streams(gestures=True,gyro=True,orientation=True,emg=True))]:
            if os.environ.get('AUDIT_ALL_ONLY') and name != 'all_streams': continue
            transport_records.clear()
            report = {k:Counter() for k in ('frames','channels','decode_errors','no_event')}
            report['schemas'] = {}
            counts = Counter()
            low = [65535]*8; high = [0]*8; squares = [0]*8; totals = [0]*8; samples = 0
            async with band.subscribe(streams) as events:
                print(json.dumps({'status':'testing','profile':name,'seconds':int(os.environ.get('AUDIT_SECONDS','20')),'acknowledged_flags':band.active_streams.flags()}),flush=True)
                end = time.monotonic()+int(os.environ.get('AUDIT_SECONDS','20'))
                while time.monotonic()<end:
                    try:
                        event = await asyncio.wait_for(anext(events),end-time.monotonic())
                    except TimeoutError:
                        break
                    counts[type(event).__name__] += 1
                    if type(event).__name__ == 'EMGBatch':
                        for row in event.values:
                            samples += 1
                            for c,v in enumerate(row):
                                low[c] = min(low[c],v); high[c] = max(high[c],v)
                                totals[c] += v; squares[c] += v*v
                    if type(event).__name__ == 'Gesture':
                        print(json.dumps({'gesture':asdict(event)},default=str),flush=True)
            print(json.dumps({'profile':name,'events':counts,'receive_audit':report,'transport_markers':transport_records,'emg_summary':{'samples':samples,'min':low,'max':high,'stddev':[(max(0,squares[c]/samples-(totals[c]/samples)**2))**.5 for c in range(8)] if samples else []},'stats':asdict(band.stats)},default=str),flush=True)

asyncio.run(main())
