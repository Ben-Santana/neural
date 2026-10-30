import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.goto('http://127.0.0.1:5190');
 await page.evaluate(()=>localStorage.clear());await page.reload();
 await page.getByRole('button',{name:'Edit Swipe left shortcut',exact:true}).click();
 await page.getByRole('button',{name:'macOS actions',exact:true}).click();
 assert.equal(await page.getByRole('dialog').count(),0);
 await page.getByRole('menuitem',{name:'Open an app',exact:true}).click();
 await page.getByPlaceholder('App name, e.g. Safari').fill('Calendar');
 await page.getByRole('button',{name:'Save app',exact:true}).click();
 await page.reload();
 assert.ok(await page.getByText('Open Calendar',{exact:true}).isVisible());
 await page.getByRole('button',{name:'Edit Swipe left shortcut',exact:true}).click();
 await page.getByRole('button',{name:'macOS actions',exact:true}).click();
 await page.screenshot({path:'docs/macos-actions-dropdown.png'});
 await page.getByRole('menuitem',{name:'Volume up',exact:true}).click();
 

 await page.reload();assert.ok(await page.getByText('Volume up',{exact:true}).isVisible());
 await page.getByRole('button',{name:'Edit Swipe left shortcut',exact:true}).click();
 await page.getByRole('button',{name:'macOS actions',exact:true}).click();
 await page.keyboard.press('Escape');
 await page.keyboard.press('Meta+k');
 assert.deepEqual(await page.locator('.assignment-row').first().locator('kbd').allTextContents(),['⌘','K']);
 console.log('Passed: macOS action selection, app name entry, persistence, editing, cancel, keyboard capture.');
}finally{await browser.close();}
