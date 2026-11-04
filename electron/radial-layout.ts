// A 42° gap leaves room between 82px options on the smallest supported editor ring,
// and between 28px options in the compact runtime menu.
export const MIN_RADIAL_GAP=42*Math.PI/180;
const TAU=Math.PI*2;
export const wrapAngle=(angle:number)=>(angle%TAU+TAU)%TAU;
export function radialAngles(items:readonly {angle?:number}[]){return items.map((item,index)=>item.angle??index/items.length*TAU);}
export function spaceRadialItems<T extends {angle?:number}>(items:T[]):T[]{
 const angles=radialAngles(items).sort((a,b)=>a-b);
 if(angles.length<2||angles.every((angle,index)=>(angles[index+1]??angles[0]+TAU)-angle>=MIN_RADIAL_GAP-1e-8))return items;
 return items.map((item,index)=>({...item,angle:index/items.length*TAU}));
}
export function moveRadialItem<T extends {id:string;angle?:number}>(items:T[],id:string,desired:number):T[]{
 const safe=spaceRadialItems(items),angles=radialAngles(safe),index=safe.findIndex(item=>item.id===id);
 if(index<0)return safe;
 const current=angles[index];
 let target=current+Math.atan2(Math.sin(desired-current),Math.cos(desired-current));
 if(safe.length>1){
  const offsets=angles.filter((_,i)=>i!==index).map(angle=>wrapAngle(angle-current));
  const lower=current+Math.max(...offsets)-TAU+MIN_RADIAL_GAP;
  const upper=current+Math.min(...offsets)-MIN_RADIAL_GAP;
  target=Math.max(lower,Math.min(upper,target));
 }
 return safe.map((item,i)=>({...item,angle:wrapAngle(i===index?target:angles[i])}));
}
