import {useEffect,useRef,useState} from 'react';
import type {PointerEvent} from 'react';
import {normalizeQuaternion} from './SensorVisuals';
import {bestPathMatch,rotatePath,normalizePath,pathData,pathLength,wristPoint} from './airGesture';
import type {Point2} from './airGesture';
import './air-gesture.css';
import {AirGestureEngine} from './AirGestureEngine';

function SingleAirGestureTest({connected,demo}:{connected:boolean;demo:boolean}){
 const [target,setTarget]=useState<Point2[]>([]),[trace,setTrace]=useState<Point2[]>([]),[reference,setReference]=useState<number[]>([]),[recording,setRecording]=useState(false),[fresh,setFresh]=useState(false),[liveOrientation,setLiveOrientation]=useState<number[]>([]),[message,setMessage]=useState('Draw one continuous stroke, then center your forearm.'),[match,setMatch]=useState<ReturnType<typeof bestPathMatch>>(null),[threshold,setThreshold]=useState(75);
 const latest=useRef<{q:number[];at:number}|null>(null),capture=useRef<{reference:number[];points:Point2[];start:number;last:number}|null>(null),drawing=useRef<number|null>(null);
 function finish(reason='Recording finished.'){
  const current=capture.current;if(!current)return;capture.current=null;setRecording(false);setTrace([...current.points]);
  const extent=current.points.length?Math.max(Math.max(...current.points.map(p=>p[0]))-Math.min(...current.points.map(p=>p[0])),Math.max(...current.points.map(p=>p[1]))-Math.min(...current.points.map(p=>p[1]))):0;
  if(current.points.length<10||extent<1/30||pathLength(current.points)<2/30){setMatch(null);setMessage('Too little motion to compare. Draw a larger gesture and try again.');return;}
  setMatch(bestPathMatch(target,current.points));setMessage(reason);
 }
 // Read every orientation packet, independently of the paused/downsampled signal viewer.
 useEffect(()=>window.band?.onMessage(m=>{
  if(m.kind!=='events'||demo)return;
  for(const packet of m.events){if(packet.type!=='Orientation'||!Array.isArray(packet.values)||!normalizeQuaternion(packet.values))continue;
   const now=performance.now();latest.current={q:[...packet.values],at:now};const c=capture.current;
   if(c&&c.points.length<4096){const p=wristPoint(packet.values,c.reference);if(p){c.points.push(p);c.last=now;}}
  }
 }),[demo]);
 useEffect(()=>{const timer=setInterval(()=>{const now=performance.now(),valid=Boolean(connected&&!demo&&latest.current&&now-latest.current.at<1000);setFresh(valid);if(valid&&latest.current)setLiveOrientation(latest.current.q);const c=capture.current;if(c){setTrace([...c.points]);if(!valid){capture.current=null;setRecording(false);setMatch(null);setMessage('Orientation stream interrupted. Recording discarded; reconnect and center again.');setReference([]);setTrace([]);}else if(now-c.start>=12000)finish('Stopped at the 12 second limit.');}},100);return()=>clearInterval(timer);},[connected,demo,target]);
 useEffect(()=>{capture.current=null;latest.current=null;setReference([]);setTrace([]);setMatch(null);setRecording(false);setFresh(false);},[connected,demo]);
 const score=match?.score??null;
 const ready=fresh&&reference.length===4;
 function center(){if(!latest.current||!fresh)return;setReference([...latest.current.q]);setTrace([]);setMatch(null);setMessage('Centered. Move side to side, then up and down; check the preview before recording.');}
 function pointer(e:PointerEvent<SVGSVGElement>):Point2{const rect=e.currentTarget.getBoundingClientRect();return [Math.max(0,Math.min(400,(e.clientX-rect.left)/rect.width*400)),Math.max(0,Math.min(280,(e.clientY-rect.top)/rect.height*280))];}
 function start(){if(!ready||normalizePath(target).length===0)return;const now=performance.now();capture.current={reference,points:[],start:now,last:-Infinity};setTrace([]);setMatch(null);setRecording(true);setMessage('Recording. Keep your elbow still and repeat the stroke from its starting point.');}
 const normalizedTarget=normalizePath(target).map(p=>[200+p[0]*220,140+p[1]*220] as Point2),normalizedTrace=normalizePath(rotatePath(trace,match?.rotation??0)).map(p=>[200+p[0]*220,140+p[1]*220] as Point2);
 const preview=ready?wristPoint(liveOrientation,reference):null;
 const previewTrace=trace.map(p=>[200+p[0]*120,140+p[1]*120] as Point2);
 return <section className="model-tests air-test" aria-label="Air gesture detector">
  <div className="model-intro"><h2>Air gesture detector</h2><p>Draw a stroke, then repeat it in the air. With your elbow fixed, forearm rotation can estimate the wrist’s path on an arc.</p></div>
  <div className="air-workspace">
   <section><div className="air-heading"><h3>Your target</h3><button className="button" disabled={recording||!target.length} onClick={()=>{setTarget([]);setMatch(null);}}>Clear drawing</button></div>
    <svg className="air-pad" viewBox="0 0 400 280" role="img" aria-label="Draw target gesture" onPointerDown={e=>{if(recording||drawing.current!==null)return;e.currentTarget.setPointerCapture(e.pointerId);drawing.current=e.pointerId;setTarget([pointer(e)]);setMatch(null);}} onPointerMove={e=>{if(drawing.current===e.pointerId){const point=pointer(e);setTarget(p=>p.length<4096?[...p,point]:p);}}} onPointerUp={e=>{if(drawing.current===e.pointerId){drawing.current=null;e.currentTarget.releasePointerCapture(e.pointerId);}}} onPointerCancel={()=>{drawing.current=null;setTarget([]);}}>
     {!target.length&&<text x="200" y="140" textAnchor="middle">Draw here with your mouse or finger</text>}<path d={pathData(target)} className="air-target"/>{target[0]&&<circle cx={target[0][0]} cy={target[0][1]} r="5" fill="#777"/>}
    </svg><p>One continuous stroke. The dot marks the start. Drawing again replaces the target.</p>
    <h3 className="air-setup-title">Forearm setup</h3><p>Rest your elbow in one place. Hold your hand palm down with your forearm pointing forward, then center. Keep your wrist rigid and leave room to move left/right and up/down.</p>
    <div className="model-actions"><button className="button" disabled={!fresh||recording} onClick={center}>Center forearm</button><button className="button primary" disabled={!ready||recording||!normalizePath(target).length} onClick={start}>Record air gesture</button>{recording&&<button className="button" onClick={()=>finish()}>Finish and compare</button>}</div>
    <p>{demo?'Demo signals cannot be used for gesture detection. Connect a real band.':!connected?'Connect your band to enable orientation capture.':!fresh?'Waiting for fresh orientation packets…':reference.length?'Centered · orientation streaming':'Orientation streaming · center your forearm to begin'}</p>
   </section>
   <section><h3>{score===null?'Wrist path preview':'Shape comparison'}</h3>
    <svg className="air-pad air-result" viewBox="0 0 400 280" role="img" aria-label={score===null?'Estimated wrist trajectory':'Target and air gesture overlay'}>
     {score===null?<><path d={pathData(previewTrace)} className="air-actual"/>{preview&&<circle cx={200+preview[0]*120} cy={140+preview[1]*120} r="5" fill="#237c68"/>}{!preview&&!trace.length&&<text x="200" y="140" textAnchor="middle">Center your forearm to see its path</text>}</>:<><path d={pathData(normalizedTarget)} className="air-target"/><path d={pathData(normalizedTrace)} className="air-actual"/>{normalizedTrace[0]&&<circle cx={normalizedTrace[0][0]} cy={normalizedTrace[0][1]} r="5" fill="#237c68"/>}</>}
    </svg>
    <p>{score===null?'From palm down and forward: X pitches up/down, Z yaws left/right, and Y rolls without moving the wrist.':'Gray: your drawing. Green: air gesture at its best rotation. Both centered and scaled equally in each direction.'}</p>
    <div className="air-verdict" role="status" aria-live="polite">{score!==null&&<strong>{score>=threshold?'Similar gesture':'Different gesture'} · {score}% similarity</strong>}<span>{message}</span>{match&&<span>Best rotation: {match.rotation}° clockwise · searched −100° to +100°</span>}{recording&&<span>{trace.length} orientation samples · maximum 12 seconds</span>}</div>
    <label className="model-field"><span>Similarity threshold: {threshold}%</span><input aria-label="Similarity threshold" type="range" min="50" max="95" value={threshold} onChange={e=>setThreshold(Number(e.target.value))}/></label>
    <details className="model-details"><summary>How this experiment works</summary><p>The centered pose is palm down and forward: Y runs along the forearm, X points right and Z points up. The full relative quaternion rotates a unit-length forward Y vector, then projects it onto the fixed X/Z drawing plane. This estimates wrist motion with a fixed elbow; it does not measure fingertip position or elbow movement. Pure roll does not move the wrist. After a 90° roll, local pitch moves the wrist sideways, like yaw from the neutral pose.</p><p>Comparison tries whole-degree rotations from −100° to +100° of the recorded gesture and uses the best score and overlay. It ignores position, size, speed and overall rotation, while preserving aspect ratio and stroke order. The threshold is a heuristic, not a calibrated probability. Small gestures, band slippage, changing elbow position and orientation drift can affect the result.</p><p>Nothing is installed or uploaded. Drawings and captures are cleared when you leave this test.</p></details>
   </section>
  </div>
 </section>;
}

export function AirGestureTest(props:{connected:boolean;demo:boolean}){
 const [mode,setMode]=useState<'single'|'engine'>('engine');
 return <><div className="air-modes" role="group" aria-label="Air gesture test mode"><button className="button" aria-pressed={mode==='engine'} onClick={()=>setMode('engine')}>Gesture engine</button><button className="button" aria-pressed={mode==='single'} onClick={()=>setMode('single')}>Single gesture test</button></div>{mode==='engine'?<AirGestureEngine {...props}/>:<SingleAirGestureTest {...props}/>}</>;
}
