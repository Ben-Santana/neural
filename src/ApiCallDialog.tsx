import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import {validApiAction,type AppAction,type ApiAction} from './shortcuts';

export function ApiCallDialog({initial,onSave,onCancel}:{initial?:AppAction;onSave:(action:ApiAction)=>void;onCancel:()=>void}){
 const saved=initial?.type==='api-call'?initial:undefined;
 const [method,setMethod]=useState(saved?.method??'POST');
 const [url,setUrl]=useState(saved?.url??'');
 const [headers,setHeaders]=useState(JSON.stringify(saved?.headers??{},null,2));
 const [body,setBody]=useState(saved?.body??'');
 const [timeout,setTimeoutValue]=useState(String((saved?.timeoutMs??30000)/1000));
 const [error,setError]=useState('');
 const dialog=useRef<HTMLElement>(null);
 useEffect(()=>{const previous=document.activeElement as HTMLElement;dialog.current?.querySelector<HTMLInputElement>('input')?.focus();return()=>previous?.focus();},[]);
 return createPortal(<div className="modal-scrim api-call-scrim" onPointerDown={e=>{if(e.target===e.currentTarget)onCancel();}} onKeyDown={e=>{
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onCancel();}
  if(e.key==='Tab'){const items=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button,input,select,textarea')??[]);const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
 }}><section className="modal api-call-modal" role="dialog" aria-modal="true" aria-labelledby="api-call-title" ref={dialog}>
 <button className="modal-close" aria-label="Close API call" onClick={onCancel}><X size={18}/></button>
 <h2 id="api-call-title">Call an API</h2><p>Send an HTTP request whenever this gesture or combo is recognized.</p>
 <form onSubmit={e=>{e.preventDefault();try{const action:ApiAction={type:'api-call',method:method.trim().toUpperCase(),url:url.trim(),headers:JSON.parse(headers),body:['GET','HEAD'].includes(method)?'':body,timeoutMs:Number(timeout)*1000};if(!validApiAction(action))throw new Error('Use an HTTP or HTTPS URL, valid method and headers, and a timeout from 1 to 120 seconds.');onSave(action);}catch(exc){setError(exc instanceof SyntaxError?'Headers must be a JSON object with string values.':(exc as Error).message);}}}>
 <div className="api-request-line"><label>Method<select aria-label="Method" value={method} onChange={e=>setMethod(e.target.value)}>{['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].map(m=><option key={m}>{m}</option>)}{!['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].includes(method)&&<option>{method}</option>}</select></label><label>URL<input required type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://api.example.com/action"/></label></div>
 <label htmlFor="api-headers">Headers (JSON)</label><textarea id="api-headers" rows={4} value={headers} onChange={e=>setHeaders(e.target.value)} spellCheck={false} placeholder={'{"Authorization": "Bearer …", "Content-Type": "application/json"}'}/>
 {!['GET','HEAD'].includes(method)&&<label>Request body<textarea aria-label="Request body" rows={5} value={body} onChange={e=>setBody(e.target.value)} spellCheck={false} placeholder="JSON, form data, or any raw text"/></label>}
 <label>Timeout (seconds)<input type="number" min="1" max="120" step="1" required value={timeout} onChange={e=>setTimeoutValue(e.target.value)}/></label>
 <p className="api-storage-note">Headers and body are saved locally with this profile. Set Content-Type to match your body. Calls run in the desktop app.</p>
 {error&&<p role="alert" className="api-error">{error}</p>}
 <div className="api-dialog-actions"><button type="button" className="button" onClick={onCancel}>Cancel</button><button className="button primary" type="submit">Save API call</button></div>
 </form></section></div>,document.body);
}
