import assert from 'node:assert/strict';
import {build} from 'esbuild';
// Bundle the TypeScript math for Node so these checks need no preview server.
const bundle=await build({entryPoints:['src/airGesture.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {wristPoint,bestPathMatch,rotatePath,rankAirGestures}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const identity=[1,0,0,0];
const rotation=(axis,angle)=>[Math.cos(angle/2),...['x','y','z'].map(a=>a===axis?Math.sin(angle/2):0)];
const multiply=([w,x,y,z],[v,i,j,k])=>[w*v-x*i-y*j-z*k,w*i+x*v+y*k-z*j,w*j-x*k+y*v+z*i,w*k+x*j-y*i+z*v];
const near=(actual,expected,label)=>{assert.ok(actual, label);actual.forEach((value,i)=>assert.ok(Math.abs(value-expected[i])<1e-8,`${label}: ${actual} versus ${expected}`));};
for(const angle of [-Math.PI,-Math.PI/2,-.3,0,.3,Math.PI/2,Math.PI]){
 near(wristPoint(rotation('y',angle),identity),[0,0],'Y roll leaves wrist fixed');
 near(wristPoint(rotation('x',angle),identity),[0,-Math.sin(angle)],'X pitch moves vertically');
 near(wristPoint(rotation('z',angle),identity),[-Math.sin(angle),0],'Z yaw moves horizontally');
}
const roll=rotation('y',Math.PI/2),oppositeRoll=rotation('y',-Math.PI/2);
for(const angle of [-.7,-.2,.2,.7]){
 const pitch=rotation('x',angle);
 near(wristPoint(multiply(roll,pitch),identity),wristPoint(rotation('z',-angle),identity),'Local pitch after +90° roll equals negative yaw wrist path');
 near(wristPoint(multiply(oppositeRoll,pitch),identity),wristPoint(rotation('z',angle),identity),'Local pitch after -90° roll equals positive yaw wrist path');
 const yawThenPitch=multiply(rotation('z',.4),pitch);
 near(wristPoint(yawThenPitch,identity),[-Math.sin(.4)*Math.cos(angle),-Math.sin(angle)],'Combined yaw and pitch');
 near(wristPoint(multiply(yawThenPitch,rotation('y',1.1)),identity),wristPoint(yawThenPitch,identity),'Local forearm roll preserves a tilted wrist position');
 const reference=multiply(rotation('z',.8),rotation('x',-.4));
 near(wristPoint(multiply(reference,multiply(roll,pitch)),reference),wristPoint(rotation('z',-angle),identity),'Composition in a nonidentity centered frame');
}
assert.equal(wristPoint([0,0,0,0],identity),null);
console.log('Air gesture coordinates passed: Y roll, X pitch, Z yaw, rolled pitch, tilted roll and nonidentity calibration. No server started.');

// An asymmetric stroke gives an unambiguous alignment angle.
const target=[[0,0],[3,0],[3,1],[2,1],[2,4]];
for(const degrees of [-100,-90,-37,-1,0,1,37,90,100]){
 const actual=rotatePath(target,degrees).map(([x,y])=>[x*2+12,y*2-8]);
 const match=bestPathMatch(target,actual);
 assert.equal(match.score,100);assert.ok(Math.abs(match.rotation+degrees)<1e-9);
}
assert.equal(bestPathMatch(target,[[0,0],[0,0]]),null);
assert.ok(bestPathMatch(target,[[0,0],[1,0],[2,0]]).score<75);
assert.ok(bestPathMatch(target,[...target].reverse()).score<75);
assert.ok(bestPathMatch(target,target.map(([x,y])=>[-x,y])).score<75);
const outside=bestPathMatch(target,rotatePath(target,180));assert.ok(outside.score<100);assert.ok(outside.rotation>=-100&&outside.rotation<=100);
const ranked=rankAirGestures([{id:'line',name:'Line',points:[[0,0],[4,0]]},{id:'shape',name:'Shape',points:target}],rotatePath(target,45));assert.equal(ranked[0].id,'shape');assert.equal(ranked[0].score,100);assert.equal(ranked.length,2);assert.deepEqual(rankAirGestures([],target),[]);
console.log('Rotation search and ranking passed: ±100° boundaries, out-of-range rotations, multiple templates, different shapes, reversed order and invalid input.');
