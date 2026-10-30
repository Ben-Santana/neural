import {useState} from 'react';
import type {Packet} from './types';

type Point = [number, number, number];
type Quaternion = [number, number, number, number];
export function normalizeQuaternion(values: number[]): Quaternion | null {
  const length = Math.hypot(...values);
  return values.length === 4 && Number.isFinite(length) && length > 1e-9
    ? values.map(v => v / length) as Quaternion : null;
}
/** Hamilton product: apply b, then a. Wire format is w,x,y,z. */
function multiply(a: Quaternion, b: Quaternion): Quaternion {
  const [w,x,y,z] = a, [v,i,j,k] = b;
  return [w*v-x*i-y*j-z*k, w*i+x*v+y*k-z*j, w*j-x*k+y*v+z*i, w*k+x*j-y*i+z*v];
}
export function relativeOrientation(values: number[], reference: number[]): Quaternion {
  const q = normalizeQuaternion(values), r = normalizeQuaternion(reference);
  if (!q) return [1,0,0,0];
  // Express world motion in the neutral wrist frame, not in world axes.
  return r ? multiply([r[0],-r[1],-r[2],-r[3]], q) : q;
}
/** Sensor-to-hand basis: sensor Y -> hand X, sensor X -> hand -Y.
 * A quarter-turn basis change exchanges roll/pitch and preserves yaw and handedness.
 */
export function handOrientation(values: number[], reference: number[]): Quaternion {
  const [w,x,y,z] = relativeOrientation(values,reference);
  return [w,y,-x,z];
}
export function rotatePoint(point: Point, quaternion: number[]): Point {
  const q = normalizeQuaternion(quaternion);
  if (!q) return point;
  const [w, x, y, z] = q;
  const [px, py, pz] = point;
  const tx = 2 * (y * pz - z * py), ty = 2 * (z * px - x * pz), tz = 2 * (x * py - y * px);
  return [px + w * tx + y * tz - z * ty, py + w * ty + z * tx - x * tz, pz + w * tz + x * ty - y * tx];
}
// Right hand: +X wrist to fingertips, +Y toward thumb, +Z back of hand.
// All geometry rotates about the band at the wrist (origin).
const outline: [number,number][] = [
  [-34,-15],[0,-17],[30,-24],[52,-29],[65,-29],[69,-26],[68,-22],[64,-20],[44,-17],
  [86,-17],[91,-14],[91,-10],[87,-7],[49,-7],
  [98,-5],[102,-2],[102,2],[98,5],[49,5],
  [89,8],[93,11],[92,15],[88,18],[44,16],[32,21],
  [40,38],[39,44],[35,47],[30,45],[13,28],[1,17],[-34,15],
];
const handVertices: Point[] = [-5,5].flatMap(z => outline.map(([x,y]) => [x,y,z] as Point));
const n = outline.length;
const handFaces = [
  {indices: outline.map((_,i) => i).reverse(), tone: '#d6d6d6'},
  {indices: outline.map((_,i) => n+i), tone: '#fafafa'},
  ...outline.map((_,i) => ({indices:[i,(i+1)%n,(i+1)%n+n,i+n],tone:'#e5e5e5'})),
];
// Orthographic camera; its depth vector is perpendicular to both screen axes.
const project = ([x,y,z]: Point) => [125+(x-y)*.72, 57+(x+y)*.29-z*.83];
const depth = ([x,y,z]: Point) => x+y+z*(.58/.83);
export function OrientationVisual({values}: {values: number[]}) {
  const [reference,setReference] = useState<number[]>([]);
  const valid = normalizeQuaternion(values) !== null;
  const pose = handOrientation(values,reference);
  const rotated = handVertices.map(p => rotatePoint(p,pose));
  const ordered = handFaces.map((face,i) => ({...face,i,depth:face.indices.reduce((sum,j) => sum+depth(rotated[j]),0)/face.indices.length})).sort((a,b)=>a.depth-b.depth);
  const line = (points: Point[]) => points.map(p=>project(rotatePoint(p,pose)).join(',')).join(' ');
  return <>
    <svg className="orientation-visual" viewBox="0 0 300 142" role="img" aria-label={valid ? 'Right hand pose driven by live orientation' : 'Hand orientation awaiting a signal'}>
      <g opacity={valid ? 1 : .3} strokeLinejoin="round" strokeWidth="1" stroke="#555">
        {ordered.map(({indices,tone,i})=><g key={i}>
          <polygon points={indices.map(j=>project(rotated[j]).join(',')).join(' ')} fill={tone}/>
          {i===1 && <g fill="none" stroke="#aaa" strokeWidth=".7">
            <polyline points={line([[-9,-16,5.1],[-9,16,5.1]])}/>
            <polyline points={line([[-17,-16,5.1],[-17,16,5.1]])}/>
            {[[-10,74], [0,83], [12,74]].map(([y,x])=><polyline key={y} points={line([[x,y-3,5.1],[x+1,y+3,5.1]])}/>)}
          </g>}
        </g>)}
      </g>
    </svg>
    <div className="orientation-controls"><span>{reference.length ? 'Relative to centered pose' : 'Device reference'}</span><button disabled={!valid} onClick={()=>setReference([...values])} title="Hold your right hand flat, fingers forward, then center">Center hand</button></div>
  </>;
}
export function MotionVisual({history,values}:{history:Packet[];values:number[]}){
  // Each lane has its own shared, symmetric wire-unit scale. No unit conversion is implied.
  const scale=Math.max(250,...history.flatMap(p=>(p.values as number[]).map(Math.abs)));
  return <svg className="motion-visual" viewBox="0 0 300 142" role="img" aria-label={values.length?'Gyroscope movement across three axes':'Motion awaiting a signal'}>
    {['X','Y','Z'].map((axis,i)=>{
      const y=32+i*39;
      const points=history.map((p,n)=>`${40+n/Math.max(1,history.length-1)*238},${y-((p.values as number[])[i]/scale)*15}`).join(' ');
      return <g key={axis}><text x="17" y={y+4} fill="#696969" fontSize="11">{axis}</text><path d={`M40 ${y}H278`} stroke="#ededed"/>{points&&<polyline points={points} stroke={['#222','#777','#aaa'][i]} strokeWidth="1.2" fill="none" strokeLinejoin="round"/>}{values.length>0&&<circle cx="278" cy={y-values[i]/scale*15} r="2.5" fill={['#222','#777','#aaa'][i]}/>}</g>;
    })}
  </svg>;
}
