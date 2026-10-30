export const motions = [
 {id:'tap-index',name:'Tap index',hint:'One tap with your index finger.',icon:'index'},
 {id:'tap-middle',name:'Tap middle',hint:'One tap with your middle finger.',icon:'middle'},
 {id:'double-tap-index',name:'Double tap index',icon:'index'},
 {id:'double-tap-middle',name:'Double tap middle',icon:'middle'},
 {id:'hold-index',name:'Tap and hold index',icon:'index'},
 {id:'hold-middle',name:'Tap and hold middle',icon:'middle'},
 {id:'swipe-up',name:'Swipe up',icon:'up'},
 {id:'swipe-down',name:'Swipe down',icon:'down'},
 {id:'swipe-left',name:'Swipe left',hint:'A little to the left.',icon:'left'},
 {id:'swipe-right',name:'Swipe right',hint:'A little to the right.',icon:'right'},
] as const;
export type MotionId = typeof motions[number]['id'];
export type Shortcut = {key:string;keys?:string[];modifiers:string[]};
export type GestureStep = {gesture:MotionId|'release-index'|'release-middle'|'rotation'|'movement';axis?:'x'|'y'|'z';direction?:'left'|'right'|'any'};
export type ApiAction={type:'api-call';method:string;url:string;headers:Record<string,string>;body:string;timeoutMs:number};
export function validApiAction(a:unknown):a is ApiAction{const v=a as ApiAction;if(!v||v.type!=='api-call')return false;try{const u=new URL(v.url);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&/^[A-Z]+$/.test(v.method)&&!!v.headers&&typeof v.headers==='object'&&!Array.isArray(v.headers)&&Object.entries(v.headers).every(([k,val])=>/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(k)&&typeof val==='string'&&!/[\r\n]/.test(val))&&typeof v.body==='string'&&(!['GET','HEAD'].includes(v.method)||!v.body)&&Number.isInteger(v.timeoutMs)&&v.timeoutMs>=1000&&v.timeoutMs<=120000;}catch{return false;}}
export const macActions=[
 {id:'open-app',label:'Open an app',group:'Apps'},
 {id:'open-shortcuts',label:'Open Apple Shortcuts',group:'Apps'},
 {id:'volume-up',label:'Volume up',group:'Sound & display'},
 {id:'volume-down',label:'Volume down',group:'Sound & display'},
 {id:'mute',label:'Toggle mute',group:'Sound & display'},
 {id:'brightness-up',label:'Brightness up',group:'Sound & display'},
 {id:'brightness-down',label:'Brightness down',group:'Sound & display'},
 {id:'sleep-display',label:'Sleep display',group:'Sound & display'},
 {id:'minimize-window',label:'Minimize window',group:'Current app'},
 {id:'hide-app',label:'Hide app',group:'Current app'},
 {id:'close-window',label:'Close window',group:'Current app'},
 {id:'quit-app',label:'Quit app',group:'Current app'},
 {id:'show-desktop',label:'Show desktop',group:'Current app'},
] as const;
export type MacAction={type:'macos-action';action:typeof macActions[number]['id'];app?:string};
export function validMacAction(a:unknown):a is MacAction{const v=a as MacAction;return !!v&&v.type==='macos-action'&&macActions.some(m=>m.id===v.action)&&(v.action!=='open-app'||(typeof v.app==='string'&&v.app.trim().length>0&&v.app.length<=256&&!/[\x00-\x1f]/.test(v.app)));}
export function macActionLabel(a:MacAction){return a.action==='open-app'?`Open ${a.app}`:macActions.find(m=>m.id===a.action)?.label??'macOS action';}
export type ActionStep = {type:'shortcut';shortcut:Shortcut}|MacAction|ApiAction|{type:'move-profile';direction:'up'|'down'}|{type:'change-profile';profileId:string};
export type ActionSequence={type:'sequence';actions:ActionStep[]};
export function validActionStep(a:unknown):a is ActionStep{const v=a as ActionStep;return !!v&&(v.type==='shortcut'?validShortcut(v.shortcut):!['sequence','open-profile-picker'].includes(v.type)&&validAppAction(v));}
export type AppAction=ActionSequence|MacAction|ApiAction|{type:'open-profile-picker'}|{type:'move-profile';direction:'up'|'down'}|{type:'change-profile';profileId:string};
export function validAppAction(a:unknown):a is AppAction{const v=a as AppAction;return !!v&&((v.type==='sequence'&&Array.isArray(v.actions)&&v.actions.length>=2&&v.actions.length<=16&&v.actions.every(validActionStep))||validMacAction(v)||validApiAction(v)||v.type==='open-profile-picker'||(v.type==='move-profile'&&['up','down'].includes(v.direction))||(v.type==='change-profile'&&typeof v.profileId==='string'&&!!v.profileId));}
export type Assignment = {id:string;enabled:boolean;shortcut:Shortcut|null;appAction?:AppAction;steps?:GestureStep[];intervalMs?:number};
export const comboTimes=[200,300,500,750,1000,1500,2000,3000,5000];
export function activeHolds(steps:GestureStep[]){
 const held=new Set<string>();
 for(const s of steps){if(s.gesture.startsWith('hold-'))held.add(s.gesture.slice(5));if(s.gesture.startsWith('release-'))held.delete(s.gesture.slice(8));}
 return held;
}
export function validHoldOrder(steps:GestureStep[]){
 const held=new Set<string>();
 for(const s of steps){
  const [action,finger]=s.gesture.split('-');
  if(action==='hold'){if(held.has(finger))return false;held.add(finger);}
  if(action==='release'){if(!held.has(finger))return false;held.delete(finger);}
 }
 return true;
}
export function holdSpans(steps:GestureStep[]){
 const spans:{finger:string;start:number;end:number}[]=[];
 const open=new Map<string,number>();
 steps.forEach((s,i)=>{const [action,finger]=s.gesture.split('-');if(action==='hold')open.set(finger,i);if(action==='release'&&open.has(finger)){spans.push({finger,start:open.get(finger)!,end:i});open.delete(finger);}});
 open.forEach((start,finger)=>spans.push({finger,start,end:steps.length-1}));
 return spans;
}
export function validSteps(steps:unknown):steps is GestureStep[]{return Array.isArray(steps)&&steps.length>=2&&steps.length<=8&&steps.every(s=>s&&(s.direction===undefined||(s.gesture==='rotation'&&['left','right','any'].includes(s.direction)))&&(motions.some(m=>m.id===s.gesture)||['release-index','release-middle'].includes(s.gesture)||(['rotation','movement'].includes(s.gesture)&&['x','y','z'].includes(s.axis))))&&validHoldOrder(steps);}
export const modifierKeys = [{id:'command',symbol:'⌘',name:'Command'},{id:'option',symbol:'⌥',name:'Option'},{id:'control',symbol:'⌃',name:'Control'},{id:'shift',symbol:'⇧',name:'Shift'}];
export const keyNames:Record<string,string>={ArrowLeft:'←',ArrowRight:'→',ArrowUp:'↑',ArrowDown:'↓',Enter:'↵',Backspace:'⌫',Delete:'⌦',Escape:'esc',Tab:'⇥',Space:'space'};
export const availableKeys=[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',...'0123456789','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space','Enter','Tab','Backspace','Delete','Escape','-','=','[',']',';',"'",',','.','/','\\','`',...Array.from({length:12},(_,i)=>`F${i+1}`)];
export function shortcutKeys(s:Shortcut){return s.keys??[s.key];}
export function validShortcut(s:unknown):s is Shortcut {const v=s as Shortcut;return !!v&&availableKeys.includes(v.key)&&(v.keys===undefined||(Array.isArray(v.keys)&&v.keys.length>0&&v.keys[0]===v.key&&new Set(v.keys).size===v.keys.length&&v.keys.every(k=>availableKeys.includes(k))))&&Array.isArray(v.modifiers)&&v.modifiers.every(m=>modifierKeys.some(k=>k.id===m));}
export function loadAssignments():Assignment[]{
 let saved:unknown=[];try{saved=JSON.parse(localStorage.getItem('neural.assignments.v1')||'[]');}catch{}
 return normalizeAssignments(saved);
}
export function canOpenProfilePicker(id:string){return !id.startsWith('tap-')&&!id.startsWith('double-tap-');}
export function normalizeAssignments(value:unknown):Assignment[]{
 let saved:Assignment[]=Array.isArray(value)?value:[];
 if(!Array.isArray(saved))saved=[];
 saved=saved.map(a=>a?.appAction?.type==='open-profile-picker'&&!canOpenProfilePicker(a.id)?{...a,appAction:undefined,enabled:false,shortcut:null}:a);
 const base:Assignment[]=motions.map(m=>{const a=saved.find(a=>a?.id===m.id||(m.id==='double-tap-index'&&a?.id==='double-tap'));return {id:m.id,appAction:validAppAction(a?.appAction)?a.appAction:undefined,enabled:!!a?.enabled&&(validShortcut(a?.shortcut)||validAppAction(a?.appAction)),shortcut:validShortcut(a?.shortcut)?a.shortcut:null};});
 const ids=new Set(base.map(a=>a.id));
 for(const a of saved){if(a&&typeof a.id==='string'&&a.id.startsWith('combo-')&&!ids.has(a.id)&&validSteps(a.steps)&&comboTimes.includes(a.intervalMs!)){ids.add(a.id);base.push({id:a.id,steps:a.steps,intervalMs:a.intervalMs,appAction:validAppAction(a.appAction)?a.appAction:undefined,enabled:!!a.enabled&&(validShortcut(a.shortcut)||validAppAction(a.appAction)),shortcut:validShortcut(a.shortcut)?a.shortcut:null});}}
 return base;
}
export function shortcutLabel(s:Shortcut){return [...modifierKeys.filter(m=>s.modifiers.includes(m.id)).map(m=>m.name),...shortcutKeys(s)].join(' + ');}
