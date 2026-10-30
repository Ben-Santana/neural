import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.addInitScript(()=>{
  const listeners=new Set();
  window.band={send(){},onMessage(callback){listeners.add(callback);return()=>listeners.delete(callback);}};
  window.recognizeMotion=motion=>listeners.forEach(callback=>callback({kind:'motion',motion}));
 });
 await page.goto('http://127.0.0.1:5190');
 await page.locator('.assignment-row').first().waitFor();
 await page.evaluate(()=>window.recognizeMotion('tap-index'));
 const dot=page.locator('.assignment-row').nth(2).locator('.gesture-indicator');
 await dot.waitFor();
 assert.equal(await page.locator('.gesture-indicator').count(),1);
 await dot.evaluate(el=>{const animation=el.getAnimations()[0];animation.pause();animation.currentTime=300;});
 assert.equal(await dot.evaluate(el=>getComputedStyle(el).transform),'matrix(1, 0, 0, 1, -23, 0)');
 await page.screenshot({path:'/tmp/gesture-indicator.png'});
 await dot.evaluate(el=>el.getAnimations()[0].finish());
 await page.waitForFunction(()=>!document.querySelector('.gesture-indicator'));
 await page.evaluate(()=>{window.recognizeMotion('tap-index');window.recognizeMotion('tap-index');window.recognizeMotion('swipe-left');});
 assert.equal(await page.locator('.gesture-indicator').count(),3);
 await page.waitForFunction(()=>!document.querySelector('.gesture-indicator'));
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.evaluate(()=>window.recognizeMotion('tap-middle'));
 await page.locator('.gesture-indicator').waitFor();
 assert.equal(await page.locator('.gesture-indicator').evaluate(el=>getComputedStyle(el).animationName),'gesture-peek-reduced');
 console.log('Gesture indicators: matching rows, travel, repeats, cleanup and reduced motion passed.');
}finally{await browser.close();}
