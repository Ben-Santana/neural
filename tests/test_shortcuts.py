import math
import unittest
from python.shortcuts import ShortcutEngine, MacKeyboard, KEY_CODES, valid_shortcut
from unittest.mock import Mock, patch

class ShortcutTests(unittest.TestCase):
    def setUp(self):
        self.now = 0
        self.sent = []
        self.engine = ShortcutEngine(self.sent.append, lambda: self.now)
        self.engine.configure([{'id':m,'enabled':True,'shortcut':{'key':k,'modifiers':['command']}} for m,k in [('tap-index','C'),('tap-middle','V'),('double-tap-index','Z'),('double-tap-middle','B'),('swipe-left','ArrowLeft')]])
        self.engine.suspended = False
    def gesture(self,action,derived='unknown',finger='index'):
        self.engine.ingest({'type':'Gesture','action':action,'derived_action':derived,'finger':finger})
    def test_picker_blocks_shortcuts_but_keeps_tap_recognition(self):
        recognized = []
        self.engine.on_recognized = recognized.append
        self.engine.picker_open = True
        self.gesture('tap')
        self.now = .15
        self.gesture('doubletap', 'doubleTap')
        self.now = 1
        self.engine.flush()
        self.assertEqual(recognized, ['double-tap-index'])
        self.assertEqual(self.sent, [])
        self.engine.picker_open = False
        self.gesture('left')
        self.assertEqual(len(self.sent), 1)

    def test_taps_cannot_be_picker_openers(self):
        for motion in ('tap-index', 'tap-middle', 'double-tap-index', 'double-tap-middle'):
            self.engine.configure([{'id':motion,'enabled':True,'appAction':{'type':'open-profile-picker'}}])
            self.assertNotIn(motion, self.engine.assignments)

    def test_picker_opener_still_recognized_while_picker_open(self):
        recognized = []
        self.engine.on_recognized = recognized.append
        self.engine.configure([{'id':'swipe-left','enabled':True,'appAction':{'type':'open-profile-picker'}}])
        self.engine.picker_open = True
        self.gesture('left')
        self.assertEqual(recognized, ['swipe-left'])
        self.assertEqual(self.sent, [])

    def test_picker_action_is_deliverable(self):
        self.engine.configure([{'id':'swipe-left','enabled':True,'appAction':{'type':'open-profile-picker'}}])
        self.gesture('left')
        self.assertEqual(self.sent, [{'appAction':{'type':'open-profile-picker'}}])

    def test_mac_codes(self):
        self.assertEqual(KEY_CODES['C'],8)
        self.assertEqual(KEY_CODES['Q'],12)
        self.assertEqual(KEY_CODES['P'],35)
        self.assertEqual(KEY_CODES['1'],18)
    def test_swipe_layers_fire_once(self):
        self.gesture('left')
        self.gesture('unknown','buttonLeft')
        self.assertEqual(len(self.sent),1)
    def test_vertical_swipes_deduplicate_raw_and_derived(self):
        self.engine.configure([{'id':'swipe-'+direction,'enabled':True,
            'shortcut':{'key':key,'modifiers':[]}} for direction,key in [('up','ArrowUp'),('down','ArrowDown')]])
        for direction in ('up','down'):
            self.gesture(direction)
            self.gesture('unknown','button'+direction.title())
        self.assertEqual([s['key'] for s in self.sent],['ArrowUp','ArrowDown'])

    def test_vertical_swipe_combo(self):
        self.combo([{'gesture':'swipe-up'},{'gesture':'swipe-down'}])
        self.gesture('up')
        self.now = .2
        self.gesture('unknown','buttonDown')
        self.finish()
        self.assertEqual([s['key'] for s in self.sent],['R'])

    def test_double_tap_cancels_single(self):
        self.gesture('tap','singleTap')
        self.now = .15
        self.gesture('doubletap','doubleTap')
        self.now = 1
        self.engine.flush()
        self.assertEqual([s['key'] for s in self.sent],['Z'])
    def test_single_tap_delayed_and_deduplicated(self):
        self.gesture('tap')
        self.gesture('unknown','singleTap')
        self.now = .7
        self.engine.flush()
        self.assertEqual([s['key'] for s in self.sent],['C'])
    def combo(self, steps, interval=500):
        self.engine.configure([{'id':'combo-test','enabled':True,'steps':steps,'intervalMs':interval,'shortcut':{'key':'R','modifiers':[]}}])
    def finish(self):
        self.now += .31
        self.engine.flush()
    def test_middle_double_tap(self):
        self.gesture('tap',finger='middle')
        self.now = .15
        self.gesture('doubletap',finger='middle')
        self.finish()
        self.assertEqual([s['key'] for s in self.sent],['B'])
    def test_combo_tap_then_rotation_axis(self):
        self.combo([{'gesture':'tap-index'},{'gesture':'rotation','axis':'x'}])
        self.engine.ingest({'type':'Orientation','values':[1,0,0,0]})
        self.gesture('tap')
        self.now = .2
        self.engine.ingest({'type':'Orientation','values':[math.cos(.3),math.sin(.3),0,0]})
        self.finish()
        self.assertEqual([s['key'] for s in self.sent],['R'])
    def test_rotation_direction_on_each_axis(self):
        for axis in 'xyz':
            for selected in ('left', 'right', 'any', None):
                for actual, sign in [('left', -1), ('right', 1)]:
                    for quaternion_sign in (1, -1):
                        with self.subTest(axis=axis, selected=selected, actual=actual, quaternion_sign=quaternion_sign):
                            self.setUp()
                            rotation = {'gesture':'rotation', 'axis':axis}
                            if selected is not None:
                                rotation['direction'] = selected
                            self.combo([{'gesture':'tap-index'}, rotation])
                            self.engine.ingest({'type':'Orientation','values':[1,0,0,0]})
                            self.gesture('tap')
                            self.now = .2
                            q = [math.cos(.3),0,0,0]
                            q['xyz'.index(axis)+1] = sign*math.sin(.3)
                            self.engine.ingest({'type':'Orientation','values':[v*quaternion_sign for v in q]})
                            self.finish()
                            self.assertEqual(len(self.sent), int(selected in (None, 'any', actual)))

    def test_rotation_direction_at_combo_start(self):
        self.combo([{'gesture':'rotation','axis':'x','direction':'left'}, {'gesture':'swipe-up'}])
        self.engine.recognize('rotation','x',direction='right')
        self.now = .1
        self.gesture('up')
        self.finish()
        self.assertEqual(self.sent, [])
        self.now = 1
        self.engine.recognize('rotation','x',direction='left')
        self.now = 1.1
        self.gesture('up')
        self.finish()
        self.assertEqual(len(self.sent), 1)

    def test_combo_timeout_and_wrong_axis(self):
        for delay,axis in [(.7,'x'),(.2,'y')]:
            self.sent.clear();self.now=0
            self.combo([{'gesture':'swipe-left'},{'gesture':'movement','axis':'x'}])
            self.gesture('left');self.now=delay
            self.engine.ingest({'type':'Gyroscope','values':[100 if a==axis else 0 for a in 'xyz']})
            self.finish();self.assertEqual(self.sent,[])
    def test_long_combo_with_repeated_steps_and_movement_rearm(self):
        self.combo([{'gesture':'movement','axis':'z'}]*4)
        for i in range(4):
            self.now=i*.2
            self.engine.ingest({'type':'Gyroscope','values':[0,0,100]})
            self.engine.ingest({'type':'Gyroscope','values':[0,0,100]})
            self.engine.ingest({'type':'Gyroscope','values':[0,0,0]})
        self.finish()
        self.assertEqual(len(self.sent),1)
    def test_double_tap_does_not_count_as_single_in_combo(self):
        self.combo([{'gesture':'tap-index'},{'gesture':'swipe-left'}])
        self.gesture('tap');self.now=.15;self.gesture('doubletap')
        self.now=.2;self.gesture('left');self.finish()
        self.assertEqual(self.sent,[])
    def test_hold_and_release_combo_for_both_fingers(self):
        for finger in ('index','middle'):
            self.sent.clear(); self.now = 0
            self.combo([{'gesture':'hold-'+finger},{'gesture':'swipe-left'},{'gesture':'release-'+finger}])
            self.gesture('unknown','buttonHold',finger)
            self.now = .1; self.gesture('left')
            self.now = .2; self.gesture('release','buttonRelease',finger)
            self.gesture('unknown','buttonHoldRelease',finger)
            self.finish()
            self.assertEqual(len(self.sent),1)

    def test_hold_steps_ignore_combo_timeout_for_both_fingers(self):
        for finger in ('index','middle'):
            with self.subTest(finger=finger):
                self.sent.clear(); self.now = 0
                self.combo([{'gesture':'hold-'+finger},{'gesture':'swipe-left'},
                            {'gesture':'release-'+finger},{'gesture':'swipe-right'}])
                self.gesture('unknown','buttonHold',finger)
                self.now = 10; self.gesture('left')
                self.now = 20; self.gesture('release',finger=finger)
                self.now = 20.2; self.gesture('right'); self.finish()
                self.assertEqual(len(self.sent),1)

    def test_combo_timeout_still_applies_before_and_after_holds(self):
        for hold_at, release_at, swipe_at in [(1,10,10.2),(.2,10,11)]:
            with self.subTest(hold_at=hold_at,swipe_at=swipe_at):
                self.sent.clear(); self.now = 0
                self.combo([{'gesture':'swipe-left'},{'gesture':'hold-index'},
                            {'gesture':'release-index'},{'gesture':'swipe-right'}])
                self.gesture('left')
                self.now = hold_at; self.gesture('unknown','buttonHold')
                self.now = release_at; self.gesture('release')
                self.now = swipe_at; self.gesture('right'); self.finish()
                self.assertEqual(self.sent,[])

    def test_overlapping_holds_pause_until_last_release(self):
        self.combo([{'gesture':'hold-index'},{'gesture':'hold-middle'},
                    {'gesture':'release-index'},{'gesture':'swipe-left'},
                    {'gesture':'release-middle'},{'gesture':'swipe-right'}])
        self.gesture('unknown','buttonHold')
        self.now = 10; self.gesture('unknown','buttonHold','middle')
        self.now = 20; self.gesture('release')
        self.now = 30; self.gesture('left')
        self.now = 40; self.gesture('release',finger='middle')
        self.now = 40.2; self.gesture('right'); self.finish()
        self.assertEqual(len(self.sent),1)

    def test_progress_reports_hold_release_and_expiration(self):
        updates = []
        self.engine.on_progress = updates.append
        self.combo([{'gesture':'hold-index'},{'gesture':'release-index'},
                    {'gesture':'swipe-left'}])
        self.gesture('unknown','buttonHold'); self.finish()
        self.assertEqual(updates[-1][0]['matched'],1)
        self.assertTrue(updates[-1][0]['holding'])
        self.now = 10; self.engine.flush()
        self.assertIsNone(updates[-1][0]['remainingMs'])
        self.gesture('release'); self.finish()
        self.assertEqual(updates[-1][0]['matched'],2)
        self.assertFalse(updates[-1][0]['holding'])
        self.assertGreater(updates[-1][0]['remainingMs'],0)
        self.now = 11; self.engine.flush()
        self.assertEqual(updates[-1],[])
        self.gesture('left'); self.finish()
        self.assertEqual(self.sent,[])

    def test_stream_ids_track_overlapping_attempts_and_outcomes(self):
        inputs, outcomes, progress = [], [], []
        self.engine.on_input = inputs.append
        self.engine.on_outcome = outcomes.append
        self.engine.on_progress = progress.append
        self.combo([{'gesture':'swipe-left'},{'gesture':'swipe-left'},{'gesture':'swipe-right'}])
        self.gesture('left'); self.now = .1; self.gesture('left'); self.finish()
        self.assertEqual(len(progress[-1]),2)
        self.assertEqual(progress[-1][0]['inputIds'],[inputs[0]['id'],inputs[1]['id']])
        self.assertEqual(progress[-1][1]['inputIds'],[inputs[1]['id']])
        self.now = .5; self.gesture('right'); self.finish()
        self.assertEqual(outcomes[0]['status'],'success')
        self.assertEqual(outcomes[0]['inputIds'],[event['id'] for event in inputs])
        self.assertEqual(outcomes[1]['status'],'failure')
        self.assertEqual(outcomes[1]['reason'],'Unexpected input')

    def test_stream_reports_non_motion_inputs_and_timeout_once(self):
        inputs, outcomes = [], []
        self.engine.on_input = inputs.append
        self.engine.on_outcome = outcomes.append
        self.combo([{'gesture':'hold-index'},{'gesture':'release-index'},{'gesture':'swipe-left'}])
        self.gesture('unknown','buttonHold')
        self.now = .1; self.gesture('release'); self.finish()
        self.assertEqual([event['gesture'] for event in inputs],['hold-index','release-index'])
        self.now = 2; self.engine.flush(); self.engine.flush()
        self.assertEqual(len(outcomes),1)
        self.assertEqual(outcomes[0]['reason'],'Timed out')
        self.assertEqual(outcomes[0]['inputIds'],[event['id'] for event in inputs])

    def test_incidental_motion_does_not_interrupt_two_taps_or_show_in_stream(self):
        inputs, outcomes = [], []
        self.engine.on_input = inputs.append
        self.engine.on_outcome = outcomes.append
        self.combo([{'gesture':'tap-index'},{'gesture':'tap-middle'}])
        self.gesture('tap')
        self.now = .1; self.engine.recognize('rotation','x')
        self.now = .2; self.engine.recognize('movement','y')
        self.now = .4; self.gesture('tap',finger='middle')
        self.now = 1; self.engine.flush()
        self.assertEqual([e['gesture'] for e in inputs],['tap-index','tap-middle'])
        self.assertEqual([e['status'] for e in outcomes],['success'])
        self.assertEqual(len(self.sent),1)

    def test_motion_is_only_visible_when_it_matches_the_current_step(self):
        inputs = []
        self.engine.on_input = inputs.append
        self.combo([{'gesture':'swipe-left'},{'gesture':'tap-index'},
                    {'gesture':'rotation','axis':'x'},{'gesture':'movement','axis':'z'}])
        self.engine.recognize('rotation','x'); self.finish()
        self.assertEqual(inputs,[])
        self.now = 1; self.gesture('left')
        self.now = 1.1; self.engine.recognize('rotation','x')
        self.now = 1.2; self.engine.recognize('movement','z')
        self.now = 1.3; self.gesture('tap')
        self.now = 1.4; self.engine.recognize('rotation','y')
        self.now = 1.5; self.engine.recognize('rotation','x')
        self.now = 1.6; self.engine.recognize('movement','x')
        self.now = 1.7; self.engine.recognize('movement','z'); self.finish()
        self.assertEqual([e['gesture'] for e in inputs],['swipe-left','tap-index','rotation','movement'])
        self.assertEqual([e['axis'] for e in inputs[-2:]],['x','z'])
        self.assertEqual(len(self.sent),1)

    def test_ignored_motion_does_not_extend_combo_timer(self):
        inputs, outcomes = [], []
        self.engine.on_input = inputs.append
        self.engine.on_outcome = outcomes.append
        self.combo([{'gesture':'swipe-left'},{'gesture':'swipe-right'}])
        self.gesture('left')
        self.now = .4; self.engine.recognize('movement','x')
        self.now = .8; self.gesture('right'); self.finish()
        self.assertEqual(self.sent,[])
        self.assertEqual(outcomes[0]['reason'],'Timed out')
        self.assertFalse(any(e['gesture']=='movement' for e in inputs))

    def test_early_release_cancels_hold_combo(self):
        self.combo([{'gesture':'hold-index'},{'gesture':'swipe-left'}])
        self.gesture('unknown','buttonHold')
        self.now = .1; self.gesture('release')
        self.now = .2; self.gesture('left'); self.finish()
        self.assertEqual(self.sent,[])

    def test_gestures_after_explicit_release(self):
        self.combo([{'gesture':'hold-index'},{'gesture':'release-index'},{'gesture':'swipe-left'}])
        self.gesture('unknown','buttonHold')
        self.now = .1; self.gesture('release')
        self.now = .2; self.gesture('left'); self.finish()
        self.assertEqual(len(self.sent),1)

    def test_overlapping_holds_require_both_fingers(self):
        self.combo([{'gesture':'hold-index'},{'gesture':'hold-middle'},{'gesture':'release-index'},{'gesture':'swipe-left'}])
        self.gesture('unknown','buttonHold')
        self.now = .1; self.gesture('unknown','buttonHold','middle')
        self.now = .2; self.gesture('release',finger='middle')
        self.now = .3; self.gesture('release')
        self.now = .4; self.gesture('left'); self.finish()
        self.assertEqual(self.sent,[])

    def test_invalid_combos_and_reset(self):
        self.combo([{'gesture':'rotation','axis':'bad'},{'gesture':'tap-index'}])
        self.assertEqual(self.engine.assignments,{})
        self.combo([{'gesture':'swipe-left'},{'gesture':'swipe-right'}])
        self.gesture('left');self.engine.reset();self.now=.2;self.gesture('right');self.finish()
        self.assertEqual(self.sent,[])
    def test_suspension_and_invalid_configuration(self):
        self.engine.suspended = True
        self.gesture('left')
        self.assertEqual(self.sent,[])
        self.engine.configure([{'id':'swipe-left','enabled':True,'shortcut':{'key':'BAD','modifiers':[]}}])
        self.assertEqual(self.engine.assignments,{})

    def test_recognition_without_enabled_or_configured_shortcut(self):
        recognized = []
        self.engine.on_recognized = recognized.append
        self.engine.configure([{'id':'swipe-left','enabled':False,'shortcut':None}])
        self.gesture('left')
        self.now = .5
        self.gesture('right')
        self.assertEqual(recognized,['swipe-left','swipe-right'])
        self.assertEqual(self.sent,[])

    def test_suspension_keeps_feedback_without_delivering_keys(self):
        recognized = []
        self.engine.on_recognized = recognized.append
        self.engine.suspended = True
        self.gesture('left')
        self.assertEqual(recognized,['swipe-left'])
        self.assertEqual(self.sent,[])

    def test_unconfigured_combo_still_recognized(self):
        recognized = []
        self.engine.on_recognized = recognized.append
        self.engine.configure([{'id':'combo-test','enabled':False,'shortcut':None,
            'steps':[{'gesture':'swipe-left'},{'gesture':'swipe-right'}],'intervalMs':500}])
        self.gesture('left')
        self.now = .2
        self.gesture('right')
        self.finish()
        self.assertIn('combo-test',recognized)
        self.assertEqual(self.sent,[])


