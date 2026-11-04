import {normalizeQuaternion,relativeOrientation,rotatePoint} from './SensorVisuals';
export type Point2=[number,number];
/** Palm down, forearm forward: +Y forward, +X right, +Z up.
 * Y rotation is roll, X is pitch and Z is yaw in the neutral frame.
 * Rotate the forward vector with the full relative quaternion, so local axes
 * move with the band (e.g. pitch after a 90° roll becomes horizontal motion).
 * Project into the fixed neutral X/Z plane; never rotate the screen with roll.
 */
export function wristPoint(values:number[],reference:number[]):Point2|null{
 if(!normalizeQuaternion(values)||!normalizeQuaternion(reference))return null;
 const [right,,up]=rotatePoint([0,1,0],relativeOrientation(values,reference));
 return [right,-up];
}
export function pathLength(points:Point2[]){return points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-points[i][0],p[1]-points[i][1]),0);}
export function normalizePath(points:Point2[],count=64):Point2[]{
 const total=pathLength(points);if(points.length<2||total<1e-6)return [];
 const distances=[0];for(let i=1;i<points.length;i++)distances.push(distances[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
 let j=1;const sampled:Point2[]=Array.from({length:count},(_,i)=>{const d=i*total/(count-1);while(j<points.length-1&&distances[j]<d)j++;const t=(d-distances[j-1])/(distances[j]-distances[j-1]||1);return [points[j-1][0]+t*(points[j][0]-points[j-1][0]),points[j-1][1]+t*(points[j][1]-points[j-1][1])];});
 return fitPath(sampled);
}
function fitPath(sampled:Point2[]):Point2[]{
 const count=sampled.length;
 const center=sampled.reduce((a,p)=>[a[0]+p[0]/count,a[1]+p[1]/count],[0,0]);
 const scale=Math.max(Math.max(...sampled.map(p=>p[0]))-Math.min(...sampled.map(p=>p[0])),Math.max(...sampled.map(p=>p[1]))-Math.min(...sampled.map(p=>p[1])));
 return sampled.map(p=>[(p[0]-center[0])/scale,(p[1]-center[1])/scale]);
}
/** Positive angles rotate clockwise in screen coordinates (Y points down). */
export function rotatePath(points:Point2[],degrees:number):Point2[]{
 const angle=degrees*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 return points.map(([x,y])=>[x*c-y*s,x*s+y*c]);
}
function pathDistance(a:Point2[],b:Point2[]):number{
 // Constrained DTW retains stroke order while allowing local timing variation.
 let previous=new Float64Array(65).fill(Infinity);previous[0]=0;
 for(let i=1;i<=64;i++){
  const row=new Float64Array(65).fill(Infinity);
  for(let j=Math.max(1,i-8);j<=Math.min(64,i+8);j++)row[j]=Math.hypot(a[i-1][0]-b[j-1][0],a[i-1][1]-b[j-1][1])+Math.min(previous[j-1],previous[j],row[j-1]);
  previous=row;
 }
 return previous[64]/64;
}
export function bestPathMatch(target:Point2[],actual:Point2[]):{score:number;rotation:number}|null{
 const a=normalizePath(target),b=normalizePath(actual);if(!a.length||!b.length)return null;
 let distance=Infinity,rotation=0;
 for(let degrees=-100;degrees<=100;degrees++){
  // Normalize after rotation: the bounding-box scale depends on orientation.
  const candidate=fitPath(rotatePath(b,degrees)),cost=pathDistance(a,candidate);
  if(cost<distance-1e-12){distance=cost;rotation=degrees;}
 }
 return {score:Math.round(100*Math.exp(-5*distance)),rotation};
}
export function comparePaths(target:Point2[],actual:Point2[]):number|null{
 return bestPathMatch(target,actual)?.score??null;
}
export function pathData(points:Point2[]){return points.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');}

export type AirTemplate={id:string;name:string;points:Point2[]};
export function rankAirGestures(templates:AirTemplate[],actual:Point2[]){
 return templates.flatMap(template=>{const match=bestPathMatch(template.points,actual);return match?[{...match,id:template.id,name:template.name,points:template.points}]:[];}).sort((a,b)=>b.score-a.score);
}
