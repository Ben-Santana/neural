import assert from 'node:assert/strict';
const {chromium,_electron}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'})});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:5190');
await page.getByRole('button',{name:'Device settings',exact:true}).click();
await page.getByRole('button',{name:'Open device test',exact:false}).click();
await page.getByRole('button',{name:'Explore demo',exact:true}).click();
await page.waitForFunction(()=>document.querySelectorAll('.channel-plot polyline').length===1);
await page.screenshot({path:'docs/desktop-demo.png',fullPage:true});
await page.getByRole('button',{name:'Pause view',exact:true}).click();
const value=await page.locator('.channel-value').first().textContent();
await page.waitForTimeout(300);
assert.equal(await page.locator('.channel-value').first().textContent(),value);
await page.getByRole('button',{name:'Resume view',exact:true}).click();
const band=page.frameLocator('.band-figure');
const electrode1=band.getByRole('button',{name:'Toggle electrode 1',exact:true});
const electrode2=band.getByRole('button',{name:'Toggle electrode 2',exact:true});
assert.equal(await electrode1.getAttribute('aria-pressed'),'true');
await electrode1.click();
assert.equal(await page.locator('.channel-row').count(),1);
const side=electrode2.locator('g').first().locator('.sil');
const sideBounds=await side.boundingBox();
await side.click({position:{x:sideBounds.width*.5,y:sideBounds.height*.8}});
await page.waitForFunction(()=>document.querySelectorAll('.channel-row').length===2);
assert.equal(await electrode2.getAttribute('aria-pressed'),'true');
await electrode1.click();
await page.waitForFunction(()=>document.querySelectorAll('.channel-row').length===1);
assert.match(await page.locator('.channel-row').textContent(),/CH 02/);
await electrode2.press('Enter');
assert.equal(await page.locator('.channel-row').count(),1);
await electrode1.press('Space');
await page.waitForFunction(()=>document.querySelectorAll('.channel-row').length===2);
await page.getByRole('button',{name:'Toggle channel 2',exact:true}).click();
await page.getByRole('button',{name:'4 s',exact:true}).click();
assert.match(await page.locator('.plot-axis').textContent(),/−4 s/);
await page.getByRole('button',{name:'2 s',exact:true}).click();
await page.screenshot({path:'docs/live-electrode-selection.png',fullPage:true});
await page.getByRole('tab',{name:'Event inspector',exact:true}).click();
await page.locator('button.event-row').first().click();
assert.match(await page.locator('.packet-detail pre').textContent(),/"type"/);
await page.getByLabel('Filter event type').selectOption('Orientation');
assert.ok((await page.locator('button.event-row').first().textContent()).includes('Orientation'));
assert.equal(await page.getByRole('button',{name:/record/i}).count(),0);
await page.getByRole('button',{name:'Device settings',exact:true}).click();
assert.ok(await page.getByText('Virtual band',{exact:true}).isVisible());
await page.getByRole('button',{name:'Open device test',exact:false}).click();
for(const width of [768,390]){
 await page.setViewportSize({width,height:900});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 await page.screenshot({path:`docs/demo-${width}.png`,fullPage:true});
}
// Deterministic sensor packets exercise live geometry and the independent gesture history.
await page.setViewportSize({width:1440,height:1000});
await page.addInitScript(()=>{window.band={send:()=>{},onMessage:callback=>{window.emitBand=callback;return()=>{};}};});
await page.reload();
await page.waitForFunction(()=>typeof window.emitBand==='function');
await page.getByRole('button',{name:'Device settings',exact:true}).click();
await page.getByRole('button',{name:'Open device test',exact:false}).click();
await page.evaluate(()=>window.emitBand({kind:'events',events:[{type:'Orientation',values:[1,0,0,0]},{type:'Gyroscope',values:[1,2,3]}]}));
await page.waitForFunction(()=>document.querySelector('.orientation-visual')?.getAttribute('aria-label').includes('live'));
const firstPose=await page.locator('.orientation-visual polygon').first().getAttribute('points');
await page.evaluate(()=>window.emitBand({kind:'events',events:[{type:'Orientation',values:[Math.SQRT1_2,0,0,Math.SQRT1_2]},{type:'Gyroscope',values:[40,-20,100]}]}));
await page.waitForTimeout(150);
assert.notEqual(await page.locator('.orientation-visual polygon').first().getAttribute('points'),firstPose);
for(const selector of ['.motion-panel','.orientation-panel']) assert.ok(!/\d/.test(await page.locator(selector).textContent()));
const rotated=await page.evaluate(async()=>{const {rotatePoint}=await import('/src/SensorVisuals.tsx');return rotatePoint([1,0,0],[Math.SQRT1_2,0,0,Math.SQRT1_2]);});
assert.ok(Math.abs(rotated[0])<1e-10&&Math.abs(rotated[1]-1)<1e-10);
const geometry = await page.evaluate(async()=>{
 const {rotatePoint,relativeOrientation,normalizeQuaternion,handOrientation}=await import('/src/SensorVisuals.tsx');
 const h=Math.SQRT1_2;
 return {
  x:rotatePoint([0,1,0],[h,h,0,0]), y:rotatePoint([0,0,1],[h,0,h,0]),
  scaled:rotatePoint([1,0,0],[2*h,0,0,2*h]),
  sign:rotatePoint([1,0,0],[-h,0,0,-h]),
  neutral:relativeOrientation([h,0,0,h],[h,0,0,h]),
  // neutral = Z90, current = Z90 * X90. Relative motion must be X90.
  local:relativeOrientation([.5,.5,.5,.5],[h,0,0,h]),
  handRoll:rotatePoint([1,0,0],handOrientation([h,h,0,0],[])),
  handPitch:rotatePoint([0,1,0],handOrientation([h,0,h,0],[])),
  handYaw:rotatePoint([1,0,0],handOrientation([h,0,0,h],[])),
  invalid:normalizeQuaternion([0,0,0,0]),
 };
});
const near=(actual,expected)=>actual.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-10));
near(geometry.x,[0,0,1]);near(geometry.y,[1,0,0]);
near(geometry.scaled,[0,1,0]);near(geometry.sign,[0,1,0]);
near(geometry.neutral,[1,0,0,0]);near(geometry.local,[Math.SQRT1_2,Math.SQRT1_2,0,0]);
near(geometry.handRoll,[0,0,1]);near(geometry.handPitch,[0,0,1]);
near(geometry.handYaw,[0,1,0]);
assert.equal(geometry.invalid,null);
await page.getByRole('button',{name:'Center hand',exact:true}).click();
assert.ok(await page.getByText('Relative to centered pose',{exact:true}).isVisible());
await page.screenshot({path:'docs/hand-orientation.png',fullPage:true});
await page.evaluate(()=>window.emitBand({kind:'events',events:[{type:'Gesture',finger:'index',action:'tap',sequence:1,timestamp:100,derived_action:'singleTap',source_clock:'device_gesture_us',synthetic:false},{type:'Gesture',finger:'thumb',action:'press',sequence:2,timestamp:200,derived_action:'buttonPress',source_clock:'device_gesture_us',synthetic:false},...Array.from({length:110},(_,i)=>({type:'EMGBatch',sequence:i,values:[[32768,32768,32768,32768,32768,32768,32768,32768]]}))]}));
await page.getByRole('button',{name:'Open gesture inspector',exact:true}).click();
await page.waitForFunction(()=>document.querySelectorAll('button.gesture-event-row').length===2);
assert.ok(!(await page.locator('.gesture-inspector').textContent()).includes('EMGBatch'));
await page.getByLabel('Filter gesture finger').selectOption('index');
assert.equal(await page.locator('button.gesture-event-row').count(),1);
await page.locator('button.gesture-event-row').click();
assert.match(await page.locator('.gesture-properties').textContent(),/singleTap/);
await page.getByLabel('Filter gesture action').selectOption('press');
assert.equal(await page.locator('button.gesture-event-row').count(),0);
await page.getByLabel('Filter gesture finger').selectOption('All fingers');
assert.equal(await page.locator('button.gesture-event-row').count(),1);
await page.screenshot({path:'docs/gesture-inspector.png',fullPage:true});
await page.setViewportSize({width:390,height:900});
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
await page.screenshot({path:'docs/gesture-inspector-mobile.png',fullPage:true});
await page.setViewportSize({width:1440,height:1000});
await page.getByLabel('Filter gesture finger').selectOption('All fingers');
await page.getByLabel('Filter gesture action').selectOption('All actions');
await page.evaluate(()=>window.emitBand({kind:'events',events:[
 {type:'Gesture',finger:'index',action:'press',derived_action:'unknown',sequence:10,timestamp:1000},
 {type:'Gesture',finger:'index',action:'unknown',derived_action:'buttonPress',sequence:11,timestamp:1000},
 {type:'Gesture',finger:'index',action:'unknown',derived_action:'buttonHold',sequence:12,timestamp:301000},
 {type:'Gesture',finger:'index',action:'release',derived_action:'unknown',sequence:13,timestamp:800000},
 {type:'Gesture',finger:'index',action:'unknown',derived_action:'buttonRelease',sequence:14,timestamp:800000},
 {type:'Gesture',finger:'index',action:'unknown',derived_action:'buttonHoldRelease',sequence:15,timestamp:800000},
 {type:'Gesture',finger:'thumb',action:'left',derived_action:'unknown',sequence:16,timestamp:900000},
 {type:'Gesture',finger:'thumb',action:'unknown',derived_action:'buttonLeft',sequence:17,timestamp:900000}
]}));
await page.waitForFunction(()=>document.querySelectorAll('button.gesture-event-row').length===10);
for(const title of ['Press detected','Button down','Hold recognized','Release detected','Button up','Hold ended','Swipe left','Direction left']) assert.ok(await page.locator('button.gesture-event-row').filter({hasText:title}).count()>=1);
await page.getByLabel('Filter gesture layer').selectOption('Derived interaction');
assert.equal(await page.locator('button.gesture-event-row').count(),5);
await page.getByLabel('Filter gesture action').selectOption('buttonHoldRelease');
await page.locator('button.gesture-event-row').click();
assert.match(await page.locator('.gesture-purpose').textContent(),/end of a recognized hold/);
await page.getByLabel('Filter gesture action').selectOption('All actions');
await page.getByLabel('Filter gesture layer').selectOption('All layers');
await page.screenshot({path:'docs/gesture-inspector.png',fullPage:true});
await page.setViewportSize({width:390,height:900});
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
await page.screenshot({path:'docs/gesture-inspector-mobile.png',fullPage:true});
console.log('Gesture stage checks: raw vs derived press/hold/release/swipe labels, layer filter and purpose explanations passed.');
console.log('Sensor checks: quaternion geometry, visual-only panels, gesture retention, filters, details, mobile layout passed.');
assert.deepEqual(errors,[]);
await browser.close();
console.log('Browser smoke: demo, pause, channels, inspector, filters, settings, responsive overflow, console passed.');
if(process.env.TEST_ELECTRON==='1'){
 const {default:electronPath}=await import('electron');
 const app=await _electron.launch({executablePath:electronPath,args:['.'],cwd:process.cwd()});
 const win=await app.firstWindow();await win.waitForSelector('h1');
 assert.equal(await win.evaluate(()=>typeof window.band?.send),'function');
 await win.getByRole('button',{name:'Device settings',exact:true}).click();
 await win.getByRole('button',{name:'Open device test',exact:false}).click();
 const desktopBand=win.frameLocator('.band-figure');
 await desktopBand.getByRole('button',{name:'Toggle electrode 2',exact:true}).click();
 await win.waitForFunction(()=>document.querySelectorAll('.channel-row').length===2);
 await desktopBand.getByRole('button',{name:'Toggle electrode 1',exact:true}).click();
 await win.waitForFunction(()=>document.querySelectorAll('.channel-row').length===1);
 assert.match(await win.locator('.channel-row').textContent(),/CH 02/);
 const ready=await win.evaluate(()=>new Promise(resolve=>{const off=window.band.onMessage(m=>{if(m.kind==='ready'){off();resolve(true);}});window.band.send({action:'shutdown'});setTimeout(()=>resolve(false),5000);}));
 assert.equal(ready,true);
 await win.screenshot({path:'docs/electron.png'});
 await app.close();console.log('Electron smoke: production renderer, sandboxed preload, Python worker ready and shutdown passed.');
}
