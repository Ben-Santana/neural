import math
import unittest
from python.shortcuts import ShortcutEngine, valid_app_action, valid_action_step

class AdjustTests(unittest.TestCase):
    def setUp(self):
        self.now = 1.
        self.sent = []
        self.engine = ShortcutEngine(self.sent.append, lambda: self.now)
        self.action = dict(type='adjust', movement='rotation', axis='y', sensitivity=5,
                           increase=dict(key='ArrowUp', modifiers=[]),
                           decrease=dict(key='ArrowDown', modifiers=[]))
        self.configure()

    def configure(self, combo=False):
        assignment = dict(id='combo-adjust' if combo else 'hold-index', enabled=True, appAction=self.action)
        if combo:
            assignment.update(steps=[dict(gesture='tap-middle'), dict(gesture='hold-index')], intervalMs=500)
        self.engine.configure([assignment])
        self.engine.suspended = False

    def orientation(self, degrees, sign=1):
        angle = math.radians(degrees)/2
        self.engine.ingest(dict(type='Orientation', values=[sign*math.cos(angle),0,sign*math.sin(angle),0]))

    def hold(self):
        self.engine.ingest(dict(type='Gesture', derived_action='buttonHold', finger='index'))

    def release(self):
        self.engine.ingest(dict(type='Gesture', action='release', finger='index'))

    def move(self, degrees, dt=.1):
        self.now += dt
        self.orientation(degrees)

    def test_move_stop_reverse_release(self):
        self.orientation(0)
        self.hold()
        self.move(24)
        self.assertEqual([s['key'] for s in self.sent], ['ArrowUp']*2)
        self.move(24)
        self.assertEqual(len(self.sent),2)
        self.move(12)
        self.assertEqual(self.sent[-1]['key'],'ArrowDown')
        self.release()
        self.move(60)
        self.assertEqual(len(self.sent),3)

    def test_tick_only_for_delivered_steps(self):
        ticks = []
        self.engine.on_adjust = lambda: ticks.append(True)
        self.orientation(0)
        self.hold()
        self.move(24)
        self.assertEqual(len(ticks), 2)
        self.move(24)
        self.assertEqual(len(ticks), 2)
        self.engine.deliver = lambda output: False
        self.move(12)
        self.assertEqual(len(ticks), 2)
        self.release()
        self.move(60)
        self.assertEqual(len(ticks), 2)

    def test_sensitivity_changes_repeats(self):
        counts=[]
        for sensitivity in (1, 6):
            self.action['sensitivity']=sensitivity
            self.configure()
            self.sent.clear()
            self.orientation(0)
            self.hold()
            for angle in range(10,101,10):
                self.move(angle)
            counts.append(len(self.sent))
        self.assertEqual(counts,[5,10])

    def test_combo_waits_for_last_hold_and_stops_on_release(self):
        self.configure(combo=True)
        self.orientation(0)
        self.engine.recognize('tap-middle')
        self.assertIsNone(self.engine.adjustment)
        self.now += .1
        self.hold()
        self.assertIsNotNone(self.engine.adjustment)
        self.move(24)
        self.assertEqual(len(self.sent),2)
        self.release()
        self.assertIsNone(self.engine.adjustment)

    def test_release_before_buffered_combo_cannot_arm(self):
        self.configure(combo=True)
        # A real raw tap is still unresolved when the hold and release arrive.
        self.engine.ingest(dict(type='Gesture', action='tap', finger='middle'))
        self.now += .1
        self.hold()
        self.now += .1
        self.release()
        self.now += .4
        self.engine.flush()
        self.assertIsNone(self.engine.adjustment)

    def test_stale_suspend_and_reset_stop(self):
        for stop in ('stale','suspend','reset'):
            self.configure()
            self.orientation(0)
            self.hold()
            if stop=='stale': self.now += .6
            if stop=='suspend': self.engine.suspended=True
            if stop=='reset': self.engine.reset()
            self.move(60)
            self.assertEqual(self.sent,[])
            self.assertIsNone(self.engine.adjustment)

    def test_invalid_binding_and_nested_adjust_rejected(self):
        self.assertTrue(valid_app_action(self.action))
        self.assertFalse(valid_action_step(self.action))
        self.engine.configure([dict(id='tap-index', enabled=True, appAction=self.action)])
        self.assertEqual(self.engine.assignments,{})
        for value in (0,11,True,float('nan')):
            self.assertFalse(valid_app_action(dict(self.action,sensitivity=value)))

    def test_quaternion_sign_does_not_generate_rotation(self):
        self.orientation(0)
        self.hold()
        self.now += .1
        self.orientation(0,sign=-1)
        self.assertEqual(self.sent,[])

    def test_rate_limited_without_backlog(self):
        self.action['sensitivity']=10
        self.configure()
        self.orientation(0)
        self.hold()
        self.move(150,.01)
        self.assertEqual(len(self.sent),4)
        for _ in range(20): self.move(150,.01)
        self.assertEqual(len(self.sent),4)

    def test_gyro_movement_and_final_hold_ownership(self):
        self.action['movement']='movement'
        self.configure()
        self.hold()
        self.now += .1
        self.engine.ingest(dict(type='Gyroscope',values=[0,600,0]))
        self.assertEqual(len(self.sent),1)
        self.engine.ingest(dict(type='Gesture', action='release',finger='middle'))
        self.assertIsNotNone(self.engine.adjustment)
        self.release()
        self.assertIsNone(self.engine.adjustment)

    def test_action_outputs_and_legacy_shortcuts(self):
        outputs = [
            dict(type='macos-action', action='volume-up'),
            dict(type='api-call', method='POST', url='https://example.com/adjust', headers={}, body='', timeoutMs=1000),
            dict(type='change-profile', profileId='other'),
            dict(type='move-profile', direction='down'),
            dict(type='open-profile-picker'),
            dict(type='shortcut', shortcut=dict(key='A', modifiers=['command'])),
            dict(type='sequence', actions=[dict(type='shortcut', shortcut=dict(key='A',modifiers=[])), dict(type='macos-action',action='volume-up')]),
        ]
        for output in outputs:
            self.action['increase'] = output
            self.assertTrue(valid_app_action(self.action), output)
            self.configure()
            self.sent.clear()
            self.orientation(0)
            self.hold()
            self.move(12)
            expected = output['shortcut'] if output['type']=='shortcut' else {'appAction':output}
            self.assertEqual(self.sent, [expected])
            self.release()
            self.move(48)
            self.assertEqual(self.sent, [expected])

    def test_nested_adjustment_rejected(self):
        nested=dict(self.action)
        self.action['increase']=nested
        self.assertFalse(valid_app_action(self.action))

    def test_output_that_suspends_stops_current_burst(self):
        self.action['increase']=dict(type='open-profile-picker')
        self.configure()
        self.orientation(0)
        self.hold()
        def deliver(output):
            self.sent.append(output)
            self.engine.picker_open=True
        self.engine.deliver=deliver
        self.move(120)
        self.assertEqual(len(self.sent),1)

    def test_removed_direction_does_not_fire_other_direction(self):
        self.action['increase']=None
        self.assertTrue(valid_app_action(self.action))
        self.configure()
        self.orientation(0)
        self.hold()
        self.move(24)
        self.assertEqual(self.sent, [])
        self.move(0)
        self.assertEqual([s['key'] for s in self.sent], ['ArrowDown']*2)
