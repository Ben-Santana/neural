const {Cam,fit,proj,facing,rings,prism,solid,put,mk,disposer,pointer,register,tween,tset,tval,tdone,clamp} = HL;
function mount({stage,svg,read},value){
 const bag=disposer();let amount=value,active=-1;
 const C=Cam(45,.5,2.05);fit(C,[[-66,-66,0],[66,66,0],[-66,66,54],[66,-66,54]],200,160);
 const P=proj(C),front=facing(C),g=mk('g',{},svg);
 const parts=Array.from({length:8},(_,i)=>{const a=i*Math.PI/4;return {i,x:Math.cos(a)*49,y:Math.sin(a)*49,z:8+Math.cos(a)*3,lift:tween(0)};}).sort((a,b)=>(a.x+a.y)-(b.x+b.y));
 for(const p of parts){p.body=solid(g);p.contact=solid(g);p.last=null;}
 function draw(p,z){if(p.last===z)return;p.last=z;const [r,inr]=rings(p.x-13,p.y-13,p.x+13,p.y+13,7,1.3);put(p.body,prism(P,front,r,inr,z,z+13));const [q,iq]=rings(p.x-7,p.y-7,p.x+7,p.y+7,4,.8);put(p.contact,prism(P,front,q,iq,z+13,z+15));}
 const B=register(stage,(_dt,now)=>{let moving=false;for(const p of parts){const lift=tval(p.lift,now);draw(p,p.z+lift);if(!tdone(p.lift,now))moving=true;}return moving;});bag.add(B.unregister);
 function select(i){if(active===i)return;active=i;const now=performance.now();for(const p of parts){const d=i<0?8:Math.min(Math.abs(p.i-i),8-Math.abs(p.i-i));tset(p.lift,i<0?0:d===0?amount:d===1?amount*.25:0,now,d*40);p.body.sil.classList.toggle('hi',p.i===(i<0?5:i));}read.textContent=i<0?'rest':`electrode ${i+1}`;B.wake();}
 function hit([x,y]){let best=-1,dist=35;for(const p of parts){const q=P(p.x,p.y,p.z+14),d=Math.hypot(q[0]-x,q[1]-y);if(d<dist){best=p.i;dist=d;}}return best;}
 for(const p of parts){draw(p,p.z);p.body.sil.classList.toggle('hi',p.i===5);}read.textContent='rest';
 bag.add(pointer(stage,{move:p=>select(hit(p)),leave:()=>select(-1)}));bag.add(()=>svg.replaceChildren());
 return {set:v=>{amount=clamp(v,0,26);const a=active;active=-2;select(a);},destroy:bag.dispose};
}
hairline({name:'band',means:'Eight electrode pods form a band; the nearest pod lifts and its neighbours follow.',rules:[1,2,4,8,9],range:[4,16,26],tour:[[200,102],[282,160],[200,215],null],mount});
