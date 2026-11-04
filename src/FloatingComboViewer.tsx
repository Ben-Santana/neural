import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {GestureIcon} from './MotionSettings';
import {motions,type Assignment,type GestureStep} from './shortcuts';
import type {NotchViewerSides} from './types';
type Input=GestureStep&{id:number};
type Candidate={id:string;attemptId:string;matched:number;inputIds:number[];holding?:boolean;remainingMs?:number|null};
type Outcome={id:string;status:string;reason?:string;inputIds:number[]};
const label=(step:GestureStep)=>[motions.find(m=>m.id===step.gesture)?.name??(step.gesture==='air'?'Air gesture':step.gesture.replaceAll('-',' ')),step.axis?.toUpperCase(),step.direction&&step.direction!=='any'?step.direction:undefined].filter(Boolean).join(' · ');
const stepKey=(step:GestureStep)=>JSON.stringify([step.gesture,step.axis,step.direction??'any',step.air]);
type IconFlight={id:string;step:GestureStep;x:number;y:number;destination:number;selected:boolean;inputId:number;rightWidth:number};
function FlyingIcon({flight,onDone}:{flight:IconFlight;onDone:()=>void}){
 const node=useRef<HTMLSpanElement>(null);
 const finish=useRef(onDone);finish.current=onDone;
 const currentTransform=useRef('translate(0, 0)');
 const began=useRef(performance.now());
 useLayoutEffect(()=>{
  const animation=node.current!.animate(flight.selected
   ?[{transform:currentTransform.current,opacity:1},{transform:`translate(${flight.destination-flight.x}px, 0)`,opacity:1}]
   :[{transform:'translateY(0)',opacity:1},{transform:'translateY(-36px)',opacity:0}],
   {duration:flight.selected?Math.max(90,440-(performance.now()-began.current)):210,easing:flight.selected?'cubic-bezier(.22,1,.36,1)':'cubic-bezier(.4,0,1,1)',fill:'both'});
  animation.onfinish=()=>finish.current();
  return()=>{if(node.current)currentTransform.current=getComputedStyle(node.current).transform;animation.cancel();};
 },[flight]);
 return <span ref={node} className={`notch-flying-icon ${flight.selected?'selected':'dismissed'}`} style={{left:flight.x-11,top:flight.y-10}} aria-hidden="true"><GestureIcon gesture={flight.step.gesture} air={flight.step.air}/></span>;
}
export function FloatingComboViewer(){
 const [pinned,setPinned]=useState(false);
 const pinnedRef=useRef(false);
 const [radialName,setRadialName]=useState('');
 const [assignments,setAssignments]=useState<Assignment[]>([]);
 const [inputs,setInputs]=useState<Input[]>([]);
 const [candidates,setCandidates]=useState<Candidate[]>([]);
 const [outcome,setOutcome]=useState<Outcome>();
 const [recent,setRecent]=useState(false);
 const [notch,setNotch]=useState({width:200,height:32,offset:0});
 const [viewport,setViewport]=useState(window.innerWidth);
 const [sides,setSides]=useState<NotchViewerSides>('both');
 const sidesRef=useRef(sides);sidesRef.current=sides;
 const activeRef=useRef(false);
 const panelRef=useRef<HTMLElement>(null);
 const optionsRef=useRef<GestureStep[]>([]);
 const [flights,setFlights]=useState<IconFlight[]>([]);
 const [departed,setDeparted]=useState<string[]>([]);
 const departureInput=useRef<number|null>(null);
 const seenInputs=useRef(new Set<number>());
 useEffect(()=>{
  document.documentElement.classList.add('combo-overlay-page');
  const resize=()=>setViewport(window.innerWidth);window.addEventListener('resize',resize);
  let timer:ReturnType<typeof setTimeout>;
  const reset=()=>{clearTimeout(timer);setRadialName('');setCandidates([]);setOutcome(undefined);setInputs([]);setRecent(false);setFlights([]);setDeparted([]);departureInput.current=null;seenInputs.current.clear();};
  const expire=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(pinnedRef.current)return;setRecent(false);setOutcome(undefined);if(!activeRef.current&&!pinnedRef.current)setInputs([]);},1400);};
  const unsubscribe=window.band?.onMessage(message=>{
   if(message.kind==='cheat_sheet_visibility'){pinnedRef.current=message.open===true;setPinned(pinnedRef.current);if(!pinnedRef.current)expire();}
   if(message.kind==='radial_name')setRadialName(message.name??'');
   if(message.kind==='combo_viewer_geometry')setNotch({width:message.width,height:message.height,offset:message.offset??0});
   if(message.kind==='combo_viewer_config'){reset();setAssignments(message.assignments);setSides(message.sides==='left'||message.sides==='right'?message.sides:'both');}
   if(message.kind==='combo_viewer_preferences'&&['both','left','right'].includes(message.sides)){setSides(message.sides);setFlights([]);setDeparted([]);departureInput.current=null;}
   if(message.kind==='gesture_input'){
    const input=message.input as Input;
    const options=optionsRef.current;
    let departing:IconFlight[]=[];
    const chosen=options.find(step=>step.gesture===input.gesture&&step.axis===input.axis&&(!step.direction||step.direction==='any'||step.direction===input.direction)&&(!step.air||JSON.stringify(step.air)===JSON.stringify(input.air)));
    if(chosen&&!seenInputs.current.has(input.id)&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
     const panel=panelRef.current!;
     const source=panel.querySelector('.notch-options')!.getBoundingClientRect();
     const destination=panel.querySelector('.notch-performed')!.getBoundingClientRect().right-19;
     const icons=[...panel.querySelectorAll<HTMLElement>('.notch-option')];
     departing=options.map((step,index)=>{
      const rect=icons[index]?.getBoundingClientRect();
      return rect?{id:`${input.id}:${stepKey(step)}`,step,x:rect.x+rect.width/2,y:rect.y+rect.height/2,destination,selected:sidesRef.current==='both'&&step===chosen,inputId:input.id,rightWidth:source.width}:undefined;
     }).filter((flight):flight is IconFlight=>!!flight);
     setDeparted(options.map(stepKey));departureInput.current=input.id;
    }
    if(!seenInputs.current.has(input.id))setFlights(current=>[...current.map(flight=>flight.selected?{...flight,destination:flight.destination-22}:flight),...departing]);
    seenInputs.current.add(input.id);
    if(seenInputs.current.size>64)seenInputs.current.delete(seenInputs.current.values().next().value!);
    setInputs(current=>[...current.filter(i=>i.id!==message.input.id),message.input].slice(-32));setRecent(true);expire();
   }
   if(message.kind==='combo_progress'){
    // Countdown updates can still describe the previous step during recognition's
    // input buffer. Do not resurrect departing options until this input is processed.
    if(departureInput.current===null||!message.candidates?.length||message.candidates.some((candidate:Candidate)=>candidate.inputIds.includes(departureInput.current!))){setDeparted([]);departureInput.current=null;}
    setCandidates(message.candidates??[]);
    if(message.candidates?.length){clearTimeout(timer);setOutcome(undefined);}
    else expire();
   }
   if(message.kind==='combo_outcome'){
    setCandidates(current=>current.filter(c=>c.attemptId!==message.attemptId));
    setOutcome(current=>current?.status==='success'&&message.status!=='success'?current:{id:message.id,status:message.status,reason:message.reason,inputIds:message.inputIds});
    expire();
   }
   if(message.kind==='state'&&message.state!=='connected')reset();
  });
  // Request configuration only after the subscription exists; page load can precede React effects.
  window.band?.send({action:'combo_viewer_ready'});
  return()=>{unsubscribe?.();clearTimeout(timer);window.removeEventListener('resize',resize);document.documentElement.classList.remove('combo-overlay-page');};
 },[]);
 const active=candidates.filter(c=>assignments.some(a=>a.id===c.id&&a.enabled&&a.steps));
 activeRef.current=active.length>0;
 const expanded=pinned||!!radialName||active.length>0||!!outcome||recent;
 const performed=inputs.slice(-4);
 const [snapshot,setSnapshot]=useState<{performed:Input[];next:GestureStep[]}>({performed:[],next:[]});
 useLayoutEffect(()=>{
  // Freeze the icons throughout closing so clearing recognition state cannot flash different content.
  if(!expanded)return;
  const options:GestureStep[]=active.flatMap(c=>assignments.find(a=>a.id===c.id)!.steps!.slice(c.matched,c.matched+1));
  const next=options.filter((step,index)=>options.findIndex(other=>stepKey(other)===stepKey(step))===index);
  setSnapshot({performed,next});
 },[candidates,assignments,inputs,outcome,recent,pinned]);
 const center=viewport/2+notch.offset;
 const capacity=(room:number)=>Math.max(0,Math.floor((room-24)/22));
 const leftCapacity=capacity(center-notch.width/2);
 const leftIcons=sides!=='right'&&leftCapacity?snapshot.performed.slice(-leftCapacity):[];
 const rightIcons=sides!=='left'?snapshot.next.slice(0,capacity(viewport-center-notch.width/2)):[];
 optionsRef.current=rightIcons.filter(step=>!departed.includes(stepKey(step)));
 const nameWidth=Math.min(Math.max(0,center-notch.width/2-12),radialName.length*8+24,360);
 const leftTarget=radialName?nameWidth:expanded&&leftIcons.length?leftIcons.length*22+16:0;
 const rightTarget=Math.max(expanded&&rightIcons.length?rightIcons.length*22+16:0,...flights.map(flight=>flight.rightWidth));
 const historyRef=useRef<HTMLDivElement>(null);
 const historyIds=useRef(new Set<number>());
 useLayoutEffect(()=>{
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  historyRef.current?.querySelectorAll<HTMLElement>('[data-input-id]').forEach(node=>{
   const id=Number(node.dataset.inputId);
   if(!reduced&&!historyIds.current.has(id)&&!flights.some(f=>f.selected&&f.inputId===id)){
    node.animate([{transform:'translateX(14px)',opacity:0},{transform:getComputedStyle(node).transform,opacity:getComputedStyle(node).opacity}],{duration:320,easing:'cubic-bezier(.22,1,.36,1)'});
   }
  });
  historyIds.current=new Set(leftIcons.map(input=>input.id));
 },[snapshot.performed,sides]);
 const [shape,setShape]=useState({left:0,right:0,opacity:0});
 const shapeRef=useRef(shape);
 useLayoutEffect(()=>{
  const start=shapeRef.current;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const duration=reduced?0:expanded?220:340;
  const delay=!reduced&&!expanded?80:0;
  let frame=0;const began=performance.now();
  const tick=(now:number)=>{
   const t=duration?Math.max(0,Math.min(1,(now-began-delay)/duration)):1;
   const ease=1-Math.pow(1-t,3);
   const next={left:start.left+(leftTarget-start.left)*ease,right:start.right+(rightTarget-start.right)*ease,opacity:expanded?1:Math.min(start.opacity,(1-t)*5)};
   shapeRef.current=next;setShape(next);
   if(t<1)frame=requestAnimationFrame(tick);
  };
  tick(began);return()=>cancelAnimationFrame(frame);
 },[leftTarget,rightTarget,expanded]);
 useLayoutEffect(()=>{window.band?.send({action:'combo_viewer_shape',left:shape.left,right:shape.right});},[shape.left,shape.right]);
 const x=center-notch.width/2-shape.left;
 const right=center+notch.width/2+shape.right;
 const h=notch.height,topRadius=6,bottomRadius=9;
 const silhouette=`M ${x-topRadius} 0 Q ${x} 0 ${x} ${topRadius} L ${x} ${h-bottomRadius} Q ${x} ${h} ${x+bottomRadius} ${h} H ${right-bottomRadius} Q ${right} ${h} ${right} ${h-bottomRadius} V ${topRadius} Q ${right} 0 ${right+topRadius} 0 Z`;
 const style={'--notch-width':`${notch.width}px`,'--notch-height':`${notch.height}px`,'--notch-offset':`${notch.offset}px`,'--left-width':`${shape.left}px`,'--right-width':`${shape.right}px`,'--left-content-width':`${leftIcons.length*22+16}px`,'--right-content-width':`${rightIcons.length*22+16}px`} as CSSProperties;
 return <aside ref={panelRef} className={`notch-combo ${expanded?'expanded':''} ${outcome?.status??''}`} style={style} aria-label="Notch combo viewer" aria-live="polite" data-settled={!flights.length&&shape.left===leftTarget&&shape.right===rightTarget&&(expanded?shape.opacity===1:shape.opacity===0)}>
  <svg className="notch-surface" width={viewport} height={h} aria-hidden="true" style={{opacity:shape.opacity}}><path d={silhouette} fill="#000"/></svg>
  <div className="notch-wing notch-performed" aria-hidden={!expanded}>
   {radialName&&<div className="notch-radial-name" title={radialName} style={{width:nameWidth}}>{radialName}</div>}
   <div ref={historyRef} style={{visibility:radialName?'hidden':undefined}} className="notch-wing-content" role="list" aria-label="Gestures performed">{leftIcons.map((input,index)=><span role="listitem" aria-label={label(input)} data-input-id={input.id} data-age={leftIcons.length-1-index} style={{'--age':leftIcons.length-1-index,visibility:flights.some(f=>f.selected&&f.inputId===input.id)?'hidden':undefined} as CSSProperties} key={input.id}><GestureIcon gesture={input.gesture} air={input.air}/></span>)}</div>
  </div>
  <div className="notch-wing notch-options" aria-hidden={!expanded}>
   <div className="notch-wing-content" role="list" aria-label="Possible next gestures">{rightIcons.map(step=><span className="notch-option" role="listitem" aria-label={label(step)} style={{visibility:departed.includes(stepKey(step))?'hidden':undefined}} key={stepKey(step)}><GestureIcon gesture={step.gesture} air={step.air}/></span>)}</div>
  </div>
  <div className="notch-transfer-layer" aria-hidden="true">{flights.map(flight=><FlyingIcon key={flight.id} flight={flight} onDone={()=>setFlights(current=>current.filter(item=>item.id!==flight.id))}/>)}</div>
 </aside>;
}
