"""Experimental consumer-band handwriting. No model download or raw-EMG conversion.

Protocol reference: beyondlevi/rokid-lumen, rust/band-core/src/{model_capture,handwriting}.rs
(MIT). Setting IDs are discovered by name; every mutation has a recovery journal.
"""
import asyncio
import json
import math
import os
from pathlib import Path
import string
import struct
import time
from meta_neural_py.protocol.protobuf import Fields, field

NAMES = ('data-collection', 'data-collection-model')
STREAM_FIELDS = (2, 3, 4, 6, 8, 22, 23)
CHARACTERS = string.ascii_lowercase + string.ascii_uppercase + string.digits + string.punctuation


class TextDecoder:
    def __init__(self):
        self.text = ''
        self.raw = ''
        self.shift = False
        self.previous = None
        self.sequence = None
        self.timestamp = None
        self.gaps = 0

    def clear(self):
        self.text = self.raw = ''
        self.shift = False

    def consume(self, sequence, timestamp, scores):
        if sequence == self.sequence and timestamp == self.timestamp:
            return None
        if self.sequence is not None and (sequence != (self.sequence + 1) % 2**32 or timestamp <= self.timestamp or timestamp-self.timestamp > 500000):
            self.previous = None
            self.gaps += 1
        self.sequence, self.timestamp = sequence, timestamp
        best = max(range(100), key=scores.__getitem__)
        previous, self.previous = self.previous, best
        if best == 99 or best == previous:
            return best
        glyph = CHARACTERS[best] if best < 94 else ['⌫', '⏎', ' ', '⇧', '🤏'][best-94]
        self.raw = (self.raw + glyph)[-200:]
        if best in (87, 98):
            pass  # Consumer boundary gestures, not literal underscore / pause text.
        elif best == 97:
            self.shift = True
        elif best == 94:
            self.text = self.text[:-1]
        elif best in (88, 96, 95):
            self.text += '\n' if best == 95 else ' '
            self.shift = False
        else:
            self.text += glyph.upper() if self.shift else glyph
            self.shift = False
        self.text = self.text[-8000:]
        return best


