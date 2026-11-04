import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import {GestureIcon} from './MotionSettings';
import {motions,shortcutLabel,normalizeCheatSheetDescriptions,type Assignment,type AppAction} from './shortcuts';

export function CheatSheetEditor({assignments,initial,profileName,actionLabel,onSave,onCancel,onChangeShortcut}:{assignments:Assignment[];initial:Record<string,string>;profileName?:string;actionLabel:(action:AppAction)=>string;onSave:(descriptions:Record<string,string>)=>void;onCancel:()=>void;onChangeShortcut:()=>void}){
 const [descriptions,setDescriptions]=useState(initial);
 const [preview,setPreview]=useState(false);
 const dialog=useRef<HTMLElement>(null);
 useEffect(()=>{const previous=document.activeElement as HTMLElement;dialog.current?.querySelector<HTMLInputElement>('input')?.focus();return()=>previous?.focus();},[]);
 const rows=assignments.filter(a=>(a.shortcut||a.appAction)&&a.appAction?.type!=='show-cheat-sheet');
 return createPortal(<div className="modal-scrim api-call-scrim" onPointerDown={e=>{if(e.target===e.currentTarget)onCancel();}} onKeyDown={e=>{
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onCancel();}
  if(e.key==='Tab'){const items=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button,input')??[]).filter(el=>!el.hasAttribute('disabled'));const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
 }}><section ref={dialog} className="modal api-call-modal cheat-sheet-editor" role="dialog" aria-modal="true" aria-labelledby="cheat-sheet-editor-title">
  <button className="modal-close" aria-label="Close cheat sheet editor" onClick={onCancel}><X size={18}/></button>
  <h2 id="cheat-sheet-editor-title">Profile cheat sheet</h2>
  <p>{profileName?`${profileName} · `:''}Describe what each gesture does. Leave a description blank to show its shortcut.</p>
  <div className="cheat-sheet-editor-tools"><button type="button" className="button" aria-pressed={preview} onClick={()=>setPreview(!preview)}>{preview?'Edit descriptions':'Preview cheat sheet'}</button><button type="button" className="button" disabled={!Object.values(descriptions).some(text=>text.trim())} onClick={()=>setDescriptions({})}>Reset descriptions</button></div>
  <form onSubmit={e=>{e.preventDefault();onSave(normalizeCheatSheetDescriptions(descriptions));}}>
   <div className="cheat-sheet-editor-rows">{rows.map((a,index)=>{
    const steps=a.steps??[{gesture:a.id}];
    const name=steps.map(step=>[motions.find(m=>m.id===step.gesture)?.name??step.gesture.replaceAll('-',' '),'axis' in step?step.axis?.toUpperCase():undefined,'direction' in step&&step.direction!=='any'?step.direction:undefined].filter(Boolean).join(' · ')).join(' → ');
    const output=a.appAction?actionLabel(a.appAction):a.shortcut?shortcutLabel(a.shortcut):'';
    return <div className="cheat-sheet-editor-row" key={a.id}><label htmlFor={preview?undefined:`cheat-description-${index}`}><span className="cheat-sheet-editor-gesture">{steps.map((step,i)=><GestureIcon key={i} gesture={step.gesture as Parameters<typeof GestureIcon>[0]['gesture']} air={'air' in step?step.air:undefined}/>)}<span>{name}</span></span><small>{output}{!a.enabled?' · Disabled':''}</small></label>{preview?<div className="cheat-sheet-editor-preview">{descriptions[a.id]?.trim()?<><span>{descriptions[a.id].trim()}</span><small>{output}</small></>:<span>{output}</span>}</div>:<input id={`cheat-description-${index}`}  aria-label={`Description for ${name}`} maxLength={200} value={descriptions[a.id]??''} placeholder={output} onChange={e=>setDescriptions(current=>({...current,[a.id]:e.target.value}))}/>}</div>;
   })}</div>
   {!rows.length&&<p className="cheat-sheet-editor-empty">Configure another gesture shortcut to add a description.</p>}
   <div className="api-dialog-actions"><button type="button" className="button cheat-sheet-change-shortcut" onClick={onChangeShortcut}>Change shortcut</button><button type="button" className="button" onClick={onCancel}>Cancel</button><button type="submit" className="button primary">Save descriptions</button></div>
  </form>
 </section></div>,document.body);
}
