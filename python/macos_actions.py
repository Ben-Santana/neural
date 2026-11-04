"""Curated macOS actions. No user supplied script or shell commands."""
import ctypes
import subprocess
import sys

ACTIONS = ('click', 'click-hold', 'right-click', 'open-app', 'volume-up', 'volume-down', 'mute', 'brightness-up',
           'brightness-down', 'close-window', 'quit-app', 'minimize-window',
           'hide-app', 'show-desktop', 'sleep-display', 'open-shortcuts')


class _AudioAddress(ctypes.Structure):
    _fields_ = [('selector', ctypes.c_uint32), ('scope', ctypes.c_uint32), ('element', ctypes.c_uint32)]


def _fourcc(code):
    return int.from_bytes(code.encode('ascii'), 'big')


_OUTPUT = _fourcc('outp')
_GLOBAL = _fourcc('glob')
_VOLUME = _fourcc('vmvc')
_CHANNEL_VOLUME = _fourcc('volm')
_MUTE = _fourcc('mute')
_coreaudio = None


def coreaudio():
    global _coreaudio
    if sys.platform != 'darwin':
        raise RuntimeError('These actions are available on macOS only.')
    if _coreaudio is None:
        library = ctypes.CDLL('/System/Library/Frameworks/CoreAudio.framework/CoreAudio')
        address = ctypes.POINTER(_AudioAddress)
        library.AudioObjectHasProperty.argtypes = [ctypes.c_uint32, address]
        library.AudioObjectHasProperty.restype = ctypes.c_uint8
        library.AudioObjectGetPropertyData.argtypes = [ctypes.c_uint32, address, ctypes.c_uint32, ctypes.c_void_p, ctypes.POINTER(ctypes.c_uint32), ctypes.c_void_p]
        library.AudioObjectGetPropertyData.restype = ctypes.c_int32
        library.AudioObjectSetPropertyData.argtypes = [ctypes.c_uint32, address, ctypes.c_uint32, ctypes.c_void_p, ctypes.c_uint32, ctypes.c_void_p]
        library.AudioObjectSetPropertyData.restype = ctypes.c_int32
        _coreaudio = library
    return _coreaudio


def _audio(selector, scope):
    return _AudioAddress(selector, scope, 0)


def _output_device(library):
    address = _audio(_fourcc('dOut'), _GLOBAL)
    size = ctypes.c_uint32(4)
    device = ctypes.c_uint32()
    if library.AudioObjectGetPropertyData(1, ctypes.byref(address), 0, None, ctypes.byref(size), ctypes.byref(device)) != 0 or not device.value:
        raise RuntimeError('macOS could not find the output device.')
    return device.value


def _volume_selector(library, device):
    for selector in (_VOLUME, _CHANNEL_VOLUME):
        if library.AudioObjectHasProperty(device, ctypes.byref(_audio(selector, _OUTPUT))):
            return selector
    raise RuntimeError('macOS could not change the output volume.')


def _read(library, device, selector, kind):
    address = _audio(selector, _OUTPUT)
    size = ctypes.c_uint32(ctypes.sizeof(kind))
    value = kind()
    if library.AudioObjectGetPropertyData(device, ctypes.byref(address), 0, None, ctypes.byref(size), ctypes.byref(value)) != 0:
        raise RuntimeError('macOS could not read the output volume.')
    return value.value


def _write(library, device, selector, value):
    address = _audio(selector, _OUTPUT)
    if library.AudioObjectSetPropertyData(device, ctypes.byref(address), 0, None, ctypes.sizeof(value), ctypes.byref(value)) != 0:
        raise RuntimeError('macOS could not change the output volume.')


def adjust_output_volume(delta):
    library = coreaudio()
    device = _output_device(library)
    selector = _volume_selector(library, device)
    level = max(0.0, min(1.0, _read(library, device, selector, ctypes.c_float) + delta / 100.0))
    if library.AudioObjectHasProperty(device, ctypes.byref(_audio(_MUTE, _OUTPUT))):
        _write(library, device, _MUTE, ctypes.c_uint32(0))
    _write(library, device, selector, ctypes.c_float(level))


