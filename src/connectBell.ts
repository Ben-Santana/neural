import {loadSoundSettings, type SoundId} from './soundSettings';

let audio: AudioContext | undefined;
let master: GainNode | undefined;
let lastConnect = 0;
let lastDisconnect = 0;

function context(){
 const Context = window.AudioContext || (window as typeof window & {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
 if (!Context) return null;
 if (!audio) audio = new Context();
 return audio;
}

function bus(ctx: AudioContext){
 const level = Math.min(1, Math.max(0, loadSoundSettings().volume / 100));
 if (!master || master.context !== ctx){
  master = ctx.createGain();
  master.connect(ctx.destination);
 }
 master.gain.setValueAtTime(level, ctx.currentTime);
 return master;
}

function tone(ctx: AudioContext, when: number, frequency: number, level: number, decay: number, glideTo?: number){
 const osc = ctx.createOscillator();
 const gain = ctx.createGain();
 osc.type = 'sine';
 osc.frequency.setValueAtTime(frequency, when);
 if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, when + decay);
 gain.gain.setValueAtTime(0.0001, when);
 gain.gain.exponentialRampToValueAtTime(level, when + 0.008);
 gain.gain.exponentialRampToValueAtTime(0.0001, when + decay);
 osc.connect(gain);
 gain.connect(bus(ctx));
 osc.start(when);
 osc.stop(when + decay + 0.02);
}

function allow(kind: 'step' | 'success' | 'radial' | 'connection', preview: boolean){
 const settings = loadSoundSettings();
 if (preview) return settings;
 if (!settings.enabled) return null;
 if (kind === 'step' && !settings.stepOn) return null;
 if (kind === 'success' && !settings.successOn) return null;
 if (kind === 'radial' && !settings.radialOn) return null;
 if (kind === 'connection' && !settings.connectionOn) return null;
 return settings;
}

function playConnectionVoice(kind: 'bells' | 'tone' | 'tap', leaving: boolean){
 const ctx = context();
 if (!ctx) return;
 void ctx.resume();
 const now = ctx.currentTime + 0.01;
 if (kind === 'tone'){
  tone(ctx, now, leaving ? 523.25 : 392, 0.07, 0.55, leaving ? 311.13 : 523.25);
  return;
 }
 if (kind === 'tap'){
  tone(ctx, now, leaving ? 392 : 523.25, 0.06, 0.16);
  return;
 }
 if (leaving){
  tone(ctx, now, 523.25, 0.11, 0.75, 440);
  tone(ctx, now, 784, 0.045, 0.48, 659.25);
  tone(ctx, now, 1046.5, 0.02, 0.28, 880);
  return;
 }
 tone(ctx, now, 523.25, 0.16, 0.9);
 tone(ctx, now, 784, 0.07, 0.55);
 tone(ctx, now, 1046.5, 0.035, 0.32);
}

export function playConnectBell(preview = false){
 const settings = allow('connection', preview);
 if (!settings) return;
 const nowMs = performance.now();
 if (!preview && nowMs - lastConnect < 1200) return;
 lastConnect = nowMs;
 playVoice(settings.connection, 392);
}

export function playDisconnectBell(preview = false){
 const settings = allow('connection', preview);
 if (!settings) return;
 const nowMs = performance.now();
 if (!preview && nowMs - lastDisconnect < 1200) return;
 lastDisconnect = nowMs;
 playVoice(settings.connection, 392, true);
}

const comboProgress = new Map<string, number>();
let lastRadial = 0;
let clickBuffer: AudioBuffer | undefined;

function ready(){
 const ctx = context();
 if (!ctx) return null;
 void ctx.resume();
 return ctx;
}

function chime(ctx: AudioContext, when: number, frequency: number, level: number, decay: number){
 ([[1, 1, 1], [2, 0.28, 0.62]] as const).forEach(([ratio, share, length]) => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  const peak = Math.max(0.0002, level * share);
  osc.frequency.setValueAtTime(frequency * ratio * 0.985, when);
  osc.frequency.exponentialRampToValueAtTime(frequency * ratio, when + 0.028);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(peak, when + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + decay * length);
  osc.connect(gain);
  gain.connect(bus(ctx));
  osc.start(when);
  osc.stop(when + decay + 0.03);
 });
}

function click(ctx: AudioContext, when: number, frequency: number, level: number){
 if (!clickBuffer || clickBuffer.sampleRate !== ctx.sampleRate){
  const length = Math.max(1, Math.floor(ctx.sampleRate * 0.018));
  clickBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = clickBuffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2;
 }
 const source = ctx.createBufferSource();
 const filter = ctx.createBiquadFilter();
 const gain = ctx.createGain();
 source.buffer = clickBuffer;
 filter.type = 'bandpass';
 filter.frequency.setValueAtTime(frequency, when);
 filter.Q.value = 1.4;
 gain.gain.setValueAtTime(level, when);
 gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.022);
 source.connect(filter);
 filter.connect(gain);
 gain.connect(bus(ctx));
 source.start(when);
 source.stop(when + 0.03);
}

