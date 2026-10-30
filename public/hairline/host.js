HL.inject(document);
const stage=document.getElementById('stage');stage.setAttribute('data-hairline','band');stage.setAttribute('role','group');
const svg=HL.mk('svg',{viewBox:'0 0 400 320'},stage);
const query=matchMedia('(prefers-reduced-motion: reduce)');HL.setReducedMotion(query.matches);query.addEventListener('change',e=>HL.setReducedMotion(e.matches));
window.hairline=figure=>{stage.setAttribute('aria-label',figure.means);const mounted=figure.mount({stage,svg,read:document.getElementById('read')},16);addEventListener('pagehide',()=>mounted.destroy(),{once:true});};
