"""macOS key delivery and a conservative gesture recognizer. No simulated packets enter here."""
try:
    from .macos_actions import valid_macos_action
except ImportError:
    from macos_actions import valid_macos_action
try:
    from .api_calls import valid_api_action
except ImportError:
    from api_calls import valid_api_action

import ctypes
import math
import sys
import time

KEY_CODES = dict(zip('ASDFHGZXCV', range(10)))
KEY_CODES.update(dict(zip('BQWERYT123465=97-80]OU[IP', range(11,36))))
KEY_CODES.update({'Enter':36,'L':37,'J':38,"'":39,'K':40,';':41,'\\':42,',':43,'/':44,'N':45,'M':46,'.':47,'Tab':48,'Space':49,'`':50,'Backspace':51,'Escape':53,'Delete':117,'ArrowLeft':123,'ArrowRight':124,'ArrowDown':125,'ArrowUp':126})
KEY_CODES.update(dict(zip([f'F{i}' for i in range(1,13)],[122,120,99,118,96,97,98,100,101,109,103,111])))
FLAGS = {'command':1<<20,'shift':1<<17,'option':1<<19,'control':1<<18}
# Arrow events carry numeric-pad and secondary-Fn flags even on laptop keyboards.
# Mission Control needs these key-specific flags to recognize Control–arrow.
ARROW_FLAGS = (1 << 21) | (1 << 23)
MOTIONS = {'swipe-left','swipe-right','swipe-up','swipe-down','tap-index','tap-middle','double-tap-index','double-tap-middle','hold-index','hold-middle'}
COMBO_TIMES = {200,300,500,750,1000,1500,2000,3000,5000}

def active_holds(steps):
    held = set()
    for step in steps:
        gesture = step.get('gesture', '')
        if gesture.startswith('hold-'):
            finger = gesture[5:]
            if finger in held:
                return None
            held.add(finger)
        elif gesture.startswith('release-'):
            finger = gesture[8:]
            if finger not in held:
                return None
            held.remove(finger)
    return held

def valid_steps(steps):
    return (isinstance(steps,list) and 2 <= len(steps) <= 8
            and all(isinstance(s,dict) and (s.get('direction') is None or (s.get('gesture') == 'rotation' and s.get('direction') in ('left','right','any'))) and (s.get('gesture') in MOTIONS
                    or s.get('gesture') in ('release-index','release-middle')
                    or (s.get('gesture') in ('rotation','movement') and s.get('axis') in ('x','y','z'))) for s in steps)
            and active_holds(steps) is not None)

def shortcut_keys(shortcut):
    return shortcut.get('keys', [shortcut.get('key')])

def valid_shortcut(shortcut):
    if not isinstance(shortcut, dict):
        return False
    keys = shortcut_keys(shortcut)
    return (isinstance(keys, list) and 0 < len(keys) <= len(KEY_CODES)
            and all(isinstance(k, str) and k in KEY_CODES for k in keys)
            and len(set(keys)) == len(keys) and keys[0] == shortcut.get('key')
            and isinstance(shortcut.get('modifiers'), list)
            and all(isinstance(m, str) and m in FLAGS for m in shortcut['modifiers']))

def valid_action_step(action):
    return isinstance(action, dict) and (valid_shortcut(action.get('shortcut')) if action.get('type') == 'shortcut' else action.get('type') not in ('sequence', 'open-profile-picker') and valid_app_action(action))

def valid_app_action(action):
    return isinstance(action, dict) and ((action.get('type') == 'sequence' and isinstance(action.get('actions'), list) and 2 <= len(action['actions']) <= 16 and all(valid_action_step(step) for step in action['actions'])) or valid_macos_action(action) or valid_api_action(action) or action.get('type') == 'open-profile-picker' or (action.get('type') == 'move-profile' and action.get('direction') in ('up', 'down')) or (action.get('type') == 'change-profile' and isinstance(action.get('profileId'), str) and bool(action['profileId'])))

class MacKeyboard:
    def __init__(self):
        self.cg = None
    def send(self, shortcut):
        if sys.platform != 'darwin':
            raise RuntimeError('Keyboard shortcuts are available on macOS only.')
        if self.cg is None:
            self.cg = ctypes.CDLL('/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices')
            self.cg.AXIsProcessTrusted.restype = ctypes.c_bool
            self.cg.CGEventCreateKeyboardEvent.argtypes = [ctypes.c_void_p,ctypes.c_uint16,ctypes.c_bool]
            self.cg.CGEventCreateKeyboardEvent.restype = ctypes.c_void_p
            self.cg.CGEventSetFlags.argtypes = [ctypes.c_void_p,ctypes.c_uint64]
            self.cg.CGEventPost.argtypes = [ctypes.c_uint32,ctypes.c_void_p]
            self.cg.CFRelease.argtypes = [ctypes.c_void_p]
        if not self.cg.AXIsProcessTrusted():
            raise RuntimeError('Enable Accessibility for Neural and its Python helper in System Settings to send shortcuts.')
        flags = sum(FLAGS[m] for m in set(shortcut['modifiers']))
        keys = shortcut_keys(shortcut)
        events = []
        try:
            # Build the full sequence before posting so allocation errors cannot leave keys held.
            for down, chord in ((True, keys), (False, reversed(keys))):
                for key in chord:
                    event = self.cg.CGEventCreateKeyboardEvent(None,KEY_CODES[key],down)
                    if not event:
                        raise RuntimeError('macOS could not create a keyboard event.')
                    events.append(event)
                    self.cg.CGEventSetFlags(event, flags | (ARROW_FLAGS if key.startswith('Arrow') else 0))
            for event in events:
                self.cg.CGEventPost(0,event)
        finally:
            for event in events:
                self.cg.CFRelease(event)

