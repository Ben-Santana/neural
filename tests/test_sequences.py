import unittest
from unittest.mock import patch
from python.shortcuts import valid_app_action, ShortcutEngine
from python.bridge import Bridge


class SequenceTests(unittest.TestCase):
    def setUp(self):
        self.steps = [{'type': 'shortcut', 'shortcut': {'key': key, 'modifiers': ['command'] if key != 'Backspace' else []}} for key in ['A', 'C', 'Backspace']]
        self.action = {'type': 'sequence', 'actions': self.steps}

    def test_validation_and_recognition(self):
        self.assertTrue(valid_app_action(self.action))
        for invalid in [[], self.steps[:1], self.steps * 6, [*self.steps, {'type': 'open-profile-picker'}], [*self.steps, self.action]]:
            self.assertFalse(valid_app_action({'type': 'sequence', 'actions': invalid}))
        delivered = []
        engine = ShortcutEngine(delivered.append)
        engine.configure([{'id': 'tap-index', 'enabled': True, 'appAction': self.action}])
        engine.suspended = False
        engine.trigger('tap-index')
        self.assertEqual(delivered, [{'appAction': self.action}])

    def test_mixed_execution_order(self):
        bridge = Bridge()
        order = []
        bridge.keyboard.send = lambda shortcut: order.append(shortcut['key'])
        steps = [*self.steps[:2], {'type': 'macos-action', 'action': 'mute'}, {'type': 'api-call'}, self.steps[2]]
        bridge.api_slots.acquire()
        with patch('python.bridge.execute_macos_action', side_effect=lambda a: order.append('mute')), patch('python.bridge.execute_api_call', side_effect=lambda a: order.append('api') or 200), patch('python.bridge.emit'), patch('python.bridge.time.sleep'):
            bridge.deliver_sequence({'type': 'sequence', 'actions': steps})
        self.assertEqual(order, ['A', 'C', 'mute', 'api', 'Backspace'])

    def test_failure_stops_remaining_steps(self):
        bridge = Bridge()
        bridge.keyboard.send = unittest.mock.Mock(side_effect=RuntimeError('failed'))
        bridge.api_slots.acquire()
        with patch('python.bridge.emit'), patch('python.bridge.time.sleep'):
            bridge.deliver_sequence(self.action)
        self.assertEqual(bridge.keyboard.send.call_count, 1)
