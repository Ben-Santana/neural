import {useEffect,useState,type CSSProperties} from 'react';
import {Check,X} from 'lucide-react';
import {GestureIcon} from './MotionSettings';
import {motions,type Assignment,type GestureStep} from './shortcuts';
type Input={id:number;at?:number;gesture:GestureStep['gesture'];axis?:'x'|'y'|'z';succeeded?:boolean};
type Trace={id:string;attemptId:string;inputIds:number[];holding?:boolean;remainingMs?:number|null;status?:'success'|'failure';reason?:string;hue:number;endedAt?:number};
export function ComboTracker({assignments}:{assignments:Assignment[]}){
 const [inputs,setInputs]=useState<Input[]>([]);
 const [traces,setTraces]=useState<Trace[]>([]);
 useEffect(()=>{
  function color(_attempt:string){return 285;}
  return window.band?.onMessage(message=>{
   if(message.kind==='gesture_input')setInputs(current=>[...current.filter(i=>i.id!==message.input.id),message.input].sort((a,b)=>(a.at??a.id)-(b.at??b.id)).slice(-5));
   if(message.kind==='combo_progress')setTraces(current=>{
    const ended=current.filter(t=>t.status&&Date.now()-(t.endedAt??0)<1400);
    return [...ended,...(message.candidates??[]).filter((t:Trace)=>!ended.some(e=>e.attemptId===t.attemptId)).map((t:Trace)=>({...t,hue:color(t.attemptId)}))];
   });
   if(message.kind==='combo_outcome'&&message.status==='success')setInputs(current=>current.map(input=>message.inputIds.includes(input.id)?{...input,succeeded:true}:input));
   if(message.kind==='combo_outcome')setTraces(current=>[...current.filter(t=>t.attemptId!==message.attemptId),{id:message.id,attemptId:message.attemptId,inputIds:message.inputIds,status:message.status,reason:message.reason,hue:color(message.attemptId),endedAt:Date.now()}]);
   if(message.kind==='state'&&message.state!=='connected'){setInputs([]);setTraces([]);}
  });
 },[]);
 useEffect(()=>{
  const timer=setInterval(()=>setTraces(current=>current.some(t=>t.endedAt&&Date.now()-t.endedAt>1400)?current.filter(t=>!t.endedAt||Date.now()-t.endedAt<=1400):current),200);
  return()=>clearInterval(timer);
 },[]);
 const combos=assignments.filter(a=>a.steps);
 const visible=traces.filter(t=>combos.some(a=>a.id===t.id));
 return <div className="combo-tracker" aria-label="Live gesture stream">
  <div className="input-stream" role="list" aria-label="Last five gestures">
   {!inputs.length&&<span className="stream-empty">Make a gesture</span>}
   {inputs.map((input,index)=>{
    const matches=visible.filter(t=>t.inputIds.includes(input.id));
    const outcome=matches.find(t=>t.status==='success')??[...matches].reverse().find(t=>t.status);
    const status=input.succeeded?'success':outcome?.status;
    const label=motions.find(m=>m.id===input.gesture)?.name??input.gesture.replaceAll('-',' ');
    return <div className="stream-slot" key={input.id} style={{transform:`translateX(-${(inputs.length-1-index)*48}px)`}} role="listitem" aria-label={label}>
     <div className="stream-arrival"><div className={`stream-input ${matches.length?'considered':''} ${status??''}`} style={{'--attempt-color':`hsl(${(outcome??matches[0])?.hue??285} 82% 79%)`} as CSSProperties} title={`${label}${input.axis?` · ${input.axis.toUpperCase()}`:''}${matches.length?` · ${matches.map(t=>`Combo ${combos.findIndex(a=>a.id===t.id)+1}: ${t.status??'considering'}`).join(', ')}`:''}`}>
      <GestureIcon gesture={input.gesture}/>{input.axis&&<small>{input.axis}</small>}
      {status&&<span className={`input-outcome ${status}`} key={status} aria-label={status}>{status==='success'?<Check size={10}/>:<X size={10}/>}</span>}
     </div></div>
    </div>;
   })}
  </div>
 </div>;
}
