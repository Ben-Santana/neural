import unittest
from python.shortcuts import valid_app_action, valid_action_step, valid_adjust_output, ShortcutEngine

class RadialTests(unittest.TestCase):
    def setUp(self):
        self.output = {'type': 'shortcut', 'shortcut': {'key': 'K', 'modifiers': ['command']}}
        self.action = {'type': 'radial-menu', 'items': [{'id': 'one', 'output': self.output}]}

    def test_validation_and_no_recursive_menus(self):
        self.assertTrue(valid_app_action(self.action))
        self.assertFalse(valid_action_step(self.action))
        self.assertFalse(valid_adjust_output(self.action))
        for items in ([], self.action['items'] * 2, [{'id': 'bad', 'output': self.action}], [{'id': 'bad', 'output': {'key': 'invalid', 'modifiers': []}}]):
            self.assertFalse(valid_app_action({'type': 'radial-menu', 'items': items}))

    def test_optional_icon_validation(self):
        self.action['items'][0]['icon'] = 'star'
        self.assertTrue(valid_app_action(self.action))
        for icon in (None, 3, 'x' * 65):
            self.action['items'][0]['icon'] = icon
            self.assertFalse(valid_app_action(self.action))

    def test_optional_name_validation(self):
        for name in ('', 'Open library', 'x' * 80):
            self.action['items'][0]['name'] = name
            self.assertTrue(valid_app_action(self.action))
        for name in (None, 3, 'x' * 81):
            self.action['items'][0]['name'] = name
            self.assertFalse(valid_app_action(self.action))

    def test_optional_angle_validation(self):
        for angle in (0, 1.5, 6.28):
            self.action['items'][0]['angle'] = angle
            self.assertTrue(valid_app_action(self.action))
        for angle in (None, '1', True, -1, 6.3, float('nan'), float('inf')):
            self.action['items'][0]['angle'] = angle
            self.assertFalse(valid_app_action(self.action))

    def test_assignment_survives_configuration(self):
        sent = []
        engine = ShortcutEngine(sent.append)
        engine.configure([{'id': 'swipe-left', 'enabled': True, 'appAction': self.action}])
        self.assertEqual(engine.assignments['swipe-left'], {'appAction': self.action})
