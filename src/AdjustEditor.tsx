import {useRef,useState} from 'react';
import {ArrowDown,ArrowUp,Rotate3D,Move3D,Gauge,X} from 'lucide-react';
import {ComboDropdown} from './MotionSettings';
import {AdjustActionSlot} from './AdjustActionSlot';
import type {CSSProperties} from 'react';
import {validAdjustAction,type AdjustAction,type AppAction,type AdjustOutput} from './shortcuts';

export function AdjustEditor({initial,onSave,onCancel,onActivate,onRemove,profiles=[],autoOpen=false,dragHandle}:{initial?:AppAction;onSave:(action:AdjustAction)=>void;onCancel:()=>void;onActivate:()=>void;onRemove:()=>void;autoOpen?:boolean;profiles?:{id:string;name:string}[];dragHandle?:{onDragStart:(event:React.DragEvent)=>void;onDragEnd:()=>void}}){
 const saved=initial?.type==='adjust'?initial:undefined;
 const [movement,setMovement]=useState<AdjustAction['movement']>(saved?.movement??'rotation');
 const [axis,setAxis]=useState<AdjustAction['axis']>(saved?.axis??'y');
 const [sensitivity,setSensitivity]=useState(saved?.sensitivity??5);
 const [increase,setIncrease]=useState<AdjustOutput|null>(saved?.increase??null);
 const [decrease,setDecrease]=useState<AdjustOutput|null>(saved?.decrease??null);
 const [choosing,setChoosing]=useState<'decrease'|'increase'|null>(null);
 const root=useRef<HTMLDivElement>(null);
 function commit(change:Partial<AdjustAction>){
  const next={type:'adjust' as const,movement,axis,sensitivity,increase:increase!,decrease:decrease!,...change};
  setMovement(next.movement);setAxis(next.axis);setSensitivity(next.sensitivity);setIncrease(next.increase);setDecrease(next.decrease);
  if(validAdjustAction(next))onSave(next);
 }
 return <div ref={root} className="adjust-inline" role="group" aria-label="Adjust actions" onPointerDown={onActivate} onFocusCapture={onActivate} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onCancel();}}}>
  <span className={dragHandle?'output-drag-handle':undefined} draggable={!!dragHandle} title={dragHandle?'Drag to another gesture or profile':undefined} onDragStart={dragHandle?.onDragStart} onDragEnd={dragHandle?.onDragEnd}><Gauge className="movement-group-icon" size={18} strokeWidth={1.5} aria-label="Adjust"/></span>
  <div className="adjust-movement" inert={choosing!==null}>
 <button className="adjust-remove" aria-label="Remove adjust" disabled={choosing!==null} onClick={onRemove}><X size={12}/></button>
   <ComboDropdown label="Adjust movement" initialOpen={autoOpen} className="adjust-movement-dropdown" value={`${movement}:${axis}`} options={(['rotation','movement'] as const).flatMap(m=>['x','y','z'].map(a=>({value:`${m}:${a}`,label:`${m==='rotation'?'Rotation':'Movement'} · ${a.toUpperCase()} axis`})))} onChange={value=>{const [m,a]=value.split(':');commit({movement:m as typeof movement,axis:a as typeof axis});}}>{movement==='rotation'?<Rotate3D size={19}/>:<Move3D size={19}/>}<span>{axis.toUpperCase()}</span></ComboDropdown>
   <div className="adjust-sensitivity-popover" role="group" aria-label="Sensitivity">
    <input aria-label="Adjust sensitivity" title={`Sensitivity ${sensitivity}`} type="range" min="1" max="10" value={sensitivity} style={{'--adjust-fill':`${(sensitivity-1)/9*100}%`} as CSSProperties} onChange={e=>commit({sensitivity:Number(e.target.value)})}/>
   </div>
  </div>
  {(['decrease','increase'] as const).map(direction=>{
   const shortcut=direction==='increase'?increase:decrease;
   return <div className="adjust-direction" key={direction} inert={choosing!==null&&choosing!==direction}>
    {direction==='decrease'?<ArrowDown size={15} aria-label="Decrease movement"/>:<ArrowUp size={15} aria-label="Increase movement"/>}
    <AdjustActionSlot direction={direction==='decrease'?'left':'right'} value={shortcut??undefined} onRemove={()=>commit(direction==='increase'?{increase:null}:{decrease:null})} onChange={value=>commit(direction==='increase'?{increase:value}:{decrease:value})} profiles={profiles} onEditingChange={editing=>setChoosing(current=>editing?direction:current===direction?null:current)} dragHandle={dragHandle}/>
   </div>;
  })}

 </div>;
}
