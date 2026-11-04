import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {playAirResult} from './connectBell';
import {pathData,type Point2} from './airGesture';

type Preview={active:boolean;attemptId?:string;points?:Point2[];result?:'success'|'failure';resultId?:string};
// One radian of projected wrist travel initially spans 160 view units (53 logical pixels).
// Keep the origin fixed; expand the view only when a stroke approaches the rim.
export function airPreviewScale(points:Point2[],previous=160){
 const radius=points.reduce((max,[x,y])=>Math.max(max,Math.hypot(x,y)),0);
 return radius>0?Math.min(previous,88/radius):previous;
}
export function AirCursorOverlay(){
 const [preview,setPreview]=useState<Preview>({active:false});
 const [visible,setVisible]=useState(false);
 const motion=useRef<HTMLDivElement>(null);
 const exitTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const lastResult=useRef('');
 const view=useRef({attemptId:'',scale:160});
 useEffect(()=>{
  document.documentElement.classList.add('air-cursor-page');
  const unsubscribe=window.band?.onMessage(message=>{
   if(message.kind==='air_preview'){
    clearTimeout(exitTimer.current);
    if(message.active!==true){setPreview(previous=>({...previous,active:false}));exitTimer.current=setTimeout(()=>setVisible(false),180);return;}
    setVisible(true);
    const points=Array.isArray(message.points)?message.points.filter((p:unknown)=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)).slice(0,4097) as Point2[]:[];
    const attemptId=typeof message.attemptId==='string'?message.attemptId:'';
    if(view.current.attemptId!==attemptId)view.current={attemptId,scale:160};
    view.current.scale=airPreviewScale(points,view.current.scale);
    const result=message.result==='success'||message.result==='failure'?message.result:undefined;
    const resultId=typeof message.resultId==='string'?message.resultId:attemptId;
    setPreview({active:message.active===true,attemptId,points,result,resultId});
   }
   if(message.kind==='state'&&message.state!=='connected'){lastResult.current='';clearTimeout(exitTimer.current);setPreview(previous=>({...previous,active:false}));exitTimer.current=setTimeout(()=>setVisible(false),180);}
  });
  window.band?.send({action:'air_preview_ready'});
  return()=>{clearTimeout(exitTimer.current);unsubscribe?.();document.documentElement.classList.remove('air-cursor-page');};
 },[]);
 useEffect(()=>{
  if(preview.result&&lastResult.current!==preview.resultId){
   lastResult.current=preview.resultId??'';
   playAirResult(preview.result==='success');
  }
 },[preview.result,preview.resultId]);
 useLayoutEffect(()=>{
  const element=motion.current;if(!element||!visible)return;
  const target=preview.active?'scale(1)':'scale(0)';
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){element.style.transform=target;element.style.opacity=preview.active?'1':'0';return;}
  const animation=element.animate([{transform:getComputedStyle(element).transform,opacity:getComputedStyle(element).opacity},{transform:target,opacity:preview.active?1:0}],{duration:preview.active?220:160,easing:preview.active?'cubic-bezier(.16,1,.3,1)':'cubic-bezier(.4,0,1,1)',fill:'forwards'});
  return()=>{const current=getComputedStyle(element);element.style.transform=current.transform;element.style.opacity=current.opacity;animation.cancel();};
 },[visible,preview.active]);
 if(!visible)return null;
 const scale=view.current.scale;
 const points=(preview.points??[]).map(([x,y])=>[120+x*scale,120+y*scale] as Point2);
 return <div className="air-cursor-disc"><div ref={motion} className="air-cursor-motion"><svg className="air-cursor-art" width="80" height="80" viewBox="0 0 240 240" role="img" aria-label={preview.result==='success'?'Air gesture succeeded':preview.result==='failure'?'Air gesture failed':'Live air gesture stroke'}>
  <circle cx="120" cy="120" r="108" fill="#242424"/>
  {preview.result&&<circle key={preview.resultId} className="air-cursor-fill" cx="120" cy="120" r="108" fill={preview.result==='success'?'#c57aee':'#fff'}/>}
  {preview.active&&!preview.result&&<>
   <path d={pathData(points)} fill="none" stroke={preview.result==='failure'?'#242424':'#fff'} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"/>
   <circle cx="120" cy="120" r="3.5" fill={preview.result==='failure'?'#242424':'#fff'}/>
  </>}
  <circle cx="120" cy="120" r="108" fill="none" stroke="#fff" strokeWidth="3"/>
 </svg></div></div>;
}