class NativeHandwriting:
    def __init__(self, emit, root):
        self.emit = emit
        self.root = Path(root)
        self.journal = self.root / 'native-handwriting-restore.json'
        self.band = None
        self.value_fields = {}
        self.descriptors = {}
        self.task = None
        self.original_receive = None
        self.decoder = TextDecoder()
        self.state = {'phase': 'idle', 'message': 'Checks whether your firmware supports native handwriting.', 'verified': True, 'samples': 0, 'text': '', 'gaps': 0}
        self.ready = None
        self.last_sample = 0
        self.sample_error = None

    @property
    def active(self):
        return bool(self.task and not self.task.done()) or self.state['phase'] == 'restore_required'

    def status(self, **update):
        self.state.update(update)
        self.emit('native_handwriting', **self.state)

    async def rpc(self, operation, channel, arm, body=b''):
        if not self.band:
            raise ValueError('Connect a band first')
        payload = await self.band._rpc(operation, channel, arm, body, timeout=4)
        response = Fields(payload)
        if response.integer(2) != 1:
            raise ValueError('The band rejected a handwriting request')
        return response

    async def describe(self, index):
        response = await self.rpc('native_hw_describe', 1, 14, field(2, field(1, 2)+field(2, index)))
        info = Fields(Fields(response.bytes(14)).bytes(2))
        name = info.bytes(3).decode('utf8')
        ident = info.integer(4)
        if not 0 < ident < 65536:
            raise ValueError('Invalid handwriting setting identifier')
        self.descriptors[ident] = info
        return name, ident

    async def discover(self):
        response = await self.rpc('native_hw_count', 1, 14, field(1, field(1, 2)))
        count = Fields(Fields(response.bytes(14)).bytes(1)).integer(1)
        if not 2 <= count <= 256:
            raise ValueError('Unsupported settings schema')
        found = {}
        # Firmware enumerates descriptors from 1 through count. Index zero can
        # close the device's L2CAP connection; do not probe outside that range.
        candidates = list(dict.fromkeys([n for n in (27, 28, 29) if n <= count] + list(range(1, count+1))))
        for index in candidates:
            try:
                name, ident = await self.describe(index)
            except Exception as exc:
                raise ValueError(f'Could not read band setting {index}: {exc}. Reconnect and retry.') from exc
            if name in NAMES:
                if ident in found.values() and found.get(name) != ident:
                    raise ValueError('Conflicting handwriting setting identifiers')
                found[name] = ident
            if len(found) == 2:
                return [found[name] for name in NAMES]
        raise ValueError('This firmware does not expose the expected handwriting settings')

    async def setting(self, ident, which, value=None):
        writing = value is not None
        body = field(1, ident)+field(2, int(writing))
        if writing:
            if ident not in self.value_fields:
                raise ValueError('Read and verify the setting type before writing')
            body += field(self.value_fields[ident][1], field(1, value))
        response = await self.rpc('native_hw_setting', 1, 14, field(3, body))
        result = Fields(Fields(response.bytes(14)).bytes(3))
        if result.integer(1) != ident or result.integer(2, 0) != int(writing) or result.integer(3, 0) != 0:
            raise ValueError('Handwriting setting response did not match the request')
        if writing:
            return None
        # Proto3 omits zero-valued scalars, including read action / success and
        # the false value inside an empty boolean wrapper. Wrapper presence is
        # still required. Some older firmware exposes model selection as uint32.
        expected = (8,) if which == 0 else (4, 11)
        present = [n for n in range(4, 12) if n in result]
        if len(present) != 1 or present[0] not in expected:
            raise ValueError('Unexpected handwriting setting value type')
        read_field = present[0]
        self.value_fields[ident] = (read_field, {4:3, 8:7, 11:10}[read_field])
        return Fields(result.bytes(read_field)).integer(1, 0)

    def check_model_support(self, ident):
        info = self.descriptors[ident]
        if 7 in info:  # Integer range: default (1), minimum (2), maximum (3).
            bounds = Fields(info.bytes(7))
            low, high = bounds.integer(2, 0), bounds.integer(3, 2**32-1)
            if not low <= 5 <= high:
                raise ValueError(f'This firmware advertises model values {low}–{high}; the documented native handwriting mode requires 5. No band settings were changed.')

    async def write_verified(self, ident, which, value):
        await self.setting(ident, which, value)
        if await self.setting(ident, which) != value:
            raise ValueError('Handwriting setting read-back did not match')

    async def streams(self, flags=None):
        body = b'' if flags is None else b''.join(field(int(k), int(v)) for k,v in flags.items())
        response = await self.rpc('native_hw_streams', 5, 4, body)
        result = Fields(response.bytes(5))
        actual = {n: result.integer(n, 0) for n in STREAM_FIELDS}
        if any(value not in (0,1) for value in actual.values()):
            raise ValueError('Invalid stream-control flags')
        if flags is not None and any(actual[int(n)] != value for n,value in flags.items()):
            raise ValueError('The band did not acknowledge the handwriting streams')
        return actual

    def persist(self, snapshot):
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        temporary = self.journal.with_suffix('.tmp')
        with open(os.open(temporary, os.O_WRONLY|os.O_CREAT|os.O_TRUNC, 0o600), 'w') as output:
            json.dump(snapshot, output)
            output.flush()
            os.fsync(output.fileno())
        temporary.replace(self.journal)

    async def attach(self, band):
        self.detach()
        self.band = band
        session = getattr(band, '_session', None)
        if session is None:
            self.status(phase='error', message='This connection does not expose native inference streams.')
            return
        self.original_receive = session._receive
        original = self.original_receive
        def receive(packet, now):
            kind = packet.words[-1] if packet.words else session._types.get(packet.channel)
            result = original(packet, now)
            if session.stage == 'ready' and kind == 0x0200020c and self.task and not self.task.done():
                self.sample(packet.payload, now)
            return result
        session._receive = receive
        if self.journal.exists():
            try:
                snapshot = json.loads(self.journal.read_text())
                if snapshot.get('device_id') != band.id:
                    self.status(phase='restore_required', verified=False, message='Another band has pending handwriting restoration. Reconnect that band first.')
                    return
                await self.restore(snapshot)
                self.status(phase='idle', verified=True, message='Recovered and verified the band’s previous settings.')
            except Exception as exc:
                self.status(phase='restore_required', verified=False, message=f'Restoration pending: {exc}. Reconnect to retry.')

    def detach(self):
        if self.original_receive and self.band and getattr(self.band, '_session', None):
            self.band._session._receive = self.original_receive
        self.original_receive = None
        self.band = None
        self.value_fields.clear()
        self.descriptors.clear()

    def sample(self, payload, now):
        if self.state['phase'] not in ('preparing', 'waiting', 'listening'):
            return
        try:
            f = Fields(payload)
            if f.integer(10) != 3:
                return
            sequence, timestamp = f.integer(1), f.integer(2)
            if sequence >= 2**32:
                raise ValueError('Invalid inference sequence')
            scores = struct.unpack('<100f', f.bytes(3, 400))
            if not all(math.isfinite(v) and v <= .000001 for v in scores) or abs(sum(math.exp(v) for v in scores)-1) > .001:
                raise ValueError('Unexpected handwriting scores; expected 100 normalized log-probabilities')
            self.last_sample = now
            if self.ready:
                self.ready.set()
            if self.state['phase'] != 'listening':
                return
            best = self.decoder.consume(sequence, timestamp, scores)
            self.status(samples=self.state['samples']+1, text=self.decoder.text, raw=self.decoder.raw,
                        gaps=self.decoder.gaps, latest_class=best,
                        confidence=math.exp(scores[best]) if best is not None else None)
        except Exception as exc:
            self.sample_error = str(exc)
            if self.ready:
                self.ready.set()

    async def start(self):
        if not self.band or not self.original_receive:
            raise ValueError('Connect a compatible real band first')
        if self.active or self.journal.exists():
            raise ValueError('Stop the active session or reconnect to finish restoring settings')
        self.decoder = TextDecoder()
        self.sample_error = None
        self.ready = asyncio.Event()
        self.status(phase='preparing', message='Finding and verifying handwriting settings…', verified=False, samples=0, text='', raw='', gaps=0)
        self.task = asyncio.create_task(self.run())

    async def restore(self, snapshot):
        self.status(phase='restoring', message='Restoring and verifying the band’s previous settings…', verified=False)
        if not self.band or snapshot.get('device_id') != self.band.id:
            raise ValueError('The original band is not connected')
        # Re-discover by name before recovery; IDs can move with firmware updates.
        ids = await asyncio.wait_for(self.discover(), 45)
        errors = []
        for which in (1, 0):
            for attempt in range(2):
                try:
                    await self.setting(ids[which], which)  # Establish this firmware’s value type.
                    await self.write_verified(ids[which], which, snapshot['values'][which])
                    break
                except Exception as exc:
                    if attempt:
                        errors.append(str(exc))
        try:
            flags = await self.streams()
            # Restore only handwriting flags; preserve the current app's normal sensor subscription.
            flags.update({n: snapshot['flags'].get(str(n), snapshot['flags'].get(n, 0)) for n in (4,22,23)})
            await self.streams(flags)
        except Exception as exc:
            errors.append(str(exc))
        if errors:
            raise ValueError('; '.join(errors))
        self.journal.unlink(missing_ok=True)

    async def run(self):
        snapshot = None
        problem = None
        try:
            ids = await asyncio.wait_for(self.discover(), 45)
            values = [await self.setting(ident, which) for which,ident in enumerate(ids)]
            if values[0] not in (0,1) or not 0 <= values[1] < 65536:
                raise ValueError('Unsupported original handwriting settings')
            self.check_model_support(ids[1])
            flags = await self.streams()
            snapshot = {'version':1, 'device_id':self.band.id, 'values':values, 'flags':flags}
            self.persist(snapshot)  # Durable BEFORE a request that might mutate the band.
            await self.streams({**flags, 4:1, 22:1, 23:1})
            await self.write_verified(ids[0], 0, 1)
            await self.write_verified(ids[1], 1, 5)
            self.ready.clear()
            self.status(phase='waiting', message='Waiting for the band’s handwriting output…')
            await asyncio.wait_for(self.ready.wait(), 8)
            if self.sample_error:
                raise ValueError(self.sample_error)
            self.status(phase='listening', message='Write with your index finger on a surface. Stops automatically after two minutes.')
            deadline = time.monotonic()+120
            while time.monotonic() < deadline:
                await asyncio.sleep(.25)
                if self.sample_error:
                    raise ValueError(self.sample_error)
                if time.monotonic()-self.last_sample > 3:
                    raise ValueError('The band stopped sending handwriting samples')
        except asyncio.CancelledError:
            pass
        except asyncio.TimeoutError:
            problem = 'Timed out waiting for native handwriting. This firmware may not support this mode.'
        except Exception as exc:
            problem = str(exc)
        finally:
            if snapshot is not None:
                try:
                    await self.restore(snapshot)
                except Exception as exc:
                    self.status(phase='restore_required', message=f'Restoration could not be verified: {exc}. Reconnect this band to retry.', verified=False)
                    return
            self.status(phase='error' if problem else 'idle', message=problem or 'Stopped. Previous band settings verified.', verified=True)

    async def stop(self):
        if self.task and not self.task.done():
            # Multiple callers can stop at once (page leave + disconnect). Never cancel restoration.
            if self.state['phase'] != 'restoring':
                self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                # A stop can beat the new task's first instruction / finally block.
                self.status(phase='restore_required' if self.journal.exists() else 'idle',
                            verified=not self.journal.exists(),
                            message='Reconnect this band to restore settings.' if self.journal.exists() else 'Stopped before changing band settings.')
        self.task = None

    def clear(self):
        self.decoder.clear()
        self.status(text='', raw='')
