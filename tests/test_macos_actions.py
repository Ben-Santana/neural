import unittest
from unittest.mock import patch
from python.macos_actions import valid_macos_action, execute_macos_action
from python.shortcuts import valid_app_action


class MacActionTests(unittest.TestCase):
    def test_validation(self):
        for action in ('volume-up', 'minimize-window', 'brightness-down'):
            self.assertTrue(valid_app_action({'type': 'macos-action', 'action': action}))
        for action in ({'type': 'macos-action', 'action': 'shell'},
                       {'type': 'macos-action', 'action': 'open-app', 'app': ''},
                       {'type': 'macos-action', 'action': 'open-app', 'app': 'A\nB'}):
            self.assertFalse(valid_macos_action(action))

    @patch('python.macos_actions.sys.platform', 'darwin')
    @patch('python.macos_actions.subprocess.run')
    def test_app_name_is_argument(self, run):
        execute_macos_action({'type': 'macos-action', 'action': 'open-app', 'app': 'Calendar'})
        self.assertEqual(run.call_args.args[0], ['/usr/bin/open', '-a', 'Calendar'])

    @patch('python.macos_actions.subprocess.run')
    @patch('python.macos_actions.adjust_output_volume')
    @patch('python.macos_actions.toggle_output_mute')
    def test_volume_uses_core_audio(self, mute, adjust, run):
        execute_macos_action({'type': 'macos-action', 'action': 'volume-up'})
        execute_macos_action({'type': 'macos-action', 'action': 'volume-down'})
        execute_macos_action({'type': 'macos-action', 'action': 'mute'})
        self.assertEqual(adjust.call_args_list[0].args, (6,))
        self.assertEqual(adjust.call_args_list[1].args, (-6,))
        mute.assert_called_once()
        run.assert_not_called()

    @patch('python.macos_actions.subprocess.run')
    @patch('python.macos_actions.adjust_display_brightness')
    def test_brightness_is_set_directly(self, adjust, run):
        execute_macos_action({'type': 'macos-action', 'action': 'brightness-up'})
        execute_macos_action({'type': 'macos-action', 'action': 'brightness-down'})
        self.assertEqual(adjust.call_args_list[0].args, (6,))
        self.assertEqual(adjust.call_args_list[1].args, (-6,))
        run.assert_not_called()

    def test_brightness_ignores_the_action_limit(self):
        from python.bridge import Bridge
        bridge = Bridge()
        for _ in range(4):
            bridge.api_slots.acquire()
        with patch('python.bridge.execute_macos_action') as execute, patch('python.bridge.emit'):
            self.assertTrue(bridge.deliver_shortcut({'appAction': {'type': 'macos-action', 'action': 'brightness-down'}}))
        execute.assert_called_once()

    def test_volume_ignores_the_action_limit(self):
        from python.bridge import Bridge
        bridge = Bridge()
        for _ in range(4):
            bridge.api_slots.acquire()
        with patch('python.bridge.execute_macos_action') as execute, patch('python.bridge.emit'):
            self.assertTrue(bridge.deliver_shortcut({'appAction': {'type': 'macos-action', 'action': 'volume-up'}}))
        execute.assert_called_once()
