import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
// Serve the built files through Playwright interception, without a listening server.
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message);});
 await page.route('https://air.test/**',async route=>{const pathname=new URL(route.request().url()).pathname;const file=path.resolve('dist',pathname==='/'?'index.html':'.'+pathname);if(!file.startsWith(path.resolve('dist')+path.sep))return route.abort();try{const contentType=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':undefined;await route.fulfill({body:readFileSync(file),contentType});}catch{await route.fulfill({status:404,body:''});}});
 await page.addInitScript(()=>{const listeners=new Set();window.emitAir=m=>listeners.forEach(cb=>cb(m));window.band={send:()=>{},onMessage:cb=>{listeners.add(cb);return()=>listeners.delete(cb);}};});
 async function open(){await page.getByRole('button',{name:'Device settings',exact:true}).click();await page.getByRole('button',{name:/Open device test/}).click();await page.getByRole('tab',{name:'Air gestures',exact:true}).click();}
 async function draw(name,points){const pad=await page.getByLabel('Draw engine gesture').boundingBox();await page.mouse.move(pad.x+points[0][0]*pad.width,pad.y+points[0][1]*pad.height);await page.mouse.down();for(const p of points.slice(1))await page.mouse.move(pad.x+p[0]*pad.width,pad.y+p[1]*pad.height,{steps:20});await page.mouse.up();await page.getByRole('textbox',{name:'Gesture name'}).fill(name);await page.getByRole('button',{name:'Add gesture',exact:true}).click();}
 page.setDefaultTimeout(10000);
 await page.goto('https://air.test/');await open();
 await draw('Line',[[.2,.5],[.8,.5]]);await draw('Corner',[[.2,.2],[.2,.8],[.8,.8]]);
 assert.equal(await page.locator('.air-library li').count(),2);
 await page.evaluate(()=>window.emitAir({kind:'state',state:'connected'}));await page.waitForTimeout(100);
 await page.evaluate(()=>{window.currentQ=[1,0,0,0];window.airTimer=setInterval(()=>window.emitAir({kind:'events',events:[{type:'Orientation',values:window.currentQ}]}),60);});
 await page.getByRole('button',{name:'Center forearm',exact:true}).click();
 // Middle-finger double taps must not record.
 await page.evaluate(()=>window.emitAir({kind:'events',events:[{type:'Gesture',finger:'middle',action:'doubletap'}]}));assert.equal(await page.getByText(/Recording ·/).count(),0);
 await page.evaluate(()=>{window.emitAir({kind:'events',events:[{type:'Gesture',finger:'index',action:'doubletap'},{type:'Gesture',finger:'index',derived_action:'doubleTap'}]});const events=Array.from({length:80},(_,i)=>{const angle=.5-i/79;return {type:'Orientation',values:[Math.cos(angle/2),0,0,Math.sin(angle/2)]};});window.currentQ=events.at(-1).values;window.emitAir({kind:'events',events});});
 await page.getByText(/Recording ·/).waitFor();assert.equal(await page.getByRole('button',{name:'Add gesture',exact:true}).isDisabled(),true);
 await page.waitForTimeout(1100);await page.getByText(/Recording ·/).waitFor();
 // Repeated trigger while recording cannot extend the two-second window.
 await page.evaluate(()=>window.emitAir({kind:'events',events:[{type:'Gesture',finger:'index',action:'doubletap'}]}));
 await page.getByText(/Recognized: Line · 100%/).waitFor({timeout:1600});assert.equal(await page.locator('.air-ranking li').count(),2);
 await page.screenshot({path:'docs/air-engine.png',fullPage:true});
 // A circle should be below 100% for both saved templates.
 await page.getByRole('slider',{name:'Minimum similarity'}).fill('100');
 await page.evaluate(()=>{window.emitAir({kind:'events',events:[{type:'Gesture',finger:'index',derived_action:'doubleTap'}]});const events=Array.from({length:100},(_,i)=>{const a=i/99*2*Math.PI,x=.2*Math.cos(a),z=.2*Math.sin(a),v=[x,Math.sqrt(1-x*x-z*z),z],w=Math.sqrt((1+v[1])/2);return {type:'Orientation',values:[w,v[2]/(2*w),0,-v[0]/(2*w)]};});window.currentQ=events.at(-1).values;window.emitAir({kind:'events',events});});
 await page.getByText(/No gesture recognized ·/).waitFor();await page.getByRole('slider',{name:'Minimum similarity'}).fill('0');await page.getByText(/Recognized: (Line|Corner) ·/).waitFor();
 for(const width of [768,390]){await page.setViewportSize({width,height:1100});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`docs/air-engine-${width}.png`,fullPage:true});}
 await page.getByRole('button',{name:'Remove Corner'}).click();assert.equal(await page.locator('.air-library li').count(),1);
 await page.getByRole('tab',{name:'Live signals',exact:true}).click();await page.getByRole('tab',{name:'Air gestures',exact:true}).click();assert.equal(await page.locator('.air-library li').count(),1);
 await page.getByRole('button',{name:'Center forearm',exact:true}).click();await page.evaluate(()=>{window.emitAir({kind:'events',events:[{type:'Gesture',finger:'index',action:'doubletap'}]});clearInterval(window.airTimer);});await page.getByText(/Orientation stream interrupted/).waitFor();
 await page.getByRole('button',{name:'Single gesture test',exact:true}).click();await page.getByRole('button',{name:'Record air gesture',exact:true}).waitFor();
 assert.deepEqual(errors,[]);console.log('Air engine passed: multi-gesture drawing/storage, double-tap trigger/deduplication, two-second cutoff, ranking, threshold rejection, interruption, responsive layout and single-test navigation. No server started.');
}finally{await browser.close();}
