/**
 * The little instruments the songs are played on, made on the shared AudioContext (no files, so
 * they sound offline). Songs: voice/music.ts and voice/discTunes.ts.
 */

export const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

let noiseBuf: AudioBuffer | null = null;
function noise(c: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

export function env(c: AudioContext, dest: AudioNode, t: number, vol: number, dur: number, attack = 0.005): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(dest);
  return g;
}

export function osc(c: AudioContext, dest: AudioNode, t: number, type: OscillatorType, f0: number, dur: number, vol: number, f1?: number): void {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== undefined) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  o.connect(env(c, dest, t, vol, dur));
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function hiss(c: AudioContext, dest: AudioNode, t: number, type: BiquadFilterType, f: number, dur: number, vol: number): void {
  const s = c.createBufferSource();
  s.buffer = noise(c);
  const flt = c.createBiquadFilter();
  flt.type = type;
  flt.frequency.value = f;
  s.connect(flt).connect(env(c, dest, t, vol, dur, 0.002));
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.02);
}

/** A song: its tempo, how loud it sits, and one 16th step of it at audio time `t`. */
export interface Song {
  bpm: number;
  gain: number;
  /** Steps before it starts over (a waltz's bars are three beats long). */
  loop?: number;
  step(c: AudioContext, out: AudioNode, step: number, t: number): void;
}

/** A bell-like note: a sine with a soft octave above. */
export function bell(c: AudioContext, out: AudioNode, t: number, n: number, dur: number, vol: number): void {
  osc(c, out, t, 'sine', hz(n), dur, vol);
  osc(c, out, t, 'triangle', hz(n + 12), dur * 0.5, vol * 0.28);
}

/** Three detuned saws through a low-pass: a toy power chord (root, fifth, octave). */
export function chug(c: AudioContext, out: AudioNode, t: number, root: number, dur: number, vol: number): void {
  const flt = c.createBiquadFilter();
  flt.type = 'lowpass';
  flt.frequency.value = 1400;
  flt.connect(env(c, out, t, vol, dur, 0.004));
  for (const [n, d] of [
    [root, -6],
    [root + 7, 5],
    [root + 12, 0],
  ]) {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = hz(n);
    o.detune.value = d;
    o.connect(flt);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
}

/** A whistle: a sine with a little vibrato. */
export function whistle(c: AudioContext, out: AudioNode, t: number, n: number, dur: number, vol: number): void {
  const o = c.createOscillator();
  const lfo = c.createOscillator();
  const depth = c.createGain();
  o.type = 'sine';
  o.frequency.value = hz(n);
  lfo.frequency.value = 6;
  depth.gain.value = hz(n) * 0.012;
  lfo.connect(depth).connect(o.frequency);
  o.connect(env(c, out, t, vol, dur, 0.02));
  o.start(t);
  lfo.start(t);
  o.stop(t + dur + 0.02);
  lfo.stop(t + dur + 0.02);
}

/** Notes as [step in the bar, midi note], one bar per chord. */
export type Bars = [number, number][][];

export const at = (bars: Bars, bar: number, s: number) => bars[bar].filter(([k]) => k === s).map(([, n]) => n);

/** A plucked string (a bandura): a bright start that dies away fast. */
export function pluck(c: AudioContext, out: AudioNode, t: number, n: number, dur: number, vol: number): void {
  osc(c, out, t, 'triangle', hz(n), dur, vol);
  osc(c, out, t, 'square', hz(n + 12), dur * 0.25, vol * 0.18);
}

/** A sawtooth through a low-pass that opens with the note: a toy horn. */
export function brass(c: AudioContext, out: AudioNode, t: number, n: number, dur: number, vol: number): void {
  const flt = c.createBiquadFilter();
  flt.type = 'lowpass';
  flt.frequency.setValueAtTime(500, t);
  flt.frequency.exponentialRampToValueAtTime(2400, t + Math.min(0.09, dur * 0.5));
  flt.connect(env(c, out, t, vol, dur, 0.02));
  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = hz(n);
  o.connect(flt);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** Notes through a filter sweeping up and back (a wah pedal). */
export function wah(c: AudioContext, out: AudioNode, t: number, notes: readonly number[], dur: number, vol: number): void {
  const flt = c.createBiquadFilter();
  flt.type = 'bandpass';
  flt.Q.value = 5;
  flt.frequency.setValueAtTime(420, t);
  flt.frequency.exponentialRampToValueAtTime(2200, t + dur * 0.45);
  flt.frequency.exponentialRampToValueAtTime(600, t + dur);
  flt.connect(env(c, out, t, vol, dur, 0.008));
  for (const n of notes) {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = hz(n);
    o.connect(flt);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
}

/** A bubble rising: a quick sine sweep up. */
export function bloop(c: AudioContext, out: AudioNode, t: number, n: number, vol: number): void {
  osc(c, out, t, 'sine', hz(n), 0.09, vol, hz(n + 12));
}

/** A cat's purr: a very low buzz, soft and rough, breathing in and out over `dur`. */
export function purr(c: AudioContext, out: AudioNode, t: number, dur: number, vol: number): void {
  const flt = c.createBiquadFilter();
  flt.type = 'lowpass';
  flt.frequency.value = 340;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + dur * 0.4);
  g.gain.linearRampToValueAtTime(vol * 0.6, t + dur * 0.7);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  flt.connect(g).connect(out);
  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(27, t);
  o.frequency.linearRampToValueAtTime(23, t + dur);
  o.connect(flt);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** A little «мяу»: the note slides up and drops, a filter opens like a mouth. */
export function mew(c: AudioContext, out: AudioNode, t: number, n: number, dur: number, vol: number): void {
  const flt = c.createBiquadFilter();
  flt.type = 'bandpass';
  flt.Q.value = 3;
  flt.frequency.setValueAtTime(700, t);
  flt.frequency.exponentialRampToValueAtTime(1900, t + dur * 0.4);
  flt.frequency.exponentialRampToValueAtTime(800, t + dur);
  flt.connect(env(c, out, t, vol, dur, 0.03));
  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(hz(n - 3), t);
  o.frequency.exponentialRampToValueAtTime(hz(n), t + dur * 0.35);
  o.frequency.exponentialRampToValueAtTime(hz(n - 4), t + dur);
  o.connect(flt);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** A sung «ля»: a buzzing voice through two mouth shapes, with a little vibrato (the karaoke). */
export function sung(c: AudioContext, out: AudioNode, t: number, n: number, dur: number, vol: number): void {
  const voiceOut = env(c, out, t, vol, dur, 0.04);
  for (const [f, q, g] of [
    [750, 6, 1],
    [1200, 8, 0.6],
  ]) {
    const flt = c.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.value = f;
    flt.Q.value = q;
    const lvl = c.createGain();
    lvl.gain.value = g;
    flt.connect(lvl).connect(voiceOut);
    const o = c.createOscillator();
    const lfo = c.createOscillator();
    const depth = c.createGain();
    o.type = 'sawtooth';
    o.frequency.value = hz(n);
    lfo.frequency.value = 5.5;
    depth.gain.value = hz(n) * 0.01;
    lfo.connect(depth).connect(o.frequency);
    o.connect(flt);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.02);
    lfo.stop(t + dur + 0.02);
  }
}

/** A bird's chirp: a quick high sine that flicks up. */
export function chirp(c: AudioContext, out: AudioNode, t: number, n: number, vol: number): void {
  osc(c, out, t, 'sine', hz(n), 0.06, vol, hz(n + 5));
  osc(c, out, t + 0.07, 'sine', hz(n + 2), 0.05, vol * 0.8, hz(n + 7));
}
