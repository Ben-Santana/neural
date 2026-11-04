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
 moveTop(){this.raised=true;}
 showInactive(){this.visible=true;}hide(){this.visible=false;}isVisible(){return this.visible;}isDestroyed(){return this.destroyed;}destroy(){this.destroyed=true;this.visible=false;this.emit('closed');}
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
send(main.webContents,{action:'configure_shortcuts',assignments:[],cheatSheetDescriptions:{'tap-middle':'Copy selection'}});
send(main.webContents,{action:'picker_profiles',profiles:[{id:'work',name:'Work'}],activeId:'work'});
settings({floatingComboViewer:true});
const viewer=windows.at(-1);
send(viewer.webContents,{action:'combo_viewer_shape',left:104,right:60});
publish({kind:'app_action',action:{type:'show-cheat-sheet'}});
const sheet=windows.at(-1);
assert.equal(sheet.options.roundedCorners,false);
assert.equal(sheet.options.transparent,true);
assert.equal(sheet.bounds.y,0);
send(sheet.webContents,{action:'cheat_sheet_ready'});
assert.equal(sheet.visible,false,'The window must stay hidden until its collapsed surface has painted');
assert.equal(sheet.options.webPreferences.backgroundThrottling,false);
const initialState=sheet.messages.at(-1)[1];
send(sheet.webContents,{action:'cheat_sheet_present'});
assert.equal(sheet.visible,true);
assert.equal(sheet.messages.at(-1)[1].kind,'cheat_sheet_open');
assert.equal(viewer.raised,true);
assert.equal(initialState.originLeft,sheet.bounds.width/2-100-104);
assert.equal(initialState.originRight,sheet.bounds.width/2+100+60);
assert.equal(viewer.messages.some(([,m])=>m.kind==='cheat_sheet_visibility'&&m.open),true);
assert.equal(initialState.descriptions['tap-middle'],'Copy selection');
const configCount=viewer.messages.filter(([,m])=>m.kind==='combo_viewer_config').length;
send(main.webContents,{action:'cheat_sheet_descriptions',descriptions:{'tap-middle':'Copy selection'}});
assert.equal(viewer.messages.filter(([,m])=>m.kind==='combo_viewer_config').length,configCount);
send(viewer.webContents,{action:'combo_viewer_shape',left:200,right:80});
publish({kind:'app_action',action:{type:'show-cheat-sheet'}});
assert.equal(sheet.messages.at(-1)[1].originLeft,sheet.bounds.width/2-100-200);
assert.equal(sheet.messages.at(-1)[1].originRight,sheet.bounds.width/2+100+80);
assert.equal(sheet.destroyed,false);
assert.equal(sheet.messages.at(-1)[1].kind,'cheat_sheet_dismiss');
send(sheet.webContents,{action:'cheat_sheet_closed'});
assert.equal(sheet.destroyed,true);
assert.equal(viewer.messages.at(-1)[1].open,false);
// A dismissal before first paint must never flash the pending window on screen.
publish({kind:'app_action',action:{type:'show-cheat-sheet'}});
const pending=windows.at(-1);
send(pending.webContents,{action:'cheat_sheet_ready'});
publish({kind:'app_action',action:{type:'show-cheat-sheet'}});
send(pending.webContents,{action:'cheat_sheet_present'});
assert.equal(pending.visible,false);
send(pending.webContents,{action:'cheat_sheet_closed'});
assert.equal(pending.destroyed,true);
console.log('Cheat sheet native: native corner rounding disabled, screen-edge alignment, descriptions and deferred dismissal passed.');