function stepFreq(step: number){
 const clamped = Math.max(1, Math.min(step, 12));
 return 392 * 2 ** (((clamped - 1) * 2) / 12);
}

function sine(ctx: AudioContext, when: number, frequency: number, level: number, attack: number, decay: number, glideTo?: number){
 const osc = ctx.createOscillator();
 const gain = ctx.createGain();
 osc.type = 'sine';
 osc.frequency.setValueAtTime(frequency, when);
 if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, when + Math.min(decay, 0.28));
 gain.gain.setValueAtTime(0.0001, when);
 gain.gain.exponentialRampToValueAtTime(level, when + attack);
 gain.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
 osc.connect(gain);
 gain.connect(bus(ctx));
 osc.start(when);
 osc.stop(when + attack + decay + 0.04);
}

// Every event uses this renderer so a voice has the same character in every dropdown.
// Combo steps and radial positions supply pitch; disconnects reverse the connection cue.
function playVoice(kind: SoundId, frequency = 392, leaving = false, delay = 0){
 const ctx = ready();
 if (!ctx) return;
 const now = ctx.currentTime + 0.012 + delay;
 const f = frequency;
 switch (kind){
  case 'whole': sine(ctx, now, f, 0.08, 0.008, 0.2); break;
  case 'pop': sine(ctx, now, f, 0.07, 0.004, 0.09); break;
  case 'soft': sine(ctx, now, f, 0.035, 0.05, 0.34); break;
  case 'lift': sine(ctx, now, 392, 0.05, 0.08, 0.62, 587.33); break;
  case 'bell':
   sine(ctx, now, 523.25, 0.04, 0.09, 0.7);
   sine(ctx, now + 0.04, 659.25, 0.028, 0.1, 0.75); break;
  case 'hum': sine(ctx, now, 311.13, 0.04, 0.12, 0.85); break;
  case 'click':
   click(ctx, now, Math.min(4200, f * 3), 0.055);
   chime(ctx, now, f, 0.05, 0.08); break;
  case 'tick': click(ctx, now, 1600, 0.03); break;
  case 'pip': sine(ctx, now, f, 0.04, 0.004, 0.07); break;
  case 'bells': case 'tone': case 'tap': playConnectionVoice(kind, leaving); break;
  case 'wood':
   sine(ctx, now, f * 0.75, 0.085, 0.002, 0.055);
   sine(ctx, now, f * 1.71, 0.025, 0.002, 0.028); break;
  case 'rim':
   click(ctx, now, 2600, 0.12);
   sine(ctx, now, 880, 0.04, 0.002, 0.035); break;
  case 'pluck':
   sine(ctx, now, f, 0.075, 0.003, 0.28);
   sine(ctx, now, f * 3, 0.018, 0.002, 0.065); break;
  case 'marimba':
   sine(ctx, now, f * 0.5, 0.08, 0.003, 0.32);
   sine(ctx, now, f * 2, 0.025, 0.002, 0.07); break;
  case 'kalimba':
   chime(ctx, now, f * 1.5, 0.065, 0.3);
   click(ctx, now, 3200, 0.018); break;
  case 'glass':
   chime(ctx, now, f * 2, 0.045, 0.55);
   sine(ctx, now, f * 2.76, 0.015, 0.003, 0.25); break;
  case 'sparkle':
   [2, 2.5, 3].forEach((ratio, i) => chime(ctx, now + i * 0.055, f * ratio, 0.035, 0.22)); break;
  case 'harp':
   [1, 1.25, 1.5, 2].forEach((ratio, i) => sine(ctx, now + i * 0.045, f * ratio, 0.045, 0.004, 0.38)); break;
  case 'sonar': sine(ctx, now, f * 2, 0.06, 0.015, 0.6); break;
  case 'bubble': sine(ctx, now, f * 0.6, 0.08, 0.003, 0.12, f * 1.8); break;
  case 'droplet': sine(ctx, now, f * 3, 0.065, 0.002, 0.16, f); break;
  case 'chirp':
   sine(ctx, now, f * 2, 0.045, 0.004, 0.08, f * 3);
   sine(ctx, now + 0.1, f * 2.5, 0.035, 0.004, 0.07, f * 3.5); break;
  case 'blip':
   tone(ctx, now, f, 0.06, 0.065);
   tone(ctx, now + 0.065, f * 2, 0.045, 0.085); break;
  case 'coin':
   tone(ctx, now, 987.77, 0.055, 0.09);
   chime(ctx, now + 0.075, 1318.51, 0.05, 0.28); break;
  case 'laser': sine(ctx, now, f * 4, 0.055, 0.003, 0.22, f * 0.5); break;
  case 'swoosh':
   [0, 1, 2, 3, 4].forEach(i => click(ctx, now + i * 0.025, 700 + i * 650, 0.025 + (2 - Math.abs(2 - i)) * 0.02)); break;
  case 'warm':
   [1, 1.25, 1.5].forEach(ratio => sine(ctx, now, f * 0.5 * ratio, 0.025, 0.09, 0.55)); break;
  case 'resolve':
   [1, 1.25, 1.5, 2].forEach((ratio, i) => chime(ctx, now + i * 0.075, f * ratio, 0.04, 0.35)); break;
  case 'bounce':
   [0, 1, 2].forEach(i => sine(ctx, now + i * 0.1, f * (1.5 - i * 0.25), 0.065 / (i + 1), 0.003, 0.08, f * 0.75)); break;
  case 'shimmer':
   [2, 2.01, 3, 3.02].forEach((ratio, i) => sine(ctx, now + i * 0.018, f * ratio, 0.018, 0.055, 0.65)); break;
  default: { const unhandled: never = kind; return unhandled; }
 }
}

