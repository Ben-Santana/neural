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

    @patch('python.macos_actions.sys.platform', 'darwin')
    @patch('python.macos_actions.subprocess.run')
    def test_volume_execution(self, run):
        execute_macos_action({'type': 'macos-action', 'action': 'volume-up'})
        self.assertEqual(run.call_args.args[0][0], '/usr/bin/osascript')
        self.assertIn('output volume', run.call_args.args[0][2])
