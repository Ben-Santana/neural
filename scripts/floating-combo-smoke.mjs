import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:440}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{const listeners=new Set();window.commands=[];window.band={send(c){window.commands.push(c);},onMessage(fn){listeners.add(fn);return()=>listeners.delete(fn);}};window.emitBand=m=>listeners.forEach(fn=>fn(m));});
 await page.goto('http://127.0.0.1:5190/?combo-viewer');
 const panel=page.getByRole('complementary',{name:'Notch combo viewer'});await panel.waitFor();
 const emit=m=>page.evaluate(m=>window.emitBand(m),m);
 const settle=async()=>{await page.waitForFunction(()=>document.querySelector('.notch-combo').dataset.settled==='true');await panel.evaluate(async e=>{await Promise.all(e.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{})));});};
 const assignments=[{id:'combo-a',enabled:true,shortcut:{modifiers:['command'],key:'a'},steps:[{gesture:'hold-index'},{gesture:'swipe-left'}]},{id:'combo-b',enabled:true,shortcut:null,steps:[{gesture:'hold-index'},{gesture:'release-index'}]}];
 await emit({kind:'combo_viewer_config',assignments});
 assert.equal(await panel.evaluate(e=>e.classList.contains('expanded')),false);
 await settle();
 assert.equal(await page.locator('.notch-wing').first().evaluate(e=>e.getBoundingClientRect().width),0);
 assert.equal(await page.locator('.notch-surface').evaluate(e=>getComputedStyle(e).opacity),'0');
 await emit({kind:'gesture_input',input:{id:1,gesture:'hold-index'}});
 await emit({kind:'combo_progress',candidates:[{id:'combo-a',attemptId:'a:1',matched:1,inputIds:[1],holding:true},{id:'combo-b',attemptId:'b:1',matched:1,inputIds:[1],holding:true}]});
 await page.locator('.notch-combo.expanded').waitFor();
 assert.equal(await page.locator('.notch-option').count(),2);
 assert.equal(await page.locator('.notch-options .notch-wing-content').evaluate(e=>getComputedStyle(e).transitionDelay),'0s','Hints have no additional entrance delay');
 assert.equal(await page.locator('.notch-performed span').count(),1);
 await settle();
 assert.equal(await panel.innerText(),'');
 assert.equal(await page.locator('.notch-surface path').evaluate(e=>getComputedStyle(e).fill),'rgb(0, 0, 0)');
 assert.equal(await panel.evaluate(e=>getComputedStyle(e).color),'rgb(255, 255, 255)');
 const geometry=await page.evaluate(()=>Object.fromEntries(['.notch-combo','.notch-options','.notch-performed'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return [s,{x:r.x,y:r.y,width:r.width,right:r.right}];})));
 assert.equal(geometry['.notch-combo'].y,0);
 assert.equal(geometry['.notch-performed'].right,620);
 assert.equal(geometry['.notch-options'].x,820);
 assert.equal(geometry['.notch-performed'].width,38);
 assert.equal(geometry['.notch-options'].width,60);
 assert.equal(await panel.evaluate(e=>e.getBoundingClientRect().height),32);
 await page.evaluate(()=>document.body.style.setProperty('background','#647c89','important'));
 await page.screenshot({path:'/tmp/notch-combo-expanded.png'});
 // A held gesture must remain visible beyond the normal recent-input timeout.
 await page.waitForTimeout(1500);
 assert.equal(await panel.evaluate(e=>e.classList.contains('expanded')),true);
 await emit({kind:'combo_viewer_geometry',width:184,height:38});await settle();
 assert.equal(await panel.evaluate(e=>e.getBoundingClientRect().height),38);
 assert.equal(await page.locator('.notch-option').count(),2);
 await emit({kind:'combo_outcome',id:'combo-a',attemptId:'a:1',status:'failure',reason:'Timed out',inputIds:[1]});
 await page.waitForFunction(()=>document.querySelectorAll('.notch-option').length===1);
 await emit({kind:'combo_outcome',id:'combo-b',attemptId:'b:1',status:'success',reason:'Combo complete',inputIds:[1]});
 await page.locator('.notch-combo.success').waitFor();
 assert.equal(await page.locator('.notch-option').count(),0,'Completion must clear next-step suggestions');
 await page.waitForFunction(()=>!document.querySelector('.notch-combo.expanded'));await settle();
 assert.equal(await page.locator('.notch-surface').evaluate(e=>getComputedStyle(e).opacity),'0');
 // Standalone movements also unfold the recent-movement wing, then disappear.
 await emit({kind:'gesture_input',input:{id:2,gesture:'swipe-right'}});
 await page.locator('.notch-combo.expanded').waitFor();
 assert.equal(await page.locator('.notch-performed [aria-label="Swipe right"]').count(),1);
 assert.equal(await page.locator('.notch-option').count(),0,'Unrelated movements must not suggest combo starters or standalone actions');
 await page.waitForFunction(()=>!document.querySelector('.notch-combo.expanded'));
 await emit({kind:'combo_progress',candidates:[{id:'combo-a',attemptId:'a:2',matched:1,inputIds:[1],remainingMs:500}]});
 await page.locator('.notch-combo.expanded').waitFor();
 await emit({kind:'state',state:'disconnected'});await settle();
 assert.equal(await panel.evaluate(e=>e.classList.contains('expanded')),false);
 // The silhouette uses concave curves at the screen edge and never changes height while closing.
 await emit({kind:'gesture_input',input:{id:9,gesture:'tap-index'}});await settle();
 await emit({kind:'state',state:'disconnected'});
 await page.waitForTimeout(160);
 assert.equal(await panel.evaluate(e=>e.getBoundingClientRect().height),38);
 assert.equal(await page.locator('.notch-surface').count(),1);
 await emit({kind:'gesture_input',input:{id:10,gesture:'tap-middle'}});await settle();
 assert.equal(await page.locator('.notch-performed span').count(),1);
 assert.equal(await page.locator('.notch-surface').evaluate(e=>getComputedStyle(e).opacity),'1');
 // Standalone assignments never appear on the combo-continuation side.
 await emit({kind:'combo_viewer_config',assignments:[{id:'swipe-left',enabled:true,shortcut:null},{id:'swipe-right',enabled:false,shortcut:null}]});
 await emit({kind:'gesture_input',input:{id:11,gesture:'tap-index'}});await settle();
 assert.equal(await page.locator('.notch-options [aria-label="Swipe left"]').count(),0);
 assert.equal(await page.locator('.notch-options [aria-label="Swipe right"]').count(),0);
 // Keep every recent gesture on the left, including inputs outside the active combo.
 await emit({kind:'combo_viewer_config',assignments});
 await emit({kind:'gesture_input',input:{id:20,gesture:'hold-index'}});
 await emit({kind:'combo_progress',candidates:[{id:'combo-a',attemptId:'a:20',matched:1,inputIds:[20]}]});
 await emit({kind:'gesture_input',input:{id:21,gesture:'swipe-up'}});
 assert.equal(await page.locator('.notch-performed [aria-label="Swipe up"]').count(),1);
 assert.equal(await page.locator('.notch-option').count(),1);
 await emit({kind:'combo_progress',candidates:[]});
 assert.equal(await page.locator('.notch-option').count(),0,'A failed attempt must not show fallback suggestions');
 for(const [id,gesture] of [[22,'swipe-left'],[23,'swipe-down'],[24,'swipe-right']])await emit({kind:'gesture_input',input:{id,gesture}});
 await settle();
 assert.equal(await page.locator('.notch-performed span').count(),4);
 assert.equal(await page.locator('.notch-performed [aria-label="Tap and hold index"]').count(),0,'Oldest gesture falls out of the four-icon history');
 const history=await page.locator('.notch-performed span').evaluateAll(elements=>elements.map(e=>({label:e.getAttribute('aria-label'),age:e.dataset.age,opacity:Number(getComputedStyle(e).opacity),mask:getComputedStyle(e).maskImage})));
 assert.deepEqual(history.map(h=>h.label),['Swipe up','Swipe left','Swipe down','Swipe right']);
 assert.deepEqual(history.map(h=>h.opacity),[.18,.5,1,1]);
 assert.notEqual(history[0].mask,'none','Oldest icon falls into the outer-edge fade');
 assert.equal(await page.locator('.notch-performed').evaluate(e=>e.getBoundingClientRect().width),104);
 await page.screenshot({path:'/tmp/notch-history-fade.png'});
 // Choosing a right-side option transfers it left; alternatives leave upward.
 await emit({kind:'combo_viewer_config',assignments});
 await emit({kind:'gesture_input',input:{id:30,gesture:'hold-index'}});
 await emit({kind:'combo_progress',candidates:[{id:'combo-a',attemptId:'a:30',matched:1,inputIds:[30]},{id:'combo-b',attemptId:'b:30',matched:1,inputIds:[30]}]});
 await settle();
 const source=await page.locator('.notch-options [aria-label="Swipe left"]').boundingBox();
 await emit({kind:'gesture_input',input:{id:31,gesture:'swipe-left'}});
 assert.equal(await page.locator('.notch-flying-icon.selected').count(),1);
 assert.equal(await page.locator('.notch-flying-icon.dismissed').count(),1);
 assert.equal(await page.locator('.notch-performed [data-input-id="31"]').evaluate(e=>getComputedStyle(e).visibility),'hidden','Only the flying copy is visible during transfer');
 await page.locator('.notch-flying-icon').evaluateAll(elements=>elements.forEach(e=>e.getAnimations().forEach(a=>{a.pause();a.currentTime=Number(a.effect.getTiming().duration)*(e.classList.contains('dismissed')?.7:.4);})));
 const selected=await page.locator('.notch-flying-icon.selected').boundingBox();
 const dismissed=await page.locator('.notch-flying-icon.dismissed').boundingBox();
 assert.ok(selected.x<source.x-20,'Selected option travels left');
 assert.ok(dismissed.y<0,'Other options travel above the screen');
 const historyMoves=await page.locator('.notch-performed [data-input-id="30"]').evaluate(e=>e.getAnimations().some(a=>a.transitionProperty==='transform'));
 assert.equal(historyMoves,true,'Existing recent gestures slide to make room');
 await emit({kind:'combo_progress',candidates:[{id:'combo-a',attemptId:'a:30',matched:1,inputIds:[30],remainingMs:300},{id:'combo-b',attemptId:'b:30',matched:1,inputIds:[30],remainingMs:300}]});
 assert.equal(await page.locator('.notch-option').evaluateAll(elements=>elements.every(e=>getComputedStyle(e).visibility==='hidden')),true,'Buffered countdown updates must not resurrect departing options');
 await page.screenshot({path:'/tmp/notch-option-transfer.png'});
 await page.locator('.notch-flying-icon').evaluateAll(elements=>elements.forEach(e=>e.getAnimations().forEach(a=>a.play())));
 // Another input during transfer retargets the arriving icon into its older history slot.
 await emit({kind:'gesture_input',input:{id:32,gesture:'swipe-up'}});
 await emit({kind:'combo_outcome',id:'combo-a',attemptId:'a:30',status:'success',inputIds:[30,31]});
 await emit({kind:'combo_progress',candidates:[]});
 await settle();
 assert.equal(await page.locator('.notch-flying-icon').count(),0);
 assert.equal(await page.locator('.notch-performed [data-input-id="31"]').evaluate(e=>getComputedStyle(e).visibility),'visible');
 assert.equal(await page.locator('.notch-performed [data-input-id="31"]').getAttribute('data-age'),'1');
 await page.screenshot({path:'/tmp/notch-option-arrived.png'});
 // Fresh configurations clear old gesture history. Reduced motion keeps the same content.
 await page.emulateMedia({reducedMotion:'reduce'});
 await emit({kind:'combo_viewer_config',assignments});
 await emit({kind:'gesture_input',input:{id:3,gesture:'hold-index'}});
 await emit({kind:'combo_progress',candidates:[{id:'combo-a',attemptId:'a:3',matched:1,inputIds:[3]},{id:'combo-b',attemptId:'b:3',matched:1,inputIds:[3]}]});
 assert.equal(await page.locator('.notch-wing-content').first().evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
 for(const width of [1440,768,390]){
  await page.setViewportSize({width,height:440});
  await settle();
  assert.equal(await panel.evaluate(e=>e.getBoundingClientRect().height),38);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.screenshot({path:`/tmp/notch-combo-${width}.png`,animations:'disabled'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }
 await emit({kind:'gesture_input',input:{id:4,gesture:'swipe-left'}});
 assert.equal(await page.locator('.notch-flying-icon').count(),0,'Reduced motion transfers immediately');
 // Replay actual engine events from the app's suspended testing mode, not fabricated candidates.
 const pythonEnv={...process.env};delete pythonEnv.PYTHONHOME;
 const trace=spawnSync('.venv/bin/python',['-c',`
import json
from python.shortcuts import ShortcutEngine
now = [0.0]
messages = []
engine = ShortcutEngine(lambda action: True, clock=lambda:now[0],
    on_input=lambda event:messages.append({'kind':'gesture_input','input':event}),
    on_progress=lambda candidates:messages.append({'kind':'combo_progress','candidates':candidates}),
    on_outcome=lambda outcome:messages.append({'kind':'combo_outcome',**outcome}))
assignment = {'id':'combo-triple','enabled':True,'shortcut':{'key':'R','modifiers':[]},'steps':[{'gesture':'tap-index'}]*3,'intervalMs':500}
engine.configure([assignment])
engine.suspended = True
steps = []
for index in range(6):
    messages.clear()
    now[0] = index*.4
    engine.ingest({'type':'Gesture','action':'tap','derived_action':'singleTap','finger':'index'})
    now[0] += .31
    engine.flush()
    steps.append(list(messages))
print(json.dumps({'assignment':assignment,'steps':steps}))
`],{encoding:'utf8',env:pythonEnv});
 assert.equal(trace.status,0,trace.stderr);
 const replay=JSON.parse(trace.stdout);
 await emit({kind:'combo_viewer_config',assignments:[replay.assignment]});
 for(let index=0;index<replay.steps.length;index++){
  await page.evaluate(messages=>messages.forEach(message=>window.emitBand(message)),replay.steps[index]);
  await settle();
  assert.equal(await page.locator('.notch-option').count(),(index+1)%3===0?0:1,`Tap ${index+1}: completion clears options; the fourth tap starts fresh`);
  assert.equal(replay.steps[index].filter(m=>m.kind==='combo_outcome'&&m.status==='success').length,(index+1)%3===0?1:0);
 }
 // Side preferences update the live overlay without discarding the current combo.
 await emit({kind:'combo_viewer_config',assignments,sides:'left'});
 await emit({kind:'gesture_input',input:{id:100,gesture:'hold-index'}});
 await emit({kind:'combo_progress',candidates:[{id:'combo-a',attemptId:'a:100',matched:1,inputIds:[100]},{id:'combo-b',attemptId:'b:100',matched:1,inputIds:[100]}]});
 await settle();
 assert.equal(await page.locator('.notch-performed span').count(),1);
 assert.equal(await page.locator('.notch-option').count(),0);
 assert.equal(await page.locator('.notch-options').evaluate(e=>e.getBoundingClientRect().width),0);
 await page.screenshot({path:'/tmp/notch-left-only.png'});
 await emit({kind:'combo_viewer_preferences',sides:'right'});await settle();
 assert.equal(await page.locator('.notch-performed span').count(),0);
 assert.equal(await page.locator('.notch-performed').evaluate(e=>e.getBoundingClientRect().width),0);
 assert.equal(await page.locator('.notch-option').count(),2);
 await page.screenshot({path:'/tmp/notch-right-only.png'});
 await page.emulateMedia({reducedMotion:'no-preference'});
 await emit({kind:'gesture_input',input:{id:101,gesture:'swipe-left'}});
 assert.equal(await page.locator('.notch-flying-icon.selected').count(),0,'Right-only mode never transfers an icon to the hidden left side');
 assert.equal(await page.locator('.notch-flying-icon.dismissed').count(),2);
 await emit({kind:'combo_viewer_preferences',sides:'both'});await settle();
 assert.equal(await page.locator('.notch-flying-icon').count(),0,'Changing sides cancels obsolete flights');
 assert.equal(await page.locator('.notch-performed span').count(),2);
 assert.equal(await page.locator('.notch-option').count(),2);
 // Keep history visible while the cheat sheet occupies the expanded surface.
 await emit({kind:'cheat_sheet_visibility',open:true});
 await emit({kind:'combo_progress',candidates:[]});
 await page.waitForTimeout(1700);
 assert.equal(await panel.evaluate(e=>e.classList.contains('expanded')),true);
 assert.equal(await page.locator('.notch-performed [data-input-id]').count(),2);
 assert.equal(await page.evaluate(()=>window.commands.some(c=>c.action==='combo_viewer_shape'&&c.left>0)),true);
 await emit({kind:'cheat_sheet_visibility',open:false});
 await page.waitForFunction(()=>!document.querySelector('.notch-combo').classList.contains('expanded'));
 await settle();
 assert.deepEqual(errors,[]);
 console.log('Passed: transparent idle, fixed notch height, asymmetric widths, performed left/options right, combo-only next steps, capped/faded recent history, sliding history, option transfer/upward dismissal, interrupted transfers/collapse, geometry changes, holds, reduced motion, viewport sizes, actual test-mode triple-tap replay, left/right-only preferences.');
}finally{await browser.close();}