class KeyboardChordTests(unittest.TestCase):
    def test_control_arrows_preserve_navigation_flags(self):
        for key in ('ArrowLeft','ArrowRight','ArrowUp','ArrowDown'):
            with self.subTest(key=key):
                keyboard = MacKeyboard()
                keyboard.cg = Mock()
                keyboard.cg.AXIsProcessTrusted.return_value = True
                keyboard.cg.CGEventCreateKeyboardEvent.side_effect = [101,102]
                with patch('python.shortcuts.sys.platform', 'darwin'):
                    keyboard.send({'key':key,'modifiers':['control']})
                self.assertEqual([call.args for call in keyboard.cg.CGEventSetFlags.call_args_list],
                                 [(101,0xa40000),(102,0xa40000)])

    def test_space_shortcuts_keep_only_requested_modifiers(self):
        for modifier, flags in [('command',1 << 20),('option',1 << 19)]:
            with self.subTest(modifier=modifier):
                keyboard = MacKeyboard()
                keyboard.cg = Mock()
                keyboard.cg.AXIsProcessTrusted.return_value = True
                keyboard.cg.CGEventCreateKeyboardEvent.side_effect = [101,102]
                with patch('python.shortcuts.sys.platform', 'darwin'):
                    keyboard.send({'key':'Space','modifiers':[modifier]})
                self.assertEqual([call.args for call in keyboard.cg.CGEventSetFlags.call_args_list],
                                 [(101,flags),(102,flags)])

    def test_chord_posts_all_down_then_reverse_up(self):
        keyboard = MacKeyboard()
        keyboard.cg = Mock()
        keyboard.cg.AXIsProcessTrusted.return_value = True
        keyboard.cg.CGEventCreateKeyboardEvent.side_effect = [101,102,103,104]
        with patch('python.shortcuts.sys.platform', 'darwin'):
            keyboard.send({'key':'S','keys':['S','K'],'modifiers':['command','shift']})
        self.assertEqual([call.args for call in keyboard.cg.CGEventCreateKeyboardEvent.call_args_list],
                         [(None,KEY_CODES['S'],True),(None,KEY_CODES['K'],True),
                          (None,KEY_CODES['K'],False),(None,KEY_CODES['S'],False)])
        self.assertEqual([call.args for call in keyboard.cg.CGEventPost.call_args_list],[(0,101),(0,102),(0,103),(0,104)])
        self.assertEqual(keyboard.cg.CFRelease.call_count,4)
    def test_allocation_failure_posts_no_partial_chord(self):
        keyboard = MacKeyboard()
        keyboard.cg = Mock()
        keyboard.cg.AXIsProcessTrusted.return_value = True
        keyboard.cg.CGEventCreateKeyboardEvent.side_effect = [101,None]
        with patch('python.shortcuts.sys.platform', 'darwin'):
            with self.assertRaises(RuntimeError):
                keyboard.send({'key':'S','keys':['S','K'],'modifiers':[]})
        keyboard.cg.CGEventPost.assert_not_called()
        keyboard.cg.CFRelease.assert_called_once_with(101)
    def test_legacy_and_multi_key_validation(self):
        self.assertTrue(valid_shortcut({'key':'C','modifiers':['command']}))
        self.assertTrue(valid_shortcut({'key':'S','keys':['S','K'],'modifiers':['command']}))
        for keys in [[],['S','S'],['S','BAD'],['K','S'],None]:
            self.assertFalse(valid_shortcut({'key':'S','keys':keys,'modifiers':[]}))
