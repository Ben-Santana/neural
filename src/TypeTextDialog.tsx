import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import {validTypeTextAction,type AppAction,type TypeTextAction} from './shortcuts';

export function TypeTextDialog({initial,onSave,onCancel}:{initial?:AppAction;onSave:(action:TypeTextAction)=>void;onCancel:()=>void}){
 const [text,setText]=useState(initial?.type==='type-text'?initial.text:'');
 const dialog=useRef<HTMLElement>(null);
 const action:TypeTextAction={type:'type-text',text};
 useEffect(()=>{const previous=document.activeElement as HTMLElement;dialog.current?.querySelector('textarea')?.focus();return()=>previous?.focus();},[]);
 return createPortal(<div className="modal-scrim api-call-scrim" onPointerDown={e=>{if(e.target===e.currentTarget)onCancel();}} onKeyDown={e=>{
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onCancel();}
  if(e.key==='Tab'){const items=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button,textarea')??[]).filter(el=>!el.hasAttribute('disabled'));const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
 }}><section className="modal api-call-modal type-text-modal" role="dialog" aria-modal="true" aria-labelledby="type-text-title" ref={dialog}>
  <button className="modal-close" aria-label="Close type text" onClick={onCancel}><X size={18}/></button>
  <h2 id="type-text-title">Type text</h2><p>Write this text into the focused app when your gesture runs.</p>
  <form onSubmit={e=>{e.preventDefault();if(validTypeTextAction(action))onSave(action);}}>
   <label htmlFor="type-text-content">Text to type</label><textarea id="type-text-content" rows={10} value={text} onChange={e=>setText(e.target.value)} placeholder="Type or paste your text here…"/>
   <p className="api-storage-note">Line breaks and spacing are preserved. Text is saved locally with this profile.</p>
   {text&&!validTypeTextAction(action)&&<p className="api-error" role="alert">Remove unsupported control characters from the text.</p>}
   <div className="api-dialog-actions"><button type="button" className="button" onClick={onCancel}>Cancel</button><button type="submit" className="button primary" disabled={!validTypeTextAction(action)}>Save text</button></div>
  </form>
 </section></div>,document.body);
}
