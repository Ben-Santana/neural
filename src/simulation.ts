import type {Packet} from './types';
export function simulate(t:number):Packet[]{
 const values=Array.from({length:16},(_,n)=>Array.from({length:8},(_,c)=> Math.round(32768+220*Math.sin((t*16+n)*.53+c)+Math.sin((t*16+n)*1.73+c)*800*(.2+Math.pow(Math.max(0,Math.sin(t*.035+c*.55)),12)))));
 const packets:Packet[]=[{type:'EMGBatch',sequence:t,timestamp:Math.round(t*7812.5),received_at:performance.now()/1000,source_clock:'device_emg_us',values}, {type:'Gyroscope',values:[Math.round(Math.sin(t*.03)*150),Math.round(Math.cos(t*.02)*85),Math.round(Math.sin(t*.01)*60)]},{type:'Orientation',values:[.98,Math.sin(t*.01)*.1,.08,.02]}];
 if(t%128===0){const n=t/128;const finger=['index','middle','thumb'][n%3];const action=['tap','press','release'][n%3];packets.push({type:'Gesture',sequence:t,finger,action,derived_action:['singleTap','buttonPress','buttonRelease'][n%3],finger_code:[2,3,1][n%3],action_code:[3,1,2][n%3],derived_action_code:[1,9,4][n%3],synthetic:false,source_clock:'device_gesture_us',received_at:performance.now()/1000,timestamp:t*7812});}
 return packets;
}
