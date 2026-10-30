export type AppSettings = {runInBackground:boolean;openAtLogin:boolean;loginAvailable:boolean;loginStatus?:string};
export type Packet = {type:string; received_at?:number; sequence?:number; timestamp?:number; values?:number[][]|number[]; finger?:string; action?:string; [key:string]:unknown};
export type Message = {kind:string; [key:string]:any};
export type Command = {action:string; [key:string]:unknown};
export type Device = {id:string;name:string;rssi?:number};
declare global { interface Window {band?:{getSettings?:()=>Promise<AppSettings>;updateSettings?:(settings:Partial<AppSettings>)=>Promise<AppSettings>;send:(command:Command)=>void;onMessage:(callback:(message:Message)=>void)=>()=>void}} }
