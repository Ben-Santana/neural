import {useMemo,useState} from 'react';

type Point=[number,number,number];
const chains=[[6,7,0],[8,9,10,1],[11,12,13,2],[14,15,16,3],[17,18,19,4]];
const views={Palm:[0,0],Oblique:[-.6,.35],Side:[-Math.PI/2,.1]} as const;
export function projectLandmark([x,y,z]:number[],yaw:number,pitch:number):Point{
 const horizontal=z*Math.cos(yaw)+y*Math.sin(yaw),depth=y*Math.cos(yaw)-z*Math.sin(yaw);
 return [horizontal,-x*Math.cos(pitch)+depth*Math.sin(pitch),x*Math.sin(pitch)+depth*Math.cos(pitch)];
}
export function PoseHand({landmarks,frame}:{landmarks:number[][][];frame:number}){
 const [view,setView]=useState<keyof typeof views>('Oblique');
 const [yaw,pitch]=views[view];
 const projected=useMemo(()=>landmarks.map(pose=>pose.map(p=>projectLandmark(p,yaw,pitch))),[landmarks,yaw,pitch]);
 const bounds=useMemo(()=>{
  const points=projected.flat();
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  return {x:(minX+maxX)/2,y:(minY+maxY)/2,scale:Math.min(440/Math.max(1,maxX-minX),265/Math.max(1,maxY-minY))};
 },[projected]);
 const points=projected[Math.min(frame,projected.length-1)];
 if(!points||points.length!==21||!points.every(p=>p.every(Number.isFinite)))return <p>Hand geometry is unavailable for this frame.</p>;
 const screen=(index:number)=>[280+(points[index][0]-bounds.x)*bounds.scale,167+(points[index][1]-bounds.y)*bounds.scale];
 const segments=chains.flatMap((chain,finger)=>chain.slice(1).map((end,i)=>({start:chain[i],end,finger,depth:(points[chain[i]][2]+points[end][2])/2,width:finger===0?16:14-i*2})));
 const palm=[5,17,14,11,8,6];
 const wrist=screen(5),outer=screen(17),inner=screen(8);
 const wristEdge=[(outer[0]-inner[0])*.24,(outer[1]-inner[1])*.24];
 const palmOutline=[[wrist[0]+wristEdge[0],wrist[1]+wristEdge[1]],...palm.slice(1).map(screen),[wrist[0]-wristEdge[0],wrist[1]-wristEdge[1]]];
 const layers=[{kind:'palm' as const,depth:palm.reduce((total,i)=>total+points[i][2],0)/palm.length},...segments.map(segment=>({kind:'bone' as const,...segment}))].sort((a,b)=>a.depth-b.depth);
 return <div className="pose-hand">
  <div className="pose-hand-toolbar"><span>Predicted hand</span><div role="group" aria-label="Hand viewing angle">{(Object.keys(views) as (keyof typeof views)[]).map(name=><button key={name} aria-pressed={view===name} onClick={()=>setView(name)}>{name}</button>)}</div></div>
  <svg className="pose-hand-model" viewBox="0 0 560 335" role="img" aria-label={`Predicted hand articulation, frame ${frame+1}, ${view.toLowerCase()} view`}>
   <g strokeLinejoin="round" strokeLinecap="round">{layers.map(layer=>layer.kind==='palm'?<g key="palm"><polygon points={palmOutline.map(point=>point.join(',')).join(' ')} fill="#e8e8e8" stroke="#666" strokeWidth="1.3"/>{[8,11,14,17].map(index=><path key={index} d={`M${screen(5).join(' ')}L${screen(index).join(' ')}`} stroke="#ccc" strokeWidth="1"/>)}</g>:<g key={`${layer.start}-${layer.end}`} data-finger={layer.finger}><path className="pose-bone" d={`M${screen(layer.start).join(' ')}L${screen(layer.end).join(' ')}`} stroke="#555" strokeWidth={layer.width+2}/><path d={`M${screen(layer.start).join(' ')}L${screen(layer.end).join(' ')}`} stroke={layer.finger===0?'#ececec':'#f4f4f4'} strokeWidth={layer.width}/><circle cx={screen(layer.start)[0]} cy={screen(layer.start)[1]} r="2" fill="#a0a0a0"/></g>)}</g>
  </svg>
  <p>Meta’s generic hand geometry · Wrist fixed in place</p>
 </div>;
}
