import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {EventEmitter} from 'node:events';
// Run the actual Electron main process against an isolated shell: no user
// preferences, desktop windows, real worker or login settings are touched.
const windows=[],handlers={},ipc={},intervals=new Map(),timeouts=new Map(),writes=[];
let wallNow=0;
let ready,cursor={x:500,y:400},saved={},serial=0;
class Window extends EventEmitter{
 constructor(options){super();this.options=options;this.bounds={x:0,y:0,width:options.width,height:options.height};this.visible=false;this.destroyed=false;this.messages=[];this._webContents=new EventEmitter();this.webContents.send=(...args)=>this.messages.push(args);this.webContents.setWindowOpenHandler=()=>{};windows.push(this);}
 get webContents(){if(this.destroyed)throw new TypeError('Object has been destroyed');return this._webContents;}
 setBounds(bounds){this.bounds={...this.bounds,...bounds};}getBounds(){return this.bounds;}
 setAlwaysOnTop(...args){this.top=args;}setVisibleOnAllWorkspaces(...args){this.workspaces=args;}setIgnoreMouseEvents(value){this.ignoreMouse=value;}
 loadURL(url){this.url=url;return Promise.resolve();}loadFile(url){this.url=url;return Promise.resolve();}
 showInactive(){this.visible=true;}hide(){this.visible=false;}isVisible(){return this.visible;}isDestroyed(){return this.destroyed;}destroy(){this.destroyed=true;this.visible=false;}
}
const app={commandLine:{appendSwitch(){}},requestSingleInstanceLock:()=>true,on(){},whenReady:()=>({then:fn=>{ready=fn;}}),getPath:()=>'/isolated/preferences',isPackaged:false,getLoginItemSettings:()=>({}),quit(){}};
const mockFs={existsSync:()=>false,readFileSync:()=>JSON.stringify(saved),mkdirSync(){},writeFileSync:(_file,data)=>{saved=JSON.parse(data);}};
const worker={stdin:{write:data=>writes.push(JSON.parse(data))},stdout:new EventEmitter(),stderr:new EventEmitter(),on(){},kill(){}};
const sandbox={console,Date:{now:()=>wallNow},process:{argv:['test','--dev'],platform:'darwin',env:{},resourcesPath:'/test'},app,BrowserWindow:Window,ipcMain:{handle:(name,fn)=>handlers[name]=fn,on:(name,fn)=>ipc[name]=fn},screen:{getCursorScreenPoint:()=>cursor,on(){},getAllDisplays:()=>[],getPrimaryDisplay:()=>({bounds:{x:0,y:0,width:1440,height:900}})},systemPreferences:{},shell:{},Tray:class{},Menu:{},nativeImage:{},session:{},path,fs:mockFs,execFile(){},spawn:()=>worker,createInterface:()=>({on(){}}),setTimeout:(fn,delay)=>{const id=++serial;timeouts.set(id,{fn,delay});return id;},clearTimeout:id=>timeouts.delete(id),setInterval:fn=>{intervals.set(++serial,fn);return serial;},clearInterval:id=>intervals.delete(id),metaLogin(){}};
const context=vm.createContext(sandbox);
let source=fs.readFileSync('electron/main.ts','utf8').replace(/^import .*;\n/gm,'').replace(/const root = .*;/,"const root = '/isolated/project';");
vm.runInContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,context);
await ready();const main=windows[0];
const settings=update=>handlers['app:settings']({sender:main.webContents},update);
const send=(sender,command)=>ipc['band:command']({sender},command);
const publish=message=>{sandbox.testMessage=message;vm.runInContext('publish(testMessage)',context);};
const settleExit=()=>{for(const [id,timer] of [...timeouts])if(timer.delay===200){timeouts.delete(id);timer.fn();}};
assert.equal(settings().airCursorOverlay,false);assert.equal(windows.length,1);
send(main.webContents,{action:'configure_shortcuts',assignments:[]});assert.equal(writes.some(c=>c.action==='air_preview'&&c.enabled===false),true);
assert.equal(settings({airCursorOverlay:true}).airCursorOverlay,true);assert.equal(saved.airCursorOverlay,true);
const overlay=windows.at(-1);assert.equal(overlay.ignoreMouse,true);assert.equal(overlay.options.focusable,false);assert.equal(overlay.options.transparent,true);assert.match(overlay.url,/air-cursor/);
assert.equal(writes.at(-1).enabled,true);
publish({kind:'air_preview',active:true,attemptId:'a',points:[[0,0]]});settleExit();assert.equal(overlay.visible,false,'Wait for renderer readiness');
send(overlay.webContents,{action:'air_preview_ready'});assert.equal(overlay.visible,true);assert.equal(overlay.bounds.x,460);assert.equal(overlay.bounds.y,360);
cursor={x:-200,y:900};for(const tick of intervals.values())tick();assert.equal(overlay.bounds.x,-240);assert.equal(overlay.bounds.y,860);
publish({kind:'air_preview',active:false});for(const [id,timer] of [...timeouts])if(timer.delay===80){timeouts.delete(id);timer.fn();}assert.equal(overlay.visible,true,'Native window remains visible during retraction');settleExit();assert.equal(overlay.visible,false);assert.equal(intervals.size,0);
publish({kind:'air_preview',active:true,attemptId:'b',points:[[0,0]]});send(main.webContents,{action:'suspend_shortcuts',suspended:true});settleExit();assert.equal(overlay.visible,false);
publish({kind:'air_preview',active:true,attemptId:'c',points:[[0,0]]});publish({kind:'state',state:'disconnected'});settleExit();assert.equal(overlay.visible,false);
publish({kind:'air_preview',active:true,attemptId:'stale',points:[[0,0]]});wallNow=700;for(const tick of [...intervals.values()])tick();settleExit();assert.equal(overlay.visible,false,'Stale telemetry cannot strand an overlay');
publish({kind:'air_result',result:'success',resultId:'win',attemptId:'win',points:[[0,0],[.2,0]]});assert.equal(overlay.visible,true);
assert.equal(overlay.options.width,80);assert.equal(overlay.options.height,80);
publish({kind:'air_preview',active:false});assert.equal(overlay.visible,true,'Result stays visible after the capture closes');
for(const [id,timer] of [...timeouts])if(timer.delay===580){timeouts.delete(id);timer.fn();}
settleExit();assert.equal(overlay.visible,false,'Result closes after the fill animation');
publish({kind:'air_result',result:'failure',resultId:'fail',attemptId:'fail',points:[[0,0]]});assert.equal(overlay.visible,true);
settings({airCursorOverlay:false});assert.equal(overlay.destroyed,true);assert.equal(intervals.size,0);assert.equal(saved.airCursorOverlay,false);assert.equal(writes.at(-1).enabled,false);
publish({kind:'air_preview',active:true,points:[[0,0]]});assert.equal(windows.length,2,'Opted out previews never create a window');
console.log('Air cursor native lifecycle passed: default off, persisted opt-in, worker gating, readiness, cursor following across displays, click-through/nonfocusable window, completion/suspend/disconnect cleanup, disable destroys window.');

// Late IPC must not read webContents from a destroyed optional overlay.
assert.doesNotThrow(()=>send(main.webContents,{action:'picker_profiles',profiles:[]}));
settings({airCursorOverlay:true});
const closingOverlay=windows.at(-1),closingSender=closingOverlay.webContents;
send(closingSender,{action:'air_preview_ready'});
closingOverlay.destroy();
assert.doesNotThrow(()=>vm.runInContext('hideAirCursor()',context),'Close callback must tolerate an already destroyed air cursor');
assert.doesNotThrow(()=>send(main.webContents,{action:'picker_profiles',profiles:[]}));
assert.doesNotThrow(()=>send(closingSender,{action:'air_preview_ready'}));
assert.doesNotThrow(()=>main.emit('closed'));
assert.equal(timeouts.size,0);assert.equal(intervals.size,0);
const mainSender=main.webContents;main.destroy();
assert.doesNotThrow(()=>send(mainSender,{action:'shutdown'}));
assert.doesNotThrow(()=>publish({kind:'state',state:'disconnected'}));
vm.runInContext('quitting=true',context);
assert.doesNotThrow(()=>send(mainSender,{action:'shutdown'}));
console.log('Quit regression passed: destroyed overlay/main IPC, late worker messages and timer cleanup.');
