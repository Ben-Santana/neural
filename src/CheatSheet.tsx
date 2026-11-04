import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {X,ArrowRight} from 'lucide-react';
import {GestureIcon,Keycaps} from './MotionSettings';
import {motions,macActionLabel,shortcutLabel,type Assignment,type AppAction,type GestureStep} from './shortcuts';

export function CheatSheet(){
 const [state,setState]=useState<{assignments:Assignment[];profiles:{id:string;name:string}[];profileName:string;descriptions?:Record<string,string>;notchHeight:number;originLeft?:number;originRight?:number;notchWidth?:number;notchCenter?:number}>({assignments:[],profiles:[],profileName:'Current profile',notchHeight:32});
 const panel=useRef<HTMLElement>(null);
 const opened=useRef(false);
 const [size,setSize]=useState({width:0,height:0});
 useLayoutEffect(()=>{
  const element=panel.current;if(!element)return;
  const observer=new ResizeObserver(([entry])=>{const {inlineSize:width,blockSize:height}=entry.borderBoxSize[0];setSize({width,height});});
  observer.observe(element);return()=>observer.disconnect();
 },[]);
 const [ready,setReady]=useState(false),[opening,setOpening]=useState(false),[closing,setClosing]=useState(false);
 const close=()=>window.band?.send({action:'cheat_sheet_close'});
 useLayoutEffect(()=>{
  const element=panel.current;if(!element||!ready)return;
  const {width,height}=element.getBoundingClientRect();
  const center=(state.notchCenter??window.innerWidth/2)-element.offsetLeft,half=(state.notchWidth??200)/2;
  // Use the same flush top shoulders as FloatingComboViewer.
  const topRadius=6;
  const silhouette=(left:number,right:number,h:number,bottomRadius:number)=>`path('M ${left-topRadius} 0 Q ${left} 0 ${left} ${topRadius} L ${left} ${h-bottomRadius} Q ${left} ${h} ${left+bottomRadius} ${h} H ${right-bottomRadius} Q ${right} ${h} ${right} ${h-bottomRadius} V ${topRadius} Q ${right} 0 ${right+topRadius} 0 Z')`;
  const collapsed=silhouette(Math.max(topRadius,state.originLeft!==undefined?state.originLeft-element.offsetLeft:center-half),Math.min(width-topRadius,state.originRight!==undefined?state.originRight-element.offsetLeft:center+half),state.notchHeight,9);
  const expanded=silhouette(topRadius,width-topRadius,height,22);
  if(!opening&&!closing){
   // Paint the exact starting surface while the native window is still hidden.
   element.style.clipPath=collapsed;
   let secondFrame=0;
   const firstFrame=requestAnimationFrame(()=>{secondFrame=requestAnimationFrame(()=>window.band?.send({action:'cheat_sheet_present'}));});
   return()=>{cancelAnimationFrame(firstFrame);cancelAnimationFrame(secondFrame);};
  }
  const current=getComputedStyle(element).clipPath;
  element.getAnimations().forEach(a=>a.cancel());
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animation=element.animate([{clipPath:closing||opened.current?current:collapsed},{clipPath:closing?collapsed:expanded}],{duration:reduced?1:closing?340:480,easing:closing?'cubic-bezier(.55,0,.3,1)':'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});
  opened.current=true;
  if(closing)animation.finished.then(()=>window.band?.send({action:'cheat_sheet_closed'})).catch(()=>{});
  return()=>{element.style.clipPath=getComputedStyle(element).clipPath;animation.cancel();};
 },[ready,opening,closing,size.width,size.height,state.notchWidth,state.notchHeight,state.notchCenter]);

 useEffect(()=>{
  document.documentElement.classList.add('cheat-sheet-page');
  const off=window.band?.onMessage(m=>{if(m.kind==='cheat_sheet_state'){setState(m as unknown as typeof state);setReady(true);}if(m.kind==='cheat_sheet_open')setOpening(true);if(m.kind==='cheat_sheet_origin'||m.kind==='cheat_sheet_dismiss')setState(current=>({...current,...(Number.isFinite(m.originLeft)&&Number.isFinite(m.originRight)?{originLeft:m.originLeft,originRight:m.originRight}:{})}));if(m.kind==='cheat_sheet_dismiss')setClosing(true);});
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')close();};window.addEventListener('keydown',escape);
  window.band?.send({action:'cheat_sheet_ready'});
  return()=>{off?.();window.removeEventListener('keydown',escape);document.documentElement.classList.remove('cheat-sheet-page');};
 },[]);
 function actionLabel(a:AppAction):string{
  switch(a.type){
   case 'show-cheat-sheet':return 'Profile cheat sheet';
   case 'macos-action':return macActionLabel(a);
   case 'type-text':return 'Type text';
   case 'api-call':return `${a.method} ${new URL(a.url).host}`;
   case 'change-profile':return `Profile: ${state.profiles.find(p=>p.id===a.profileId)?.name??'Missing profile'}`;
   case 'move-profile':return `Profile ${a.direction}`;
   case 'open-profile-picker':return 'Desktop profile picker';
   case 'radial-menu':return `Radial menu · ${a.items.map(i=>i.name?.trim()).filter(Boolean).join(', ')||`${a.items.length} actions`}`;
   case 'mouse-movement':return 'Mouse movement';
   case 'adjust':return `Adjust · ${a.movement} ${a.axis.toUpperCase()}`;
   case 'sequence':return a.actions.map(s=>s.type==='shortcut'?shortcutLabel(s.shortcut):actionLabel(s)).join(' → ');
  }
 }
 const rows=state.assignments.filter(a=>(a.shortcut||a.appAction)&&a.appAction?.type!=='show-cheat-sheet');
 return <section ref={panel} className={`cheat-sheet ${opening?'ready':''} ${closing?'closing':''}`} aria-label="Profile cheat sheet" style={{'--notch-height':`${state.notchHeight}px`,'--notch-width':`${state.notchWidth??200}px`,'--notch-center':`${(state.notchCenter??window.innerWidth/2)-16}px`} as CSSProperties}>
  <header><div><h1>{state.profileName}</h1><p>Gesture shortcuts</p></div><button aria-label="Close cheat sheet" onClick={close}><X size={18}/></button></header>
  <div className="cheat-sheet-rows" role="list">{rows.map(a=><div role="listitem" className={`cheat-sheet-row ${a.enabled?'':'disabled'}`} key={a.id}>
   <div className="cheat-sheet-gestures">{(a.steps??[{gesture:a.id} as GestureStep]).map((s,i)=>{const name=motions.find(m=>m.id===s.gesture)?.name??(s.gesture==='air'?'Air gesture':s.gesture.replaceAll('-',' '));return <span key={i} className="cheat-sheet-step" title={name}><GestureIcon gesture={s.gesture} air={s.air}/><span>{name}{s.axis?` ${s.axis.toUpperCase()}`:''}{s.direction&&s.direction!=='any'?` ${s.direction}`:''}</span>{i<(a.steps?.length??1)-1&&<ArrowRight size={12}/>}</span>;})}{!a.enabled&&<small>Disabled</small>}</div>
   <div className="cheat-sheet-output">{state.descriptions?.[a.id]?.trim()&&<span className="cheat-sheet-description">{state.descriptions[a.id]}</span>}<span className={state.descriptions?.[a.id]?.trim()?'cheat-sheet-original-output':undefined}>{a.appAction?actionLabel(a.appAction):a.shortcut?<Keycaps shortcut={a.shortcut}/>:null}</span></div>
  </div>)}</div>
  {!rows.length&&<p className="cheat-sheet-empty">No other shortcuts configured for this profile.</p>}
  <footer>Repeat the cheat sheet gesture to close</footer>
 </section>;
}
