import math
import unittest
from unittest.mock import patch
from python.shortcuts import ShortcutEngine, valid_app_action, valid_action_step, valid_adjust_output
from python.macos_actions import valid_macos_action, execute_macos_action

class MouseTests(unittest.TestCase):
    def setUp(self):
        self.now = 1.
        self.sent = []
        self.engine = ShortcutEngine(self.sent.append, lambda: self.now)
        self.action = dict(type='mouse-movement', movement='rotation', plane='xy')
        self.engine.configure([dict(id='combo-mouse', enabled=True, appAction=self.action,
            steps=[dict(gesture='tap-index'),dict(gesture='tap-middle')], intervalMs=500)])
        self.engine.suspended = False

    def combo(self):
        self.engine.recognize('tap-index')
        self.now += .1
        self.engine.recognize('tap-middle')
        self.now += .31
        self.engine.flush()

    def orientation(self, angle):
        self.now += .05
        a = math.radians(angle)/2
        self.engine.ingest(dict(type='Orientation', values=[math.cos(a),math.sin(a),0,0]))

    def test_combo_toggles_and_moves(self):
        self.orientation(0)
        self.combo()
        self.assertIsNotNone(self.engine.mouse)
        self.orientation(2)
        self.assertGreater(self.sent[-1]['mouseMove']['dx'],0)
        self.now += .5
        self.combo()
        self.assertIsNone(self.engine.mouse)
        count = len(self.sent)
        self.orientation(8)
        self.assertEqual(len(self.sent),count)

    def test_stop_and_stale_rebase(self):
        self.orientation(0)
        self.combo()
        self.now += 1
        self.orientation(40)
        self.assertEqual(self.sent,[])
        self.orientation(41)
        self.assertTrue(self.sent)
        self.engine.suspended = True
        self.engine.flush()
        self.assertIsNone(self.engine.mouse)
        self.engine.reset()
        self.assertIsNone(self.engine.mouse)

    def test_validation(self):
        self.assertTrue(valid_app_action(self.action))
        self.assertFalse(valid_action_step(self.action))
        self.assertFalse(valid_adjust_output(self.action))
        self.assertFalse(valid_app_action(dict(self.action,plane='xx')))
        self.engine.configure([dict(id='tap-index', enabled=True,appAction=self.action)])
        self.assertIn('tap-index', self.engine.assignments)

    def test_click_dispatch(self):
        for name,button in [('click','left'),('right-click','right')]:
            action = dict(type='macos-action',action=name)
            self.assertTrue(valid_macos_action(action))
            with patch('python.macos_actions.sys.platform','darwin'), patch('python.mouse.pointer') as pointer:
                execute_macos_action(action)
                pointer.assert_called_once_with(button=button)

    def test_gyro_movement_and_picker_stop(self):
        self.action['movement'] = 'movement'
        self.combo()
        self.now += .05
        self.engine.ingest(dict(type='Gyroscope',values=[100,0,0]))
        self.assertGreater(self.sent[-1]['mouseMove']['dx'],0)
        count = len(self.sent)
        self.now += .05
        self.engine.ingest(dict(type='Gyroscope',values=[0,0,0]))
        self.assertEqual(len(self.sent), count)
        self.engine.picker_open = True
        self.engine.flush()
        self.assertIsNone(self.engine.mouse)

    def test_individual_gestures_toggle(self):
        from python.shortcuts import MOTIONS
        for gesture in MOTIONS:
            with self.subTest(gesture=gesture):
                self.engine.configure([dict(id=gesture, enabled=True, appAction=self.action)])
                self.engine.suspended = False
                self.engine.trigger(gesture)
                self.assertIsNotNone(self.engine.mouse)
                self.now += .4
                self.engine.trigger(gesture)
                self.assertIsNone(self.engine.mouse)

    def test_independent_rotation_and_movement_inputs(self):
        self.action.clear()
        self.action.update(type='mouse-movement',right=dict(movement='rotation',axis='x'),
                           up=dict(movement='movement',axis='z'))
        self.assertTrue(valid_app_action(self.action))
        self.orientation(0)
        self.combo()
        self.orientation(2)
        self.assertGreater(self.sent[-1]['mouseMove']['dx'],0)
        self.assertEqual(self.sent[-1]['mouseMove']['dy'],0)
        self.now += .05
        self.engine.ingest(dict(type='Gyroscope',values=[500,0,100]))
        self.assertEqual(self.sent[-1]['mouseMove']['dx'],0)
        self.assertLess(self.sent[-1]['mouseMove']['dy'],0)
        self.now += .05
        self.engine.ingest(dict(type='Gyroscope',values=[0,0,-100]))
        self.assertGreater(self.sent[-1]['mouseMove']['dy'],0)
        self.action['up']['axis']='invalid'
        self.assertFalse(valid_app_action(self.action))

    def test_reversed_inputs_move_left_and_down(self):
        self.action.clear()
        self.action.update(type='mouse-movement',
                           right=dict(movement='rotation',axis='x',inverted=True),
                           up=dict(movement='movement',axis='z',inverted=True))
        self.assertTrue(valid_app_action(self.action))
        self.orientation(0)
        self.combo()
        self.orientation(2)
        self.assertLess(self.sent[-1]['mouseMove']['dx'],0)
        self.assertEqual(self.sent[-1]['mouseMove']['dy'],0)
        self.now += .05
        self.engine.ingest(dict(type='Gyroscope',values=[0,0,100]))
        self.assertEqual(self.sent[-1]['mouseMove']['dx'],0)
        self.assertGreater(self.sent[-1]['mouseMove']['dy'],0)
        self.action['up']['inverted']='yes'
        self.assertFalse(valid_app_action(self.action))


class MouseHoldTests(unittest.TestCase):
    def test_toggle_release_and_drag(self):
        from python import mouse
        with patch.object(mouse, '_held', False), patch.object(mouse, '_pointer') as send:
            mouse.toggle_hold()
            self.assertTrue(mouse._held)
            send.assert_called_with(button='left', kinds=[1])
            mouse.toggle_hold()
            self.assertFalse(mouse._held)
            send.assert_called_with(button='left', kinds=[2])
            mouse.toggle_hold()
            mouse.release_hold()
            self.assertFalse(mouse._held)
            count = send.call_count
            mouse.release_hold()
            self.assertEqual(send.call_count, count)

    def test_hold_action_dispatch(self):
        action = dict(type='macos-action', action='click-hold')
        self.assertTrue(valid_app_action(action))
        with patch('python.macos_actions.sys.platform', 'darwin'), patch('python.mouse.toggle_hold') as toggle:
            execute_macos_action(action)
            toggle.assert_called_once_with()

    def test_held_movement_posts_drag(self):
        from python import mouse
        from unittest.mock import MagicMock
        cg = MagicMock()
        cg.CGEventGetLocation.return_value = mouse.Point(10, 20)
        with patch.object(mouse, '_held', True), patch.object(mouse, 'api', return_value=cg):
            mouse.pointer(dx=5, dy=3)
            args = cg.CGEventCreateMouseEvent.call_args.args
            self.assertEqual(args[1], 6)
            self.assertEqual((args[2].x, args[2].y), (15, 23))