_display_services = None


def display_services():
    global _display_services
    if sys.platform != 'darwin':
        raise RuntimeError('These actions are available on macOS only.')
    if _display_services is None:
        library = ctypes.CDLL('/System/Library/PrivateFrameworks/DisplayServices.framework/DisplayServices')
        library.DisplayServicesGetBrightness.argtypes = [ctypes.c_uint32, ctypes.POINTER(ctypes.c_float)]
        library.DisplayServicesGetBrightness.restype = ctypes.c_int
        library.DisplayServicesSetBrightness.argtypes = [ctypes.c_uint32, ctypes.c_float]
        library.DisplayServicesSetBrightness.restype = ctypes.c_int
        _display_services = library
    return _display_services


def adjust_display_brightness(delta):
    library = display_services()
    current = ctypes.c_float()
    if library.DisplayServicesGetBrightness(1, ctypes.byref(current)) != 0:
        raise RuntimeError('Brightness requires a supported display.')
    level = max(0.0, min(1.0, current.value + delta / 100.0))
    if library.DisplayServicesSetBrightness(1, ctypes.c_float(level)) != 0:
        raise RuntimeError('Brightness requires a supported display.')


def toggle_output_mute():
    library = coreaudio()
    device = _output_device(library)
    if not library.AudioObjectHasProperty(device, ctypes.byref(_audio(_MUTE, _OUTPUT))):
        raise RuntimeError('macOS could not change the output volume.')
    _write(library, device, _MUTE, ctypes.c_uint32(0 if _read(library, device, _MUTE, ctypes.c_uint32) else 1))


def valid_macos_action(action):
    return (isinstance(action, dict) and action.get('type') == 'macos-action'
            and action.get('action') in ACTIONS
            and (action['action'] != 'open-app' or
                 (isinstance(action.get('app'), str) and 0 < len(action['app'].strip()) <= 256
                  and not any(ord(c) < 32 for c in action['app']))))


def execute_macos_action(action):
    if not valid_macos_action(action):
        raise ValueError('Invalid macOS action.')
    if sys.platform != 'darwin':
        raise RuntimeError('These actions are available on macOS only.')
    name = action['action']
    if name == 'click-hold':
        try:
            from .mouse import toggle_hold
        except ImportError:
            from mouse import toggle_hold
        toggle_hold()
        return
    if name in ('click', 'right-click'):
        try:
            from .mouse import pointer
        except ImportError:
            from mouse import pointer
        pointer(button='right' if name == 'right-click' else 'left')
        return
    if name in ('volume-up', 'volume-down'):
        adjust_output_volume(6 if name == 'volume-up' else -6)
        return
    if name == 'mute':
        toggle_output_mute()
        return
    if name in ('brightness-up', 'brightness-down'):
        adjust_display_brightness(6 if name == 'brightness-up' else -6)
        return
    if name in ('open-app', 'open-shortcuts'):
        subprocess.run(['/usr/bin/open', '-a', action['app'].strip() if name == 'open-app' else 'Shortcuts'], check=True, capture_output=True, timeout=15)
        return
    if name == 'sleep-display':
        subprocess.run(['/usr/bin/pmset', 'displaysleepnow'], check=True, capture_output=True, timeout=15)
        return
    scripts = {
        'close-window': 'tell application "System Events" to keystroke "w" using command down',
        'quit-app': 'tell application "System Events" to keystroke "q" using command down',
        'minimize-window': 'tell application "System Events" to set value of attribute "AXMinimized" of front window of first application process whose frontmost is true to true',
        'hide-app': 'tell application "System Events" to set visible of first application process whose frontmost is true to false',
        'show-desktop': 'tell application "System Events" to key code 103',
    }
    subprocess.run(['/usr/bin/osascript', '-e', scripts[name]], check=True, capture_output=True, timeout=15)
