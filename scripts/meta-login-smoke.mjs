import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {EventEmitter} from 'node:events';
class FakeWindow extends EventEmitter {
 static windows=[];
 constructor(options){super();this.options=options;this.destroyed=false;this.shown=0;this.scripts=[];FakeWindow.windows.push(this);this.webContents=new EventEmitter();this.webContents.getURL=()=>this.url;this.webContents.setWindowOpenHandler=()=>{};this.webContents.executeJavaScript=async script=>{this.scripts.push(script);return 'attempted';};}
 loadURL(url){this.url=url;return Promise.resolve();}
 isDestroyed(){return this.destroyed;}
 destroy(){this.destroyed=true;this.emit('closed');}
 show(){this.shown++;}
 focus(){}
}
let compiled=ts.transpileModule(fs.readFileSync('electron/meta-login.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
compiled=compiled.replace(/import.*from 'electron';/, 'const BrowserWindow=globalThis.__fakeLoginWindow;');
globalThis.__fakeLoginWindow=FakeWindow;
const {metaLogin}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
assert.throws(()=>metaLogin('https://example.org',null));
const auto=metaLogin('https://auth.meta.com/?test=1',{username:'fake@example.invalid',password:'fake-test-password'});
let win=FakeWindow.windows.at(-1);assert.equal(win.options.show,false);
await new Promise(resolve=>setTimeout(resolve,800));assert.equal(win.scripts.length,1);
let prevented=false;win.webContents.emit('will-redirect',{preventDefault(){prevented=true;}},'fb-viewapp://frl_login?token=fake&blob=fake');
assert.equal(await auto.result,'fb-viewapp://frl_login?token=fake&blob=fake');assert.ok(prevented);assert.ok(win.destroyed);
const manual=metaLogin('https://auth.meta.com',null);win=FakeWindow.windows.at(-1);assert.equal(win.options.show,true);
const rejected=assert.rejects(manual.result,/cancelled/);manual.cancel();await rejected;
console.log('Meta login passed: origin restriction, hidden opt-in, password attempt, callback interception, visible manual login and cancellation.');
