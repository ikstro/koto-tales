import { getCtx, getMaster } from './audio';

/**
 * The boombox's music: a little disco song made in code on the shared AudioContext —
 * kick, clap, hats, an octave bass, soft chord stabs and a bell tune over
 * C – G – Am – F at 120 a minute. No files, so it plays offline. One song plays for the
 * nearest speaker; it gets louder as the hero comes closer and dips under the voice.
 * Notes are scheduled a little ahead on the audio clock, so a slow frame never
 * makes the beat stumble; with no speaker in earshot nothing is scheduled at all.
 */

export const BPM = 120;
const STEP = 60 / BPM / 4;
const LOOP = 64;
const AHEAD = 0.2;

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

const BASS = [36, 43, 45, 41];
const CHORDS = [
  [60, 64, 67],
  [59, 62, 67],
  [57, 60, 64],
  [57, 60, 65],
];
/** Bell tune: [step in the bar, midi note], one bar per chord. */
const TUNE: [number, number][][] = [
  [[0, 72], [3, 76], [6, 79], [8, 76], [10, 74], [12, 72], [14, 74]],
  [[0, 74], [3, 79], [6, 81], [8, 79], [10, 76], [12, 74]],
  [[0, 76], [3, 81], [6, 84], [8, 81], [10, 79], [12, 76]],
  [[0, 77], [3, 81], [6, 84], [8, 81], [10, 79], [12, 77], [14, 76]],
];

let noiseBuf: AudioBuffer | null = null;
function noise(c: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function env(c: AudioContext, dest: AudioNode, t: number, vol: number, dur: number, attack = 0.005): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(dest);
  return g;
}

function osc(c: AudioContext, dest: AudioNode, t: number, type: OscillatorType, f0: number, dur: number, vol: number, f1?: number): void {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== undefined) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  o.connect(env(c, dest, t, vol, dur));
  o.start(t);
  o.stop(t + dur + 0.02);
}

function hiss(c: AudioContext, dest: AudioNode, t: number, type: BiquadFilterType, f: number, dur: number, vol: number): void {
  const s = c.createBufferSource();
  s.buffer = noise(c);
  const flt = c.createBiquadFilter();
  flt.type = type;
  flt.frequency.value = f;
  s.connect(flt).connect(env(c, dest, t, vol, dur, 0.002));
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.02);
}

/** One 16th step of the song at audio time `t`. */
function playStep(c: AudioContext, out: AudioNode, step: number, t: number): void {
  const bar = Math.floor(step / 16) % 4;
  const s = step % 16;
  // drums: four on the floor, clap on 2 and 4, hats on every 8th, an open hat off the beat
  if (s % 4 === 0) osc(c, out, t, 'sine', 150, 0.2, 0.9, 42);
  if (s === 4 || s === 12) {
    hiss(c, out, t, 'bandpass', 1600, 0.13, 0.32);
    osc(c, out, t, 'triangle', 220, 0.06, 0.12, 140);
  }
  if (s % 2 === 0) hiss(c, out, t, 'highpass', 7500, s % 4 === 2 ? 0.11 : 0.04, s % 4 === 2 ? 0.09 : 0.06);
  // octave bass on every 8th
  if (s % 2 === 0) osc(c, out, t, 'triangle', hz(BASS[bar] + (s % 4 === 2 ? 12 : 0)), 0.12, 0.3);
  // chord stabs off the beat
  if (s % 4 === 2) for (const n of CHORDS[bar]) osc(c, out, t, 'triangle', hz(n), 0.16, 0.035);
  // the bell tune: a sine with a soft octave above
  for (const [at, n] of TUNE[bar]) {
    if (at !== s) continue;
    osc(c, out, t, 'sine', hz(n), 0.35, 0.09);
    osc(c, out, t, 'triangle', hz(n + 12), 0.18, 0.025);
  }
}

class Music {
  private out: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private start = 0;
  private next = 0;
  private level = 0;
  private quietFor = 0;
  private volume = 1;

  /** The sound switch (pause menu). */
  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
  }

  /**
   * Every frame: `dist` to the nearest playing speaker (Infinity: none), how far it carries,
   * and whether a voice line is playing (the music dips under it).
   */
  update(dt: number, dist: number, hear: number, voiceOn: boolean): void {
    const near = Math.min(1, Math.max(0, (hear - dist) / (hear - 4)));
    this.level = Math.pow(near, 1.3);
    if (this.level > 0 && this.volume > 0) {
      this.quietFor = 0;
      if (!this.timer) this.begin();
    } else if (this.timer && (this.quietFor += dt) > 2) this.stop();
    if (!this.out) return;
    try {
      const c = getCtx();
      const target = this.volume * this.level * (voiceOn ? 0.4 : 1) * 0.55;
      this.out.gain.setTargetAtTime(target, c.currentTime, 0.15);
    } catch {
      /* audio unavailable: stay silent */
    }
  }

  /** Music time in beats; without sound it keeps time by the clock, so the dancing still swings. */
  beat(): number {
    if (this.timer) {
      try {
        return Math.max(0, (getCtx().currentTime - this.start) * (BPM / 60));
      } catch {
        /* fall through */
      }
    }
    return (performance.now() / 1000) * (BPM / 60);
  }

  private begin(): void {
    try {
      const c = getCtx();
      if (!this.out) {
        this.out = c.createGain();
        this.out.gain.value = 0;
        this.out.connect(getMaster());
      }
      this.start = c.currentTime + 0.05;
      this.next = 0;
      this.timer = setInterval(() => this.schedule(), 50);
      this.schedule();
    } catch {
      /* audio unavailable: stay silent */
    }
  }

  private schedule(): void {
    const c = getCtx();
    if (c.state !== 'running' || !this.out) return;
    // fell behind (the tab slept): jump to now instead of firing a burst of old notes
    const now = c.currentTime;
    if (this.start + this.next * STEP < now - 0.1) this.next = Math.ceil((now - this.start) / STEP);
    while (this.start + this.next * STEP < now + AHEAD) {
      playStep(c, this.out, this.next % LOOP, this.start + this.next * STEP);
      this.next++;
    }
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.quietFor = 0;
  }
}

export const music = new Music();
