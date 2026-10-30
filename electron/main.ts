import { app, BrowserWindow, ipcMain, systemPreferences, shell, Tray, Menu, nativeImage, screen } from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let worker: ChildProcessWithoutNullStreams | undefined;
let window: BrowserWindow;
let tray: Tray | undefined;
let picker: BrowserWindow | undefined;
let pickerProfiles: {id:string;name:string;icon?:string}[] = [];
let pickerActive = '';
let pickerOpen = false;
let pickerOpener: string | undefined;
let pickerSelected = 0;
let pickerAngle = 0;
let pickerOrigin: number[] | undefined;
let pickerLastDelta = 0;
let pickerRotation = 0;
let pickerSlot = 0;
let lastOrientation: number[] | undefined;
let pickerHideTimer: ReturnType<typeof setTimeout> | undefined;
let pickerTimer: ReturnType<typeof setTimeout> | undefined;
const workerCommand = (command:unknown) => worker?.stdin.write(JSON.stringify(command)+'\n');
function pickerState(){picker?.webContents.send('band:message',{kind:'picker_state',state:{profiles:pickerProfiles,selected:pickerSelected,angle:pickerAngle}});}
function closePicker(select=false){
 if(!pickerOpen)return;
 pickerOpen=false;clearTimeout(pickerTimer);
 picker?.webContents.send('band:message',{kind:'picker_close'});
 clearTimeout(pickerHideTimer);pickerHideTimer=setTimeout(()=>{if(!pickerOpen)picker?.hide();},320);
 if(select&&pickerProfiles[pickerSelected])publish({kind:'app_action',action:{type:'change-profile',profileId:pickerProfiles[pickerSelected].id}});
 workerCommand({action:'profile_picker',open:false});
}
function openPicker(){
 if(pickerOpen)return;
 if(!pickerProfiles.length){workerCommand({action:'profile_picker',open:false});return;}
 clearTimeout(pickerHideTimer);pickerOpen=true;pickerSelected=Math.max(0,pickerProfiles.findIndex(p=>p.id===pickerActive));
 pickerAngle=pickerSelected/pickerProfiles.length*Math.PI*2;pickerOrigin=lastOrientation;pickerLastDelta=0;pickerRotation=0;pickerSlot=pickerSelected;
 workerCommand({action:'profile_picker',open:true});
 const area=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
 if(!picker){
  picker=new BrowserWindow({width:520,height:640,show:false,frame:false,transparent:true,resizable:false,focusable:false,skipTaskbar:true,hasShadow:false,alwaysOnTop:true,webPreferences:{preload:path.join(root,'dist-electron/preload.cjs'),backgroundThrottling:false,contextIsolation:true,nodeIntegration:false,sandbox:true}});
  picker.setAlwaysOnTop(true,'screen-saver');picker.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
  picker.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  picker.webContents.on('will-navigate',event=>event.preventDefault());
  picker.webContents.on('did-finish-load',()=>{if(pickerOpen){pickerState();picker?.webContents.send('band:message',{kind:'picker_open'});picker?.showInactive();}});
  if(process.argv.includes('--dev')||!fs.existsSync(path.join(root,'dist/index.html')))picker.loadURL('http://127.0.0.1:5190/?profile-picker');
  else picker.loadFile(path.join(root,'dist/index.html'),{query:{'profile-picker':'1'}});
 }
 picker.setPosition(Math.round(area.x+(area.width-520)/2),Math.round(area.y+(area.height-640)/2));
 if(!picker.webContents.isLoading()){pickerState();picker.webContents.send('band:message',{kind:'picker_open'});picker.showInactive();}
 pickerTimer=setTimeout(()=>closePicker(),30000);
}
function pickerMessage(message:any){
 if(message.kind==='events')for(const event of message.events??[]){
  const q=event.values;
  if(event.type!=='Orientation'||!Array.isArray(q)||q.length!==4||!q.every(Number.isFinite))continue;
  const norm=Math.hypot(...q);if(norm<1e-8)continue;
  lastOrientation=q.map((v:number)=>v/norm);
  if(!pickerOpen)continue;
  if(!pickerOrigin){pickerOrigin=lastOrientation;continue;}
  const [w,x,y,z]=pickerOrigin,[a,b,c,d]=lastOrientation!;
  const scalar=w*a+x*b+y*c+z*d,axis=w*c+x*d-y*a-z*b;
  let delta=2*Math.atan2(axis,scalar);delta=Math.atan2(Math.sin(delta),Math.cos(delta));
  const base=Math.max(0,pickerProfiles.findIndex(p=>p.id===pickerActive))/pickerProfiles.length*Math.PI*2;
  // Unwrap orientation at ±π, then use a Schmitt threshold to prevent boundary chatter.
  pickerRotation+=Math.atan2(Math.sin(delta-pickerLastDelta),Math.cos(delta-pickerLastDelta));
  pickerLastDelta=delta;
  pickerAngle=base+pickerRotation*2;
  const slot=pickerAngle/(Math.PI*2)*pickerProfiles.length;
  if(Math.abs(slot-pickerSlot)>0.64)pickerSlot=Math.round(slot);
  pickerSelected=((pickerSlot%pickerProfiles.length)+pickerProfiles.length)%pickerProfiles.length;
  pickerState();
 }
 if(message.kind==='app_action'&&message.action?.type==='open-profile-picker')openPicker();
 else if(pickerOpen&&message.kind==='motion'){
  if(message.motion==='double-tap-index')closePicker(true);
  else if(message.motion===pickerOpener)closePicker();
 }
 if(message.kind==='state'&&message.state==='disconnected')closePicker();
}
let quitting = false;
let runInBackground = false;
const preferencesPath = () => path.join(app.getPath('userData'), 'app-settings.json');
function settings() {
  const login = process.platform === 'darwin' ? app.getLoginItemSettings() : undefined;
  return {runInBackground, openAtLogin: login?.openAtLogin ?? false, loginAvailable: process.platform === 'darwin' && app.isPackaged, loginStatus: login?.status};
}
function showWindow() {
  app.dock?.show();
  window.show();
  window.focus();
}
function hideWindow() {
  window.hide();
  app.dock?.hide();
}
function ensureTray() {
  if (tray) return;
  const pixels = Buffer.alloc(18 * 18 * 4);
  const points = [[2,10],[5,10],[7,3],[11,15],[13,8],[16,8]];
  for (let segment = 1; segment < points.length; segment++) {
    const [x0,y0] = points[segment-1], [x1,y1] = points[segment];
    const steps = Math.max(Math.abs(x1-x0), Math.abs(y1-y0)) * 3;
    for (let step = 0; step <= steps; step++) {
      const x = Math.round(x0+(x1-x0)*step/steps), y = Math.round(y0+(y1-y0)*step/steps);
      pixels[(y*18+x)*4+3] = 255;
      if (x+1 < 18) pixels[(y*18+x+1)*4+3] = 255;
    }
  }
  const icon = nativeImage.createFromBitmap(pixels, {width:18,height:18,scaleFactor:1});
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('Neural');
  tray.setContextMenu(Menu.buildFromTemplate([{label:'Open Neural',click:showWindow},{type:'separator'},{label:'Quit Neural',click:()=>app.quit()}]));
  tray.on('click', showWindow);
}
ipcMain.handle('app:settings', (event, update) => {
  if (event.sender !== window.webContents) throw new Error('Unknown settings sender');
  if (update) {
    if (typeof update.openAtLogin === 'boolean') {
      if (!settings().loginAvailable) throw new Error('Install the packaged macOS app to enable launch at login.');
      app.setLoginItemSettings({openAtLogin:update.openAtLogin});
      const login = app.getLoginItemSettings();
      if (update.openAtLogin && !login.openAtLogin && login.status !== 'requires-approval') throw new Error('macOS could not enable launch at login. Check System Settings → General → Login Items.');
    }
    if (typeof update.runInBackground === 'boolean') {
      fs.mkdirSync(app.getPath('userData'), {recursive:true});
      fs.writeFileSync(preferencesPath(), JSON.stringify({runInBackground:update.runInBackground}));
      runInBackground = update.runInBackground;
      if (runInBackground) ensureTray();
      else if (!window.isVisible()) showWindow();
    }
  }
  return settings();
});
const publish = (message: unknown) => { pickerMessage(message); if (window && !window.isDestroyed()) window.webContents.send('band:message', message); };
function startWorker() {
  if (worker) return;
  const localPython = path.join(root, '.venv/bin/python');
  const bundledPython = path.join(process.resourcesPath, 'runtime/bin/python3.12');
  const executable = app.isPackaged ? bundledPython : (process.env.BAND_PYTHON || (fs.existsSync(localPython) ? localPython : 'python3'));
  worker = spawn(executable, ['-u', path.join(root, 'python/bridge.py')], { cwd: app.isPackaged ? app.getPath('userData') : root, env: {...process.env, PYTHONHOME: app.isPackaged ? path.join(process.resourcesPath, 'runtime') : process.env.PYTHONHOME, PYTHONNOUSERSITE:'1', PYTHONDONTWRITEBYTECODE:'1'} });
  createInterface({input:worker.stdout}).on('line', line => { try { publish(JSON.parse(line)); } catch { publish({kind:'error',message:'Invalid bridge response'}); } });
  worker.stderr.on('data', data => publish({kind:'log',message:data.toString().slice(0,2000)}));
  worker.on('error', error => publish({kind:'error',message:error.message}));
  worker.on('exit', code => {worker=undefined; publish({kind:'state',state:'disconnected'}); if(code) publish({kind:'error',message:`Python bridge exited (${code}). Check the Python environment.`});});
}
ipcMain.on('band:command', (event, command) => {
  if(!command)return;
  if(event.sender===picker?.webContents){
    if(command.action==='picker_cancel')closePicker();
    if(command.action==='picker_select'){const index=pickerProfiles.findIndex(p=>p.id===command.profileId);if(index>=0){pickerSelected=index;closePicker(true);}}
    return;
  }
  if(event.sender !== window.webContents)return;
  if(command.action==='configure_shortcuts'){
    const opener=Array.isArray(command.assignments)?command.assignments.find((a:any)=>a?.enabled&&a.appAction?.type==='open-profile-picker'&&typeof a.id==='string'&&!a.id.startsWith('tap-')&&!a.id.startsWith('double-tap-')):undefined;
    pickerOpener=opener?.id;
  }
  if(command.action==='picker_profiles'){
    if(Array.isArray(command.profiles))pickerProfiles=command.profiles.filter((p:any)=>p&&typeof p.id==='string'&&typeof p.name==='string');
    pickerActive=command.activeId;
    if(pickerOpen)closePicker();
    return;
  }
  if(command.action === 'accessibility') {
    if(process.platform === 'darwin') { systemPreferences.isTrustedAccessibilityClient(true); shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'); }
    return;
  }
  if(!['configure_shortcuts','suspend_shortcuts','discover','connect','disconnect','enroll','shutdown'].includes(command.action)) return;
  startWorker(); worker?.stdin.write(JSON.stringify(command)+'\n');
});
if (!app.requestSingleInstanceLock()) app.quit();
else app.on('second-instance', () => { if (window) showWindow(); });
app.whenReady().then(() => {
  try { runInBackground = JSON.parse(fs.readFileSync(preferencesPath(), 'utf8')).runInBackground === true; } catch { /* First launch uses defaults. */ }
  const backgroundLaunch = process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin;
  if (runInBackground || backgroundLaunch) ensureTray();
  window = new BrowserWindow({show:!backgroundLaunch,width:1450,height:950,minWidth:860,minHeight:680,title:'Neural — Motions',backgroundColor:'#ffffff',titleBarStyle:'hiddenInset',webPreferences:{preload:path.join(root,'dist-electron/preload.cjs'),backgroundThrottling:false,contextIsolation:true,nodeIntegration:false,sandbox:true}});
  window.on('close', event => {
    if (!quitting && runInBackground) { event.preventDefault(); hideWindow(); }
  });
  if (backgroundLaunch) app.dock?.hide();
  app.on('activate', showWindow);
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',(event,url)=>{ if(!url.startsWith('http://127.0.0.1:5190/') && !url.startsWith('file://')) event.preventDefault(); });
  if(process.argv.includes('--dev') || !fs.existsSync(path.join(root,'dist/index.html'))) window.loadURL('http://127.0.0.1:5190');
  else window.loadFile(path.join(root,'dist/index.html'));
});
app.on('before-quit', event => {const alreadyQuitting=quitting;quitting=true;if(worker && !alreadyQuitting){event.preventDefault();worker.stdin.write('{"action":"shutdown"}\n');const timeout=setTimeout(()=>{worker?.kill();app.quit();},5000);worker.once('exit',()=>{clearTimeout(timeout);app.quit();});}});
app.on('window-all-closed',()=>app.quit());
