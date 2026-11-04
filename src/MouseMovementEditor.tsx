import {useState} from 'react';
import {ArrowRight,ArrowUp,ArrowLeft,ArrowDown,Move3D,Rotate3D,MousePointer2,X} from 'lucide-react';
import {ComboDropdown} from './MotionSettings';
import type {AppAction,MouseAction,MouseInput} from './shortcuts';

export function MouseMovementEditor({initial,onSave,onCancel,onActivate,onRemove,autoOpen=false,dragHandle}:{initial?:AppAction;onSave:(action:MouseAction)=>void;onCancel:()=>void;onActivate:()=>void;onRemove:()=>void;autoOpen?:boolean;dragHandle?:{onDragStart:(event:React.DragEvent)=>void;onDragEnd:()=>void}}){
 const saved=initial?.type==='mouse-movement'?initial:undefined;
 const [right,setRight]=useState<MouseInput>(saved?.right??{movement:'rotation',axis:'x'});
 const [up,setUp]=useState<MouseInput>(saved?.up??{movement:'rotation',axis:'y'});
 return <div className="adjust-inline mouse-inline" role="group" aria-label="Mouse movement settings" title="Repeat this gesture to turn mouse movement off" onPointerDown={onActivate} onFocusCapture={onActivate} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();onCancel();}}}>
  <span className={dragHandle?'output-drag-handle':undefined} draggable={!!dragHandle} title={dragHandle?'Drag to another gesture or profile':undefined} onDragStart={dragHandle?.onDragStart} onDragEnd={dragHandle?.onDragEnd}><MousePointer2 className="movement-group-icon" size={18} strokeWidth={1.5} aria-label="Mouse movement"/></span>
  <button className="adjust-remove" aria-label="Remove mouse movement" onClick={onRemove}><X size={12}/></button>
  {(['right','up'] as const).map(direction=>{const value=direction==='right'?right:up;return <div className="adjust-direction" key={direction}>
   <button className="mouse-direction-toggle" aria-label={`Reverse ${direction==='right'?'horizontal':'vertical'} mouse direction`} aria-pressed={!!value.inverted} title={`Move ${direction==='right'?(value.inverted?'left':'right'):(value.inverted?'down':'up')} · Click to reverse`} onClick={()=>{const next={...value,inverted:!value.inverted};if(direction==='right')setRight(next);else setUp(next);onSave({type:'mouse-movement',right:direction==='right'?next:right,up:direction==='up'?next:up});}}>{direction==='right'?(value.inverted?<ArrowLeft size={15}/>:<ArrowRight size={15}/>):(value.inverted?<ArrowDown size={15}/>:<ArrowUp size={15}/>)}</button>
   <ComboDropdown label={`Move ${direction}`} initialOpen={autoOpen&&direction==='right'} className="adjust-movement-dropdown" value={`${value.movement}:${value.axis}`} options={(['rotation','movement'] as const).flatMap(movement=>(['x','y','z'] as const).map(axis=>({value:`${movement}:${axis}`,label:`${movement==='rotation'?'Rotation':'Movement'} · ${axis.toUpperCase()} axis`})))} onChange={selection=>{const [movement,axis]=selection.split(':');const next={...value,movement:movement as MouseInput['movement'],axis:axis as MouseInput['axis']};if(direction==='right')setRight(next);else setUp(next);onSave({type:'mouse-movement',right:direction==='right'?next:right,up:direction==='up'?next:up});}}>
    {value.movement==='rotation'?<Rotate3D size={19}/>:<Move3D size={19}/>}<span>{value.axis.toUpperCase()}</span>
   </ComboDropdown>
  </div>;})}
 </div>;
}
