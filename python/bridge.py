"""Line-delimited JSON transport. Stdout contains protocol messages only."""
import asyncio
import dataclasses
import enum
import json
import sys
import time
import threading
import urllib.error
if __package__:
    from .macos_actions import execute_macos_action
    from .api_calls import execute_api_call
    from .shortcuts import MacKeyboard, ShortcutEngine, valid_app_action
else:
    try:
        from macos_actions import execute_macos_action
        from api_calls import execute_api_call
        from shortcuts import MacKeyboard, ShortcutEngine, valid_app_action
    except ModuleNotFoundError:
        from python.macos_actions import execute_macos_action
        from python.api_calls import execute_api_call
        from python.shortcuts import MacKeyboard, ShortcutEngine, valid_app_action


def normalize(value):
    if dataclasses.is_dataclass(value):
        return {f.name: normalize(getattr(value, f.name)) for f in dataclasses.fields(value)}
    if isinstance(value, bytes):
        return {"encoding": "hex", "data": value.hex()}
    if isinstance(value, enum.Enum):
        return value.value
    if isinstance(value, dict):
        return {str(k): normalize(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [normalize(v) for v in value]
    return value


def packet(event):
    data = normalize(event)
    data['type'] = type(event).__name__
    for name in ('finger', 'action', 'derived_action'):
        if hasattr(event, name):
            data[name] = getattr(event, name)
    return data


def emit(kind, **data):
    print(json.dumps({"kind": kind, **data}), flush=True)


class Bridge:
    def __init__(self):
        self.session = None
        self.pending = []
        self.band = None
        self.keyboard = MacKeyboard()
        self.shortcut_error = None
        self.api_slots = threading.BoundedSemaphore(4)
        self.shortcuts = ShortcutEngine(self.deliver_shortcut, on_recognized=lambda motion: emit('motion', motion=motion), on_progress=lambda candidates: emit('combo_progress', candidates=candidates), on_input=lambda event: emit('gesture_input', input=event), on_outcome=lambda outcome: emit('combo_outcome', **outcome))

    def deliver_shortcut(self, shortcut):
        if 'appAction' in shortcut:
            if shortcut['appAction'].get('type') == 'sequence':
                if not valid_app_action(shortcut['appAction']):
                    return
                if self.api_slots.acquire(blocking=False):
                    threading.Thread(target=self.deliver_sequence, args=(shortcut['appAction'],), daemon=True).start()
                else:
                    emit('error', message='Action sequence skipped: four actions are already running.')
                return
            if shortcut['appAction'].get('type') == 'macos-action':
                if self.api_slots.acquire(blocking=False):
                    threading.Thread(target=self.deliver_macos_action, args=(shortcut['appAction'],), daemon=True).start()
                else:
                    emit('error', message='macOS action skipped: four actions are already running.')
                return
            if shortcut['appAction'].get('type') == 'api-call':
                if self.api_slots.acquire(blocking=False):
                    threading.Thread(target=self.deliver_api_call, args=(shortcut['appAction'],), daemon=True).start()
                else:
                    emit('api_result', ok=False, message='API call skipped: four requests are already running.')
                return
            if shortcut['appAction'].get('type') == 'open-profile-picker':
                self.shortcuts.picker_open = True
            emit('app_action', action=shortcut['appAction'])
            return
        try:
            self.keyboard.send(shortcut)
            self.shortcut_error = None
        except Exception as exc:
            # Delivery failure must not stop recognition or its visual feedback.
            message = str(exc)
            if message != self.shortcut_error:
                emit('error', message=message)
            self.shortcut_error = message

    def deliver_sequence(self, action):
        try:
            for step in action['actions']:
                kind = step['type']
                if kind == 'shortcut':
                    self.keyboard.send(step['shortcut'])
                elif kind == 'macos-action':
                    execute_macos_action(step)
                elif kind == 'api-call':
                    status = execute_api_call(step)
                    emit('api_result', ok=True, status=status)
                else:
                    emit('app_action', action=step)
                # Give the target app time to process each completed step.
                time.sleep(.1)
        except Exception:
            emit('error', message='Action sequence stopped because an action failed. Check its configuration and macOS permissions.')
        finally:
            self.api_slots.release()

    def deliver_macos_action(self, action):
        try:
            execute_macos_action(action)
        except Exception:
            emit('error', message='macOS action failed. Check the app name and macOS Accessibility / Automation permissions. Brightness requires a supported display.')
        finally:
            self.api_slots.release()

    def deliver_api_call(self, action):
        try:
            status = execute_api_call(action)
            emit('api_result', ok=True, status=status)
        except urllib.error.HTTPError as exc:
            emit('api_result', ok=False, message=f'API call returned HTTP {exc.code}.')
            exc.close()
        except Exception:
            # Do not expose tokens, URLs, or response bodies in diagnostics.
            emit('api_result', ok=False, message='API call failed. Check the endpoint, connection, and timeout.')
        finally:
            self.api_slots.release()

    async def disconnect(self):
        self.shortcuts.reset()
        if self.session:
            self.session.cancel()
            try:
                await self.session
            except asyncio.CancelledError:
                pass
            self.session = None

    @staticmethod
    def needs_enrollment(error):
        from meta_neural_py.errors import IdentityMismatch, IdentityStoreError, RequestTimeout
        return (isinstance(error, IdentityMismatch)
                or isinstance(error, IdentityStoreError) and 'No verified identity saved' in str(error)
                or isinstance(error, RequestTimeout) and error.stage == 'trust')

    async def enroll(self, device_id, allow_missing_band_key=None):
        from meta_neural_py import Band
        emit('state', state='enrolling')
        try:
            if allow_missing_band_key is None:
                from meta_neural_py.identity.keychain import KeychainIdentityStore
                identity = KeychainIdentityStore().load(device_id)
                allow_missing_band_key = bool(identity and identity.allow_missing_band_key)
            await Band.enroll(device_id, allow_missing_band_key=allow_missing_band_key)
            emit('enrolled', device_id=device_id)
        except asyncio.CancelledError:
            emit('state', state='disconnected')
            raise
        except Exception as exc:
            emit('error', message=f'{type(exc).__name__}: {exc}')
            emit('state', state='disconnected')
            return
        await self.stream(device_id, recover_identity=False)

    async def stream(self, device_id, recover_identity=True):
        recover = False
        allow_missing = False
        try:
            from meta_neural_py import Band, Streams
            emit('state', state='connecting')
            async with Band(device_id) as band:
                self.band = band
                emit('device', info=normalize(band.device_info), verified=band.band_verified,
                     hand=await band.read_hand(), battery=normalize(await band.read_battery()))
                async with band.subscribe(Streams(gestures=True, gyro=True, orientation=True, emg=True)) as events:
                    emit('state', state='connected')
                    last_flush = time.monotonic()
                    last_battery = last_flush
                    async for event in events:
                        data = packet(event)
                        self.shortcuts.ingest(data)
                        self.pending.append(data)
                        now = time.monotonic()
                        if now-last_flush >= 1/30:
                            emit('events', events=self.pending, stats=normalize(band.stats))
                            self.pending = []
                            last_flush = now
                        if now-last_battery >= 30:
                            emit('battery', battery=normalize(await band.read_battery()))
                            last_battery = now
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            recover = recover_identity and self.needs_enrollment(exc)
            if recover:
                # Preserve the existing proof policy; recovery never weakens it.
                try:
                    from meta_neural_py.identity.keychain import KeychainIdentityStore
                    identity = KeychainIdentityStore().load(device_id)
                    allow_missing = bool(identity and identity.allow_missing_band_key)
                except Exception:
                    pass
                emit('identity_recovery', device_id=device_id,
                     message='The saved band identity could not connect. Sign in with Meta to enroll this Mac again.')
            else:
                emit('error', message=f'{type(exc).__name__}: {exc}')
        finally:
            if self.pending:
                emit('events', events=self.pending)
                self.pending = []
            self.band = None
            emit('state', state='disconnected')
        if recover:
            await self.enroll(device_id, allow_missing)

    async def command(self, command):
        action = command.get('action')
        if action == 'configure_shortcuts':
            self.shortcuts.configure(command.get('assignments', []))
        elif action == 'profile_picker':
            self.shortcuts.picker_open = command.get('open') is True
            self.shortcuts.reset()
        elif action == 'suspend_shortcuts':
            self.shortcuts.suspended = command.get('suspended') is not False
            self.shortcuts.reset()
        elif action == 'discover':
            from meta_neural_py import Band
            emit('devices', devices=normalize(await Band.discover(timeout=5)), request_id=command.get('request_id'))
        elif action == 'connect':
            await self.disconnect()
            self.session = asyncio.create_task(self.stream(command['device_id']))
        elif action == 'enroll':
            await self.disconnect()
            self.session = asyncio.create_task(self.enroll(command['device_id'], command.get('allow_missing_band_key')))
        elif action == 'disconnect':
            await self.disconnect()
        elif action == 'shutdown':
            await self.disconnect()
            return False
        return True


async def main():
    bridge = Bridge()
    emit('ready')
    try:
        while line := await asyncio.to_thread(sys.stdin.readline):
            try:
                if not await bridge.command(json.loads(line)):
                    break
            except Exception as exc:
                emit('error', message=f'{type(exc).__name__}: {exc}')
    finally:
        await bridge.disconnect()


if __name__ == '__main__':
    asyncio.run(main())
