import {type Assignment} from './shortcuts';
let copied:Assignment|null=null;
export function copyAssignment(value:Assignment){copied=structuredClone(value);}
export function hasCopiedAssignment(){return copied!==null;}
// Match recognition inputs, rather than profile-local combo IDs or timing preferences.
function gestureKey(value:Assignment){return JSON.stringify(value.steps?.map(s=>[s.gesture,s.axis??null,s.direction??'any',s.air??null])??value.id);}
export function pasteAssignment(assignments:Assignment[]):Assignment[]|null{
 if(!copied)return null;
 const existing=assignments.find(a=>gestureKey(a)===gestureKey(copied!));
 if(existing&&(existing.shortcut||existing.appAction)&&!window.confirm('This gesture already has an assigned shortcut or action. Replace it?'))return null;
 const next={...structuredClone(copied),id:existing?.id??(copied.steps?`combo-${crypto.randomUUID()}`:copied.id)};
 return existing?assignments.map(a=>a.id===existing.id?next:a):[...assignments,next];
}