class ShortcutEngine:
    def __init__(self, deliver, clock=time.monotonic, on_recognized=None, on_progress=None, on_input=None, on_outcome=None):
        self.deliver, self.clock = deliver, clock
        self.on_recognized = on_recognized or (lambda motion: None)
        self.on_progress = on_progress or (lambda candidates: None)
        self.on_input = on_input or (lambda event: None)
        self.on_outcome = on_outcome or (lambda outcome: None)
        self.input_sequence = 0
        self.assignments = {}
        self.combos = {}
        self.suspended = True
        self.picker_open = False
        self.reset()

    def configure(self, assignments):
        self.assignments, self.combos = {}, {}
        for a in assignments if isinstance(assignments,list) else []:
            if not isinstance(a,dict):
                continue
            ident = a.get('id')
            is_combo = isinstance(ident,str) and ident.startswith('combo-') and valid_steps(a.get('steps')) and a.get('intervalMs') in COMBO_TIMES
            if is_combo:
                self.combos[ident] = a
            if (a.get('appAction') or {}).get('type') == 'open-profile-picker' and isinstance(ident, str) and (ident.startswith('tap-') or ident.startswith('double-tap-')):
                continue
            if (ident in MOTIONS or is_combo) and a.get('enabled') is True and (valid_shortcut(a.get('shortcut')) or valid_app_action(a.get('appAction'))):
                self.assignments[ident] = {'appAction': a['appAction']} if valid_app_action(a.get('appAction')) else a['shortcut']
        self.reset()

    def reset(self):
        self.pending = {}
        self.orientation = None
        self.rotation_origin = None
        self.movement_active = set()
        self.progress = {}
        self.combo_events = []
        self.held_fingers = set()
        self.last = {}
        self.last_event = {}
        self.last_progress = []
        self.on_progress([])

    def trigger(self, motion):
        now = self.clock()
        if self.picker_open or self.suspended or motion not in self.assignments or now-self.last.get(motion,-100) < .35:
            return
        self.last[motion] = now
        self.deliver(self.assignments[motion])

    def recognize(self, gesture, axis=None, at=None, direction=None):
        now = self.clock() if at is None else at
        token = (gesture,axis,direction)
        # Raw and derived gesture layers describe the same physical action.
        if now-self.last_event.get(token,-100) < .08:
            return
        self.last_event[token] = now
        if gesture in MOTIONS:
            self.on_recognized(gesture)
        self.trigger(gesture)
        self.input_sequence += 1
        ident = self.input_sequence
        if gesture not in ('rotation','movement'):
            self.on_input({'id':ident,'gesture':gesture,'axis':axis,'at':now})
        self.combo_events.append((now,gesture,axis,ident,direction))

    def advance_combos(self, now, gesture, axis, input_id, direction=None):
        def matches(step):
            return (gesture == step['gesture'] and axis == step.get('axis')
                    and (gesture != 'rotation' or step.get('direction', 'any') == 'any'
                         or step.get('direction') == direction))
        continuous = gesture in ('rotation','movement')
        if continuous:
            # Only surface motion when it starts or advances a real candidate.
            relevant = any(
                matches(combo['steps'][0])
                or any(matches(combo['steps'][index])
                       and now >= previous
                       and (active_holds(combo['steps'][:index]) or now-previous <= combo['intervalMs']/1000)
                       for index, previous, inputs in self.progress.get(ident,[]))
                for ident, combo in self.combos.items())
            if relevant:
                self.on_input({'id':input_id,'gesture':gesture,'axis':axis,'at':now})
        for ident, combo in self.combos.items():
            steps = combo['steps']
            candidates = []
            for index, previous, inputs in self.progress.get(ident,[]):
                if continuous and not matches(steps[index]):
                    # Incidental motion neither breaks a combo nor extends its timer.
                    candidates.append((index,previous,inputs))
                    continue
                if gesture.startswith('release-') and gesture != steps[index]['gesture']:
                    # An early release invalidates every candidate requiring that hold.
                    if gesture[8:] not in active_holds(steps[:index]):
                        candidates.append((index,previous,inputs))
                    else:
                        self.finish_candidate(ident, inputs, 'failure', 'Released early')
                    continue
                # Time spent inside an active hold does not limit the next step,
                # including its release. Timing resumes after the last release.
                held = active_holds(steps[:index])
                in_time = now >= previous and (held or now-previous <= combo['intervalMs']/1000)
                if in_time and matches(steps[index]):
                    if index+1 == len(steps):
                        self.finish_candidate(ident, inputs+[input_id], 'success', 'Combo complete')
                        self.on_recognized(ident)
                        self.trigger(ident)
                    else:
                        candidates.append((index+1,now,inputs+[input_id]))
                else:
                    self.finish_candidate(ident, inputs, 'failure', 'Unexpected input' if in_time else 'Timed out')
            if matches(steps[0]):
                candidates.append((1,now,[input_id]))
            self.progress[ident] = candidates

    def finish_candidate(self, ident, inputs, status, reason):
        self.on_outcome({'id':ident,'attemptId':f'{ident}:{inputs[0]}',
                         'inputIds':inputs,'status':status,'reason':reason})

    def publish_progress(self):
        # Events are buffered for 300 ms; expire on that same recognition clock.
        now = self.clock()-.3
        tracked = []
        for ident, candidates in self.progress.items():
            combo = self.combos[ident]
            interval = combo['intervalMs']/1000
            live = []
            for index, at, inputs in candidates:
                if active_holds(combo['steps'][:index]) or now-at <= interval:
                    live.append((index,at,inputs))
                else:
                    self.finish_candidate(ident, inputs, 'failure', 'Timed out')
            self.progress[ident] = live
            for index, at, inputs in live:
                held = bool(active_holds(combo['steps'][:index]))
                tracked.append({'id':ident,'attemptId':f'{ident}:{inputs[0]}','inputIds':inputs,'matched':index,'holding':held,
                                'remainingMs':None if held else round(max(0,interval-(now-at))*1000)})
        if tracked != self.last_progress:
            self.last_progress = tracked
            self.on_progress(tracked)

    def flush(self):
        for finger, (deadline, at) in list(self.pending.items()):
            if self.clock() >= deadline:
                del self.pending[finger]
                self.recognize('tap-'+finger, at=at)
        # Hold normalized events for the double-tap window, then process in physical order.
        ready = sorted(e for e in self.combo_events if e[0] <= self.clock()-.3)
        self.combo_events = [e for e in self.combo_events if e[0] > self.clock()-.3]
        for at, gesture, axis, input_id, direction in ready:
            self.advance_combos(at,gesture,axis,input_id,direction)
        self.publish_progress()

    def ingest(self, event):
        # Suspension gates key delivery in trigger(), not gesture recognition.
        self.flush()
        kind = event.get('type')
        if kind == 'Orientation':
            q = event.get('values',[])
            if len(q) != 4 or not all(isinstance(v,(float,int)) and math.isfinite(v) for v in q):
                return
            norm = math.sqrt(sum(v*v for v in q))
            if norm < 1e-8:
                return
            self.orientation = [v/norm for v in q]
            if self.rotation_origin is None:
                self.rotation_origin = self.orientation
                return
            # Relative quaternion, measured in the band's uncalibrated x/y/z frame.
            w,x,y,z = self.rotation_origin
            a,b,c,d = self.orientation
            relative = [w*a+x*b+y*c+z*d, w*b-x*a-y*d+z*c,
                        w*c+x*d-y*a-z*b, w*d-x*c+y*b-z*a]
            scalar = abs(relative[0])
            for axis, value in zip('xyz',relative[1:]):
                if 2*math.atan2(abs(value),scalar) > math.radians(25):
                    self.recognize('rotation',axis,direction='right' if value * (1 if relative[0] >= 0 else -1) > 0 else 'left')
                    self.rotation_origin = self.orientation
                    break
            return
        if kind == 'Gyroscope':
            values = event.get('values',[])
            if len(values)!=3 or not all(isinstance(v,(float,int)) and math.isfinite(v) for v in values):
                return
            for axis, value in zip('xyz',values):
                if abs(value)<30:
                    self.movement_active.discard(axis)
                elif abs(value)>80 and axis not in self.movement_active:
                    self.movement_active.add(axis)
                    self.recognize('movement',axis)
            return
        if kind != 'Gesture':
            return
        raw, derived, finger = event.get('action'),event.get('derived_action'),event.get('finger')
        if finger in ('index','middle') and derived == 'buttonHold':
            self.pending.pop(finger,None)
            if finger not in self.held_fingers:
                self.held_fingers.add(finger)
                self.recognize('hold-'+finger)
            return
        if finger in ('index','middle') and (raw == 'release' or derived in ('buttonRelease','buttonHoldRelease')):
            if finger in self.held_fingers:
                self.held_fingers.remove(finger)
                self.recognize('release-'+finger)
            return
        directions = {'buttonLeft':'left','buttonRight':'right','buttonUp':'up','buttonDown':'down'}
        if derived in directions or raw in ('left','right','up','down'):
            self.recognize('swipe-'+directions.get(derived,raw))
        elif (derived == 'doubleTap' or raw == 'doubletap') and finger in ('index','middle'):
            self.pending.pop(finger,None)
            self.recognize('double-tap-'+finger)
        elif (derived == 'singleTap' or raw == 'tap') and finger in ('index','middle'):
            if finger not in self.pending:
                self.pending[finger] = (self.clock()+.3,self.clock())