type ComboCandidate = {id?: string; attemptId?: string; matched?: number};

export function noteComboProgress(candidates: unknown, stepsFor: (id: string) => number){
 if (!Array.isArray(candidates)) return;
 const live = new Set<string>();
 let best = 0;
 for (const candidate of candidates as ComboCandidate[]){
  const steps = candidate && typeof candidate.id === 'string' ? stepsFor(candidate.id) : 0;
  if (!candidate || typeof candidate.attemptId !== 'string' || !steps) continue;
  if (typeof candidate.matched !== 'number' || candidate.matched < 1) continue;
  live.add(candidate.attemptId);
  const previous = comboProgress.get(candidate.attemptId) ?? 0;
  if (candidate.matched > previous && candidate.matched < steps) best = Math.max(best, candidate.matched);
  comboProgress.set(candidate.attemptId, candidate.matched);
 }
 for (const id of comboProgress.keys()) if (!live.has(id)) comboProgress.delete(id);
 if (best){
  const settings = allow('step', false);
  if (settings) playVoice(settings.step, stepFreq(best));
 }
}

export function noteComboOutcome(attemptId: unknown, steps?: number){
 const completedStep = steps ?? (typeof attemptId === 'string' ? (comboProgress.get(attemptId) ?? 0) + 1 : 1);
 if (typeof attemptId === 'string') comboProgress.delete(attemptId);
 const settings = allow('success', false);
 if (settings) playVoice(settings.success, settings.success === 'whole' ? stepFreq(completedStep) : undefined);
}

const wheel = [0, 2, 4, 7, 9, 12, 14, 16];

function playRadialVoice(kind: SoundId, index: number, count: number){
 const degree = kind === 'whole' ? index * 2 : wheel[Math.min(wheel.length - 1, Math.round((index / count) * wheel.length))] ?? 0;
 playVoice(kind, 587.33 * 2 ** (degree / 12));
}

export function playRadialClick(index: number, count: number, preview = false){
 if (count < 2 || index < 0) return;
 const settings = allow('radial', preview);
 if (!settings) return;
 const nowMs = performance.now();
 if (!preview && nowMs - lastRadial < 42) return;
 lastRadial = nowMs;
 playRadialVoice(settings.radial, index, count);
}

export function playAdjustTick(){
 const settings = allow('radial', false);
 if (!settings) return;
 const nowMs = performance.now();
 if (nowMs - lastRadial < 42) return;
 lastRadial = nowMs;
 playRadialVoice(settings.radial, 0, 2);
}

export function previewSound(kind: 'step' | 'success' | 'radial' | 'connection'){
 const settings = loadSoundSettings();
 if (settings[kind] === 'whole'){
  [1, 2, 3].forEach((step, index) => playVoice('whole', stepFreq(step), false, index * 0.24));
  return;
 }
 if (kind === 'step') playVoice(settings.step, stepFreq(2));
 if (kind === 'success') playVoice(settings.success);
 if (kind === 'radial') playRadialClick(3, 8, true);
 if (kind === 'connection') playConnectBell(true);
}


export function playAirResult(success:boolean){
 const settings=loadSoundSettings();
 if(!settings.enabled||!settings.airOn)return;
 const ctx=ready();if(!ctx)return;
 const now=ctx.currentTime+.012;
 if(success){
  sine(ctx,now,523.25,.06,.008,.16);
  sine(ctx,now+.09,783.99,.05,.008,.24);
 }else{
  sine(ctx,now,311.13,.05,.008,.16);
  sine(ctx,now+.10,233.08,.045,.008,.22);
 }
}
