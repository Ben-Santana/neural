import type {Packet} from './types';
type Meaning = {title:string;purpose:string};
const raw:Record<string,Meaning>={
 press:{title:'Press detected',purpose:'Reports the finger press gesture. The derived button-down event represents the same press for interaction handling.'},
 release:{title:'Release detected',purpose:'Reports the finger release gesture. The derived button-up event represents the release for interaction handling.'},
 tap:{title:'Tap detected',purpose:'Reports a tap gesture.'},doubletap:{title:'Double tap detected',purpose:'Reports a double-tap gesture.'},click:{title:'Click detected',purpose:'Reports a click gesture.'},
 wake:{title:'Wake gesture',purpose:'Reports the wake gesture.'},swipeIn:{title:'Swipe inward',purpose:'Reports an inward swipe gesture.'},swipeOut:{title:'Swipe outward',purpose:'Reports an outward swipe gesture.'},
};
for(const direction of ['up','down','left','right']) raw[direction]={title:`Swipe ${direction}`,purpose:`Reports the ${direction} direction gesture. A derived button-direction event may accompany it.`};
const derived:Record<string,Meaning>={
 buttonPress:{title:'Button down',purpose:'Starts the logical press. Use this event to begin a pressed state, rather than also triggering on the accompanying raw press.'},
 buttonHold:{title:'Hold recognized',purpose:'The press has been recognized as a hold. Use this to start a long-press interaction; it is not another button-down event.'},
 buttonRelease:{title:'Button up',purpose:'Ends the logical pressed state. This event can accompany the raw release and, after a hold, a separate hold-ended event.'},
 buttonHoldRelease:{title:'Hold ended',purpose:'Marks the end of a recognized hold. Use this to finish a hold interaction; it is not a second physical release.'},
 singleTap:{title:'Single tap',purpose:'Reports the single-tap interaction.'},doubleTap:{title:'Double tap',purpose:'Reports the double-tap interaction.'},
};
for(const direction of ['Up','Down','Left','Right']) derived[`button${direction}`]={title:`Direction ${direction.toLowerCase()}`,purpose:`Reports the logical ${direction.toLowerCase()} interaction. It can accompany the raw direction gesture; choose one layer when triggering an app command.`};
const field=(p:Packet,key:string)=>typeof p[key]==='string'?p[key] as string:'';
const populated=(value:string)=>!!value&&value!=='unknown'&&!value.startsWith('unknown:');
export function gestureMeaning(p:Packet){
 const action=field(p,'action'),interaction=field(p,'derived_action');
 const hasRaw=populated(action),hasDerived=populated(interaction);
 const rawMeaning=raw[action]??(action.startsWith('partial')?{title:`Partial ${action.slice(7).toLowerCase()}`,purpose:'Reports a partial gesture stage. Exact recognition thresholds are not documented.'}:undefined);
 const derivedMeaning=derived[interaction];
 const layer=hasRaw&&hasDerived?'Both layers':hasDerived?'Derived interaction':hasRaw?'Raw gesture':'Unclassified';
 const meaning=hasRaw?(rawMeaning??{title:action,purpose:'This raw gesture has no documented interpretation in the app.'}):hasDerived?(derivedMeaning??{title:interaction,purpose:'This derived interaction has no documented interpretation in the app.'}):{title:'Unclassified event',purpose:'Neither field has a recognized action label. Inspect the raw codes for details.'};
 return {...meaning,layer,code:hasRaw?action:hasDerived?interaction:action||interaction||'unknown',rawTitle:rawMeaning?.title,derivedTitle:derivedMeaning?.title,derivedPurpose:derivedMeaning?.purpose};
}
