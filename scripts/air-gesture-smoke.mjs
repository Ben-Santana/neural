import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{const listeners=new Set();window.emitAir=m=>listeners.forEach(cb=>cb(m));window.band={send:()=>{},onMessage:cb=>{listeners.add(cb);return()=>listeners.delete(cb);}};});
 await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:5190');
 const math=await page.evaluate(async()=>{const {comparePaths,wristPoint}=await import('/src/airGesture.ts');const line=[[0,0],[10,0],[20,0]],circle=Array.from({length:65},(_,i)=>[Math.cos(i/64*2*Math.PI),Math.sin(i/64*2*Math.PI)]);return {same:comparePaths(line,[[40,10],[60,10],[80,10]]),different:comparePaths(line,circle),reverse:comparePaths(line,[...line].reverse()),stationary:comparePaths(line,[[0,0],[0,0]]),twist:wristPoint([Math.cos(.5),0,Math.sin(.5),0],[1,0,0,0]),invalid:wristPoint([0,0,0,0],[1,0,0,0])};});
 assert.equal(math.same,100);assert.ok(math.different<75);assert.ok(math.reverse<100);assert.equal(math.stationary,null);assert.ok(Math.hypot(...math.twist)<1e-9);assert.equal(math.invalid,null);
 await page.getByRole('button',{name:'Device settings',exact:true}).click();await page.getByRole('button',{name:/Open device test/}).click();await page.getByRole('tab',{name:'Air gestures',exact:true}).click();
 await page.getByRole('button',{name:'Single gesture test',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Record air gesture',exact:true}).isDisabled(),true);
 await page.evaluate(()=>window.emitAir({kind:'state',state:'connected'}));
 await page.waitForTimeout(200);
 await page.evaluate(()=>{window.airTimer=setInterval(()=>window.emitAir({kind:'events',events:[{type:'Orientation',values:[1,0,0,0]}]}),80);});
 await page.getByRole('button',{name:'Center forearm',exact:true}).click();
 const pad=page.getByLabel('Draw target gesture'),rect=await pad.boundingBox();
 await page.mouse.move(rect.x+rect.width*.2,rect.y+rect.height*.5);await page.mouse.down();await page.mouse.move(rect.x+rect.width*.8,rect.y+rect.height*.5,{steps:40});await page.mouse.up();
 await page.evaluate(()=>clearInterval(window.airTimer));
 await page.getByRole('button',{name:'Record air gesture',exact:true}).click();
 // Yaw around sensor Z moves the forward Y vector horizontally (sensor X).
 await page.evaluate(()=>window.emitAir({kind:'events',events:Array.from({length:80},(_,i)=>{const angle=.5-i/79;return {type:'Orientation',values:[Math.cos(angle/2),0,0,Math.sin(angle/2)]};})}));
 await page.getByRole('button',{name:'Finish and compare'}).click();
 await page.evaluate(()=>{window.airTimer=setInterval(()=>window.emitAir({kind:'events',events:[{type:'Orientation',values:[Math.cos(-.25),0,0,Math.sin(-.25)]}]}),80);});
 await page.getByText(/Similar gesture ·/).waitFor();
 const verdict=await page.locator('.air-verdict strong').textContent();assert.match(verdict,/100%/);
 await page.screenshot({path:'docs/air-gesture.png',fullPage:true});
 for(const width of [768,390]){await page.setViewportSize({width,height:1100});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`docs/air-gesture-${width}.png`,fullPage:true});}
 await page.getByRole('button',{name:'Record air gesture',exact:true}).click();await page.getByRole('button',{name:'Finish and compare'}).click();await page.getByText(/Too little motion/).waitFor();
 await page.getByRole('button',{name:'Record air gesture',exact:true}).click();await page.evaluate(()=>clearInterval(window.airTimer));await page.getByText(/Orientation stream interrupted/).waitFor();
 assert.equal(await page.getByRole('button',{name:'Record air gesture',exact:true}).isDisabled(),true);
 await page.evaluate(()=>window.emitAir({kind:'state',state:'disconnected'}));await page.getByRole('tab',{name:'Live signals',exact:true}).click();await page.getByRole('tab',{name:'Air gestures',exact:true}).click();assert.equal(await page.locator('.air-target').first().getAttribute('d'),'');
 assert.deepEqual(errors,[]);
 console.log('Air gestures: drawing, calibration, batched orientation capture, matching line, insufficient motion, interrupted stream, responsive layout and cleanup passed.');
}finally{await browser.close();}
