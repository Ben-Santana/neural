import {useEffect,useState} from 'react';
import {Play,Square,Trash2} from 'lucide-react';
import type {Message} from './types';

type State={phase:string;message:string;verified:boolean;text:string;raw?:string;samples:number;gaps:number;confidence?:number};
export function NativeHandwriting({connected,demo,onResearch}:{connected:boolean;demo:boolean;onResearch:()=>void}){
 const [state,setState]=useState<State>({phase:'idle',message:'Checks whether your firmware supports native handwriting.',verified:true,text:'',samples:0,gaps:0});
 useEffect(()=>{
  const off=window.band?.onMessage((message:Message)=>{if(message.kind==='native_handwriting')setState(message as unknown as State);});
  window.band?.send({action:'native_handwriting_status'});
  return()=>{off?.();window.band?.send({action:'native_handwriting_stop'});};
 },[]);
 const working=['preparing','waiting','listening','restoring'].includes(state.phase);
 const blocked=working||state.phase==='restore_required';
 const send=(action:string)=>window.band?.send({action:`native_handwriting_${action}`});
 return <div className="model-workspace native-handwriting">
  <section className="model-controls" aria-label="Native handwriting setup">
   <h3>Try native handwriting</h3>
   <p>No model download. This checks firmware support, then reads native handwriting predictions directly without expanding the eight EMG channels.</p>
   <h3>Write on a surface</h3>
   <p>Start the test, then write a short word with your index finger on a table or your leg. Watch the live text as you write. Try one word at a time.</p>
   <div className="model-actions"><button className="button primary" disabled={!window.band||!connected||demo||blocked} onClick={()=>send('start')}><Play size={13}/> Start handwriting</button>{working&&state.phase!=='restoring'&&<button className="button" onClick={()=>send('stop')}><Square size={13}/> Stop</button>}</div>
   {(!connected||demo)&&<p className="model-hint">Connect a real Neural Band to try its handwriting model.</p>}
   <p className="model-hint">The test temporarily enables handwriting collection and restores the previous settings when stopped. Each session lasts up to two minutes. Shortcuts stay paused; decoded text appears only here.</p>
   <details className="model-details"><summary>Experimental protocol</summary><p>Setting names and read-back values are checked before use. If the connection drops, reconnect this band so the app can restore and verify its previous settings.</p><p>The 100-character CTC alphabet and editing gestures follow community protocol research. Firmware compatibility and recognition accuracy may vary.</p><a href="https://github.com/beyondlevi/rokid-lumen/blob/main/NEURALBAND.md#handwriting" target="_blank" rel="noreferrer">Protocol reference</a></details>
   <button className="test-back" disabled={blocked} onClick={onResearch}>Use the older research checkpoint instead</button>
  </section>
  <section className="model-output" aria-label="Native handwriting output">
   <div className="model-output-heading"><h3>Live handwriting</h3><button className="button" onClick={()=>send('clear')}><Trash2 size={13}/> Clear text</button></div>
   <div className="model-status" role="status" aria-live="polite"><span className={working?'model-working':''}/><span>{state.message}</span></div>
   {state.phase==='restore_required'&&<p className="model-error" role="alert">Previous settings have not been verified. Reconnect the original band before starting another test.</p>}
   <div className="model-text native-text" aria-label="Native decoded handwriting" aria-live="polite">{state.text||<span>{state.phase==='listening'?'Listening. Write a word…':'Your words will appear here.'}</span>}</div>
   <p className="model-result-note">On-band model · {state.samples} samples{state.gaps?` · ${state.gaps} stream gaps`:''}{state.verified?' · Previous settings verified':''}</p>
   {state.raw&&<details className="model-details"><summary>Raw character trail</summary><p className="native-raw">{state.raw}</p><p>Includes boundary and editing gestures before text interpretation.</p></details>}
  </section>
 </div>;
}
