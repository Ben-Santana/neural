"""Curated macOS actions. No user supplied script or shell commands."""
import subprocess
import sys

ACTIONS = ('open-app', 'volume-up', 'volume-down', 'mute', 'brightness-up',
           'brightness-down', 'close-window', 'quit-app', 'minimize-window',
           'hide-app', 'show-desktop', 'sleep-display', 'open-shortcuts')


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
    if name in ('open-app', 'open-shortcuts'):
        subprocess.run(['/usr/bin/open', '-a', action['app'].strip() if name == 'open-app' else 'Shortcuts'], check=True, capture_output=True, timeout=15)
        return
    if name == 'sleep-display':
        subprocess.run(['/usr/bin/pmset', 'displaysleepnow'], check=True, capture_output=True, timeout=15)
        return
    scripts = {
        'volume-up': 'set volume output volume ((output volume of (get volume settings)) + 6)',
        'volume-down': 'set volume output volume ((output volume of (get volume settings)) - 6)',
        'mute': 'set volume output muted (not (output muted of (get volume settings)))',
        'brightness-up': 'tell application "System Events" to key code 144',
        'brightness-down': 'tell application "System Events" to key code 145',
        'close-window': 'tell application "System Events" to keystroke "w" using command down',
        'quit-app': 'tell application "System Events" to keystroke "q" using command down',
        'minimize-window': 'tell application "System Events" to set value of attribute "AXMinimized" of front window of first application process whose frontmost is true to true',
        'hide-app': 'tell application "System Events" to set visible of first application process whose frontmost is true to false',
        'show-desktop': 'tell application "System Events" to key code 103',
    }
    subprocess.run(['/usr/bin/osascript', '-e', scripts[name]], check=True, capture_output=True, timeout=15)
