import math
import unittest
from python.air_gestures import similarity, wrist_point, valid_air
from python.shortcuts import ShortcutEngine, valid_steps

SHAPE = [[0,0],[.3,0],[.3,.1],[.2,.1],[.2,.4]]
LINE = [[0,0],[.3,0]]

def air(points=SHAPE, duration=1000, minimum=75):
    return {'gesture':'air','air':{'name':'Shape','points':points,'minSimilarity':minimum,'durationMs':duration}}

def combo(ident, step=None, tail=None):
    return {'id':'combo-'+ident,'enabled':True,'shortcut':{'key':'C','modifiers':['command']},
            'steps':[{'gesture':'double-tap-index'},step or air()]+(tail or []),'intervalMs':500}

class AirGestureTests(unittest.TestCase):
    def setUp(self):
        self.now = 0.
        self.sent, self.recognized = [], []
        self.engine = ShortcutEngine(lambda mapping:self.sent.append(mapping),lambda:self.now,on_recognized=self.recognized.append)
        self.engine.suspended = False

    def orientation(self,x=0,y=0):
        # A unit quaternion taking +Y to [x,sqrt(1-x²-y²),-y].
        forward = math.sqrt(1-x*x-y*y)
        w = math.sqrt((1+forward)/2)
        self.engine.ingest({'type':'Orientation','values':[w,-y/(2*w),0,-x/(2*w)]})

    def arm(self):
        self.orientation()
        self.engine.recognize('double-tap-index')

    def trace(self, points=SHAPE, duration=.98):
        # 40 samples, evenly along the template's individual segments.
        for i in range(41):
            t=i/40*(len(points)-1)
            j=min(int(t),len(points)-2)
            x,y=[a+(t-j)*(b-a) for a,b in zip(points[j],points[j+1])]
            self.now += duration/41
            self.orientation(x,y)

    def finish(self, at=1.1):
        self.now=at
        self.engine.flush()

    def test_validation_requires_non_air_predecessor(self):
        self.assertTrue(valid_steps(combo('a')['steps']))
        for steps in [[air(),{'gesture':'tap-index'}],[{'gesture':'tap-index'},air(),air()]]:
            self.assertFalse(valid_steps(steps))
        for field,value in [('points',[[0,0],[0,0]]),('points',[[0,0],[float('nan'),0]]),('minSimilarity',0),('durationMs',10001)]:
            value_air=air()['air'];value_air[field]=value
            self.assertFalse(valid_air(value_air))

    def test_math_and_coordinate_parity(self):
        self.assertEqual(similarity(SHAPE,SHAPE),100)
        self.assertLess(similarity(SHAPE,LINE),75)
        self.assertLess(similarity(SHAPE,list(reversed(SHAPE))),75)
        for angle in [-100,-37,0,37,100]:
            c,s=math.cos(math.radians(angle)),math.sin(math.radians(angle))
            rotated=[[2*(x*c-y*s)+8,2*(x*s+y*c)-5] for x,y in SHAPE]
            self.assertEqual(similarity(SHAPE,rotated),100)
        self.assertIsNone(similarity(SHAPE,[[0,0],[0,0]]))
        self.assertEqual(wrist_point([1,0,0,0],[1,0,0,0]),(0,0))

    def test_no_recording_without_preceding_gesture(self):
        self.engine.configure([combo('a')])
        self.trace();self.finish()
        self.assertEqual(self.sent,[])
        self.assertEqual(self.engine.air_captures,{})

    def test_match_delivers_after_explicit_window_not_combo_interval(self):
        self.engine.configure([combo('a')]);self.arm();self.trace()
        self.assertEqual(self.sent,[])
        self.finish()
        self.assertEqual(len(self.sent),1)
        self.assertIn('combo-a',self.recognized)
        self.finish(2)
        self.assertEqual(len(self.sent),1)

    def test_highest_similarity_wins_regardless_of_assignment_order(self):
        for reverse in [False,True]:
            self.setUp()
            entries=[combo('line',air(LINE,minimum=1)),combo('shape')]
            self.engine.configure(list(reversed(entries)) if reverse else entries)
            self.arm();self.trace();self.finish()
            self.assertEqual(len(self.sent),1)
            self.assertIn('combo-shape',self.recognized)
            self.assertNotIn('combo-line',self.recognized)

    def test_different_windows_wait_for_competitors(self):
        self.engine.configure([combo('line',air(LINE,2000,1)),combo('shape')])
        self.arm();self.trace();self.finish(1.1)
        self.assertEqual(self.sent,[])
        # Continue sending stationary orientation until the longer window closes.
        for i in range(20):
            self.now=1.1+i*.045;self.orientation(.2,.4)
        self.finish(2.1)
        self.assertEqual(len(self.sent),1)
        self.assertIn('combo-shape',self.recognized)

    def test_unnamed_shapes_and_legacy_named_shapes_are_valid(self):
        step=air();step['air'].pop('name')
        self.assertTrue(valid_steps(combo('unnamed',step)['steps']))
        self.assertTrue(valid_steps(combo('legacy')['steps']))

    def preview_engine(self):
        self.previews=[]
        self.results=[]
        self.engine.on_air_result=self.results.append
        self.engine.on_air_preview=self.previews.append
        self.engine.air_preview_enabled=True
        self.engine.configure([combo('a')])

    def test_preview_is_opt_in_and_only_while_armed(self):
        self.previews=[];self.engine.on_air_preview=self.previews.append
        self.engine.configure([combo('a')]);self.arm();self.trace()
        self.assertEqual(self.previews,[])
        self.engine.reset();self.preview_engine();self.arm()
        self.assertTrue(self.previews[-1]['active'])
        self.assertEqual(self.previews[-1]['points'][0],[0.,0.])
        self.trace()
        points=self.previews[-1]['points']
        self.assertGreater(len(points),10)
        self.assertAlmostEqual(points[-1][0],self.engine.air_captures[next(iter(self.engine.air_captures))]['points'][-1][1][0])
        self.finish(self.now+.2)
        self.assertEqual(self.previews[-1],{'active':False})

    def test_preview_hides_on_reset_suspend_stream_gap_and_disable(self):
        for reason in ['reset','suspend','gap','disable','unexpected']:
            self.setUp();self.preview_engine();self.arm()
            self.assertTrue(self.previews[-1]['active'])
            if reason=='reset':self.engine.reset()
            elif reason=='suspend':self.engine.suspended=True;self.engine.flush()
            elif reason=='gap':self.now=.6;self.engine.flush()
            elif reason=='disable':self.engine.air_preview_enabled=False;self.engine.publish_air_preview()
            else:self.engine.recognize('tap-middle')
            self.assertEqual(self.previews[-1],{'active':False},reason)

    def test_result_success_and_failure_are_reported_once(self):
        for points,expected in [(SHAPE,'success'),(LINE,'failure')]:
            self.setUp();self.preview_engine();self.arm();self.trace(points);self.finish()
            self.assertEqual(len(self.results),1)
            self.assertEqual(self.results[0]['result'],expected)
            self.assertEqual(self.results[0]['points'][0],[0.,0.])
            self.engine.flush();self.assertEqual(len(self.results),1)

    def test_competing_shapes_report_one_winning_result(self):
        self.preview_engine();self.engine.configure([combo('line',air(LINE,minimum=1)),combo('shape')])
        self.arm();self.trace();self.finish()
        self.assertEqual(len(self.results),1)
        self.assertEqual(self.results[0]['result'],'success')
        self.assertTrue(self.results[0]['attemptId'].startswith('combo-shape:'))

    def test_early_failure_reports_once_but_suspension_is_silent(self):
        for reason in ['unexpected','gap','suspend']:
            self.setUp();self.preview_engine();self.arm()
            if reason=='unexpected':self.engine.recognize('tap-middle')
            elif reason=='gap':self.now=.6;self.engine.flush()
            else:self.engine.suspended=True;self.engine.reset()
            self.assertEqual(len(self.results),0 if reason=='suspend' else 1)
            self.finish(1.2)
            self.assertEqual(len(self.results),0 if reason=='suspend' else 1)

    def test_preview_ignores_unassigned_and_missing_orientation(self):
        self.preview_engine();disabled=combo('a');disabled['enabled']=False
        self.engine.configure([disabled]);self.arm()
        self.assertEqual(self.previews,[])
        self.engine.configure([combo('a')]);self.engine.recognize('double-tap-index')
        self.assertEqual(self.previews,[])

    def test_disabled_competitor_does_not_delay_enabled_mapping(self):
        disabled=combo('disabled',air(SHAPE,10000));disabled['enabled']=False
        self.engine.configure([disabled,combo('enabled',air(LINE,1000,1))])
        self.arm();self.trace();self.finish()
        self.assertEqual(len(self.sent),1)
        self.assertIn('combo-enabled',self.recognized)

    def test_below_threshold_and_no_motion_do_not_fire(self):
        for points in [LINE,[[0,0],[0,0]]]:
            self.setUp();self.engine.configure([combo('shape')]);self.arm();self.trace(points);self.finish()
            self.assertEqual(self.sent,[])

    def test_interrupted_stream_and_missing_reference_do_not_fire(self):
        self.engine.configure([combo('a')]);self.arm();self.trace(duration=.2);self.finish(1.1)
        self.assertEqual(self.sent,[])
        self.setUp();self.engine.configure([combo('a')]);self.engine.recognize('double-tap-index');self.trace();self.finish()
        self.assertEqual(self.sent,[])

    def test_next_gesture_after_air_uses_normal_combo_timing(self):
        self.engine.configure([combo('a',tail=[{'gesture':'tap-middle'}])]);self.arm();self.trace();self.finish()
        self.assertEqual(self.sent,[])
        self.now=1.2;self.engine.recognize('tap-middle')
        self.assertEqual(len(self.sent),1)

    def test_reconfigure_reset_and_suspension_gate_delivery(self):
        self.engine.configure([combo('a')]);self.arm();self.trace();self.engine.suspended=True;self.finish()
        self.assertEqual(self.sent,[])
        self.engine.configure([combo('a')]);self.assertEqual(self.engine.air_captures,{})

    def test_unexpected_finger_input_cancels_capture(self):
        self.engine.configure([combo('a')]);self.arm();self.trace(duration=.2)
        self.engine.recognize('tap-middle');self.finish()
        self.assertEqual(self.sent,[])
        self.assertEqual(self.engine.air_captures,{})

if __name__ == '__main__':
    unittest.main()
