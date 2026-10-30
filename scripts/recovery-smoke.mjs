import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1100,height:900}});
 await page.addInitScript(()=>{
  window.commands=[];window.listeners=[];
  window.band={send:c=>window.commands.push(c),onMessage:cb=>{window.listeners.push(cb);return()=>window.listeners=window.listeners.filter(x=>x!==cb);}};
  window.emitBand=m=>window.listeners.forEach(cb=>cb(m));
 });
 await page.clock.install();
 await page.goto('http://127.0.0.1:5190');
 await page.waitForFunction(()=>window.commands.some(c=>c.action==='discover'));
 await page.evaluate(()=>{
  window.emitBand({kind:'devices',request_id:'startup',devices:[{id:'test-band',name:'Test band'}]});
  window.emitBand({kind:'identity_recovery',device_id:'test-band',message:'Sign in with Meta to enroll this Mac again.'});
  window.emitBand({kind:'state',state:'disconnected'});
  window.emitBand({kind:'state',state:'enrolling'});
 });
 const dialog=page.getByRole('dialog');await dialog.waitFor();
 await dialog.locator('button.primary').filter({hasText:'Setting up…'}).waitFor();
 await dialog.getByText('More options',{exact:true}).click();
 await dialog.getByRole('button',{name:'Cancel Meta sign-in',exact:true}).click();
 assert.ok(await page.evaluate(()=>window.commands.some(c=>c.action==='disconnect')));
 await page.evaluate(()=>window.emitBand({kind:'state',state:'disconnected'}));
 await dialog.getByRole('button',{name:'Sign in with Meta again',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>window.commands.filter(c=>c.action==='enroll').at(-1)),{action:'enroll',device_id:'test-band'});
 await page.screenshot({path:'docs/identity-recovery.png'});
 await page.evaluate(()=>{window.emitBand({kind:'enrolled'});window.emitBand({kind:'state',state:'connected'});});
 await page.waitForFunction(()=>!document.querySelector('[role=dialog]'));
 await page.evaluate(()=>window.emitBand({kind:'events',events:[{type:'Orientation',values:[1,0,0,0]}]}));
 const before=await page.evaluate(()=>window.commands.filter(c=>c.action==='enroll').length);
 await page.clock.runFor(31000);
 await page.getByRole('button',{name:'Sign in with Meta again',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.commands.filter(c=>c.action==='enroll').length),before,'Gesture silence must not automatically enroll');
 await page.evaluate(()=>window.emitBand({kind:'events',events:[{type:'Gesture',finger:'index',action:'tap'}]}));
 await page.clock.runFor(200);
 assert.equal(await page.getByText('No gestures received yet.',{exact:false}).count(),0);
 console.log('Recovery UI passed: automatic dialog, cancellation, explicit re-enrollment, connected dismissal.');
}finally{await browser.close();}
