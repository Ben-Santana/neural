import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=fs.readFileSync(new URL('../electron/main.ts',import.meta.url),'utf8');
let cursor={x:500,y:400},bounds={x:0,y:0,width:160,height:160},moves=0,follow,cleared=false,now=0;
const picker={getBounds:()=>bounds,setBounds:next=>{bounds=next;moves++;},setIgnoreMouseEvents:value=>{picker.ignoresMouse=value;},webContents:{send(){}},showInactive(){},moveTop(){},hide(){}};
const context=vm.createContext({performance:{now:()=>now},pickerCondensed:false,pickerFollowPosition:undefined,pickerLastMouse:undefined,pickerLastMouseMove:0,pickerFollowAt:0,pickerExpandedUntil:0,picker,pickerOpen:false,pickerReady:true,pickerProfiles:[],pickerActive:'',radialItems:undefined,radialOpener:undefined,pickerSelected:0,pickerAngle:0,pickerOrigin:undefined,pickerLastDelta:0,pickerRotation:0,pickerSlot:0,lastOrientation:undefined,pickerPointer:{x:80,y:80},pickerTimer:undefined,pickerHideTimer:undefined,pickerFollowTimer:undefined,compactRadialMenus:true,keepRadialMenuOpen:true,radialMenuFollowsMouse:true,workerCommand(){},pickerState(){},pickerEntries:()=>context.radialItems??[],screen:{getCursorScreenPoint:()=>cursor,getDisplayNearestPoint:point=>({workArea:{x:point.x<0?-1200:0,y:0,width:1200,height:900}})},setTimeout:()=>1,clearTimeout(){},setInterval:fn=>{follow=fn;return 2;},clearInterval:id=>{if(id===2)cleared=true;}});
vm.runInContext(ts.transpile(source.slice(source.indexOf('function closePicker('),source.indexOf('let quitting ='))),context);
vm.runInContext("openPicker([{id:'one',output:{key:'K'}},{id:'two',output:{key:'J'}}],'tap-index')",context);
assert.equal(picker.ignoresMouse,true);
assert.equal(bounds.x,426);
follow();assert.equal(moves,1,'Stationary pointer should not move the native window');assert.equal(context.pickerCondensed,false,'Opening at rest stays expanded');
cursor={x:-600,y:300};now+=16;follow();assert.ok(bounds.x<426&&bounds.x>-674,'Movement trails the cursor');assert.equal(context.pickerCondensed,true);
context.pickerOrigin=[1,0,0,0];
vm.runInContext(`pickerMessage({kind:'events',events:[{type:'Orientation',values:[Math.cos(.6),0,Math.sin(.6),0]}]})`,context);
assert.equal(context.pickerCondensed,false,'Wrist selection expands immediately');
assert.equal(context.pickerSelected,1);
now+=16;cursor.x-=10;follow();assert.equal(context.pickerCondensed,false,'Rotation keeps menu expanded during continued motion');
cursor={x:-600,y:300};
for(let i=0;i<150;i++){now+=16;follow();}
assert.equal(bounds.x,-674,'Eventually catches up across monitors');assert.equal(context.pickerCondensed,false,'Reopens after 0.8 seconds still');
cursor={x:-1199,y:1};for(let i=0;i<150;i++){now+=16;follow();}assert.equal(bounds.x,-1200,'Settles at monitor edge');assert.equal(bounds.y,0);
vm.runInContext('closePicker(true)',context);assert.equal(context.pickerOpen,true,'Persistent selection keeps following');
vm.runInContext('closePicker()',context);assert.equal(cleared,true,'Closing stops the follow timer');
context.radialMenuFollowsMouse=false;
vm.runInContext("openPicker([{id:'one',output:{key:'K'}},{id:'two',output:{key:'J'}}],'tap-index')",context);assert.equal(picker.ignoresMouse,false,'Stationary menus accept clicks again');
console.log('Picker follow: movement, monitor crossing, edge clamping, stationary deduplication, persistent selection and timer cleanup passed.');
