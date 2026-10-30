import type { ISfx, SfxName } from '../contracts';
import { getCtx, getMaster, unlockAudio } from './audio';

/* Every sound is synthesised on the fly: soft, rounded, never harsh.
   The noise buffer is created once and reused. */

let out: GainNode | null = null;
let volume = 0.8;
let noiseBuf: AudioBuffer | null = null;

function bus(): GainNode {
  if (!out) {
    out = getCtx().createGain();
    out.gain.value = volume;
    out.connect(getMaster());
  }
  return out;
}

function noise(): AudioBuffer {
  if (!noiseBuf) {
    const c = getCtx();
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

interface K {
  c: AudioContext;
  /** start time */
  t: number;
  /** volume multiplier */
  v: number;
  /** pitch multiplier */
  p: number;
  dest: AudioNode;
}

/** Enveloped oscillator: quick attack, exponential decay. */
function tone(
  k: K, freq: number, at: number, dur: number, vol: number,
  type: OscillatorType = 'sine', slideTo?: number, attack = 0.008,
): void {
  const o = k.c.createOscillator();
  const g = k.c.createGain();
  const t0 = k.t + at;
  o.type = type;
  o.frequency.setValueAtTime(freq * k.p, t0);
  if (slideTo !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo * k.p), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol * k.v, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(k.dest);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

/** Filtered noise burst with an optional filter sweep. */
function hiss(
  k: K, at: number, dur: number, vol: number, type: BiquadFilterType,
  f0: number, f1?: number, q = 0.8, attack = 0.01,
): void {
  const s = k.c.createBufferSource();
  s.buffer = noise();
  s.loop = true;
  const f = k.c.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  const t0 = k.t + at;
  f.frequency.setValueAtTime(f0 * k.p, t0);
  if (f1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * k.p), t0 + dur);
  const g = k.c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol * k.v, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f).connect(g).connect(k.dest);
  s.start(t0, Math.random() * 1.5);
  s.stop(t0 + dur + 0.02);
}

const note = (semi: number) => 440 * Math.pow(2, semi / 12);

const recipes: Record<SfxName, (k: K) => void> = {
  arrow(k) {
    hiss(k, 0, 0.28, 0.35, 'bandpass', 700, 2600, 1.2, 0.05);
    tone(k, 420, 0, 0.2, 0.06, 'sine', 900);
  },
  jump(k) {
    // a spring: a sine that rises with a quick wobble, and a soft thud of the push
    tone(k, 120, 0, 0.08, 0.25, 'sine', 70);
    const o = k.c.createOscillator();
    const g = k.c.createGain();
    const lfo = k.c.createOscillator();
    const lg = k.c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(240 * k.p, k.t);
    o.frequency.exponentialRampToValueAtTime(700 * k.p, k.t + 0.22);
    lfo.frequency.value = 22;
    lg.gain.value = 40 * k.p;
    lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, k.t);
    g.gain.linearRampToValueAtTime(0.28 * k.v, k.t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, k.t + 0.26);
    o.connect(g).connect(k.dest);
    o.start(k.t);
    lfo.start(k.t);
    o.stop(k.t + 0.28);
    lfo.stop(k.t + 0.28);
  },
  hit(k) {
    tone(k, 170, 0, 0.16, 0.5, 'sine', 70);
    hiss(k, 0, 0.07, 0.15, 'lowpass', 900);
  },
  lightning(k) {
    hiss(k, 0, 0.5, 0.3, 'bandpass', 3200, 900, 0.7, 0.01);
    for (let i = 0; i < 6; i++) hiss(k, i * 0.045 + Math.random() * 0.02, 0.05, 0.18, 'highpass', 2500);
    tone(k, 90, 0.05, 0.7, 0.45, 'sine', 45, 0.05);
    hiss(k, 0.05, 0.7, 0.2, 'lowpass', 220, 90, 0.5, 0.06);
  },
  coin(k) {
    tone(k, note(14), 0, 0.14, 0.22, 'triangle');
    tone(k, note(14), 0, 0.14, 0.05, 'sine');
    tone(k, note(21), 0.08, 0.38, 0.22, 'triangle');
    tone(k, note(33), 0.08, 0.2, 0.04, 'sine');
  },
  pickup(k) {
    tone(k, 300, 0, 0.13, 0.4, 'sine', 800);
    tone(k, 1200, 0.03, 0.06, 0.06, 'sine');
  },
  sticker(k) {
    [0, 4, 7, 12, 16].forEach((s, i) => {
      tone(k, note(s + 3), i * 0.085, 0.3, 0.2, 'triangle');
      tone(k, note(s + 15), i * 0.085, 0.18, 0.04, 'sine');
    });
  },
  poof(k) {
    hiss(k, 0, 0.35, 0.35, 'lowpass', 1800, 300, 0.5, 0.02);
    tone(k, 260, 0, 0.18, 0.15, 'sine', 120);
  },
  hurt(k) {
    // cartoon boing: a sine that wobbles while sliding down
    const o = k.c.createOscillator();
    const g = k.c.createGain();
    const lfo = k.c.createOscillator();
    const lg = k.c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(520 * k.p, k.t);
    o.frequency.exponentialRampToValueAtTime(190 * k.p, k.t + 0.4);
    lfo.frequency.value = 17;
    lg.gain.value = 55 * k.p;
    lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, k.t);
    g.gain.linearRampToValueAtTime(0.4 * k.v, k.t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, k.t + 0.42);
    o.connect(g).connect(k.dest);
    o.start(k.t);
    lfo.start(k.t);
    o.stop(k.t + 0.45);
    lfo.stop(k.t + 0.45);
  },
  place(k) {
    tone(k, 210, 0, 0.09, 0.5, 'triangle', 150);
    tone(k, 520, 0, 0.05, 0.15, 'sine', 380);
    hiss(k, 0, 0.04, 0.12, 'bandpass', 1500, undefined, 1.5);
  },
  break(k) {
    for (let i = 0; i < 7; i++) {
      hiss(k, i * 0.03 + Math.random() * 0.03, 0.09, 0.22, 'bandpass', 500 + Math.random() * 1800, undefined, 1.4);
    }
    tone(k, 150, 0, 0.12, 0.25, 'sine', 80);
  },
  wake(k) {
    [0, 7, 12].forEach((s, i) => {
      tone(k, note(s + 12), i * 0.16, 0.8, 0.16, 'sine', undefined, 0.02);
      tone(k, note(s + 24), i * 0.16, 0.5, 0.04, 'sine', undefined, 0.02);
    });
  },
  switch(k) {
    hiss(k, 0, 0.22, 0.25, 'bandpass', 500, 2200, 1.2, 0.04);
    tone(k, note(19), 0.12, 0.3, 0.16, 'triangle');
    tone(k, note(26), 0.18, 0.3, 0.1, 'sine');
  },
  step(k) {
    tone(k, 110 + Math.random() * 30, 0, 0.04, 0.05, 'sine', 70);
    hiss(k, 0, 0.025, 0.03, 'bandpass', 1200);
  },
  click(k) {
    tone(k, 880, 0, 0.05, 0.15, 'triangle', 640);
  },
  door(k) {
    // a soft wooden creak: a low reedy voice that bends up and down, chopped into
    // fast grains by a tremolo and rounded by a band-pass, then a gentle knock
    const o = k.c.createOscillator();
    const f = k.c.createBiquadFilter();
    const g = k.c.createGain();
    const trem = k.c.createOscillator();
    const tg = k.c.createGain();
    const t0 = k.t;
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(150 * k.p, t0);
    o.frequency.linearRampToValueAtTime(205 * k.p, t0 + 0.28);
    o.frequency.linearRampToValueAtTime(165 * k.p, t0 + 0.6);
    f.type = 'bandpass';
    f.frequency.value = 900 * k.p;
    f.Q.value = 2.2;
    trem.frequency.setValueAtTime(34, t0);
    trem.frequency.linearRampToValueAtTime(22, t0 + 0.6);
    tg.gain.value = 0.5;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.16 * k.v, t0 + 0.06);
    g.gain.setValueAtTime(0.16 * k.v, t0 + 0.42);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.62);
    trem.connect(tg).connect(g.gain);
    o.connect(f).connect(g).connect(k.dest);
    o.start(t0);
    trem.start(t0);
    o.stop(t0 + 0.65);
    trem.stop(t0 + 0.65);
    tone(k, 120, 0.6, 0.16, 0.22, 'sine', 75);
    hiss(k, 0.6, 0.05, 0.06, 'lowpass', 700);
  },
  clink(k) {
    // «дзинь»: a bright little bell, two partials that ring off
    tone(k, 1760, 0, 0.32, 0.16, 'triangle', 1700);
    tone(k, 2640, 0, 0.2, 0.06, 'sine');
    tone(k, 3960, 0.01, 0.1, 0.03, 'sine');
    hiss(k, 0, 0.03, 0.08, 'highpass', 3000);
  },
  rumble(k) {
    // a soft deep thud with gravel: big, but never harsh
    tone(k, 70, 0, 0.7, 0.55, 'sine', 38, 0.02);
    tone(k, 110, 0, 0.35, 0.2, 'triangle', 55);
    hiss(k, 0, 0.8, 0.3, 'lowpass', 600, 120, 0.6, 0.03);
    for (let i = 0; i < 5; i++) hiss(k, 0.05 + i * 0.07 + Math.random() * 0.03, 0.08, 0.1, 'bandpass', 400 + Math.random() * 900, undefined, 1.2);
  },
  chug(k) {
    // a soft low putt with a little puff of air
    tone(k, 62 + Math.random() * 6, 0, 0.12, 0.3, 'triangle', 44, 0.004);
    hiss(k, 0, 0.07, 0.06, 'lowpass', 500);
  },
  // ─── monster cries (MonsterCard.cry): a toy's voice, never scary-loud ───
  cry_siren(k) {
    // a soft two-tone wail rising and falling twice, like a toy siren
    for (let i = 0; i < 2; i++) {
      tone(k, 520, i * 0.7, 0.38, 0.12, 'triangle', 780, 0.06);
      tone(k, 780, i * 0.7 + 0.36, 0.36, 0.1, 'triangle', 520, 0.03);
    }
  },
  cry_growl(k) {
    // a short rumbly grumble: a low saw wobbling through a soft low-pass
    tone(k, 95, 0, 0.5, 0.16, 'sawtooth', 70, 0.04);
    hiss(k, 0, 0.45, 0.12, 'lowpass', 380, 160, 0.7, 0.05);
  },
  cry_hiss(k) {
    hiss(k, 0, 0.55, 0.16, 'highpass', 2400, 3800, 0.6, 0.08);
  },
  cry_beep(k) {
    for (let i = 0; i < 3; i++) tone(k, [880, 660, 990][i], i * 0.12, 0.09, 0.09, 'square', undefined, 0.004);
  },
};

// ─── ambience ───────────────────────────────────────────────────────────────

let ambKind: 'day' | 'night' | null = null;
let ambGain: GainNode | null = null;
let ambNodes: AudioScheduledSourceNode[] = [];
let ambTimer: ReturnType<typeof setTimeout> | null = null;

function stopAmbient(): void {
  if (ambTimer) clearTimeout(ambTimer);
  ambTimer = null;
  const g = ambGain;
  const nodes = ambNodes;
  ambGain = null;
  ambNodes = [];
  if (g) {
    const c = getCtx();
    g.gain.cancelScheduledValues(c.currentTime);
    g.gain.setValueAtTime(g.gain.value, c.currentTime);
    g.gain.linearRampToValueAtTime(0, c.currentTime + 0.8);
    setTimeout(() => {
      nodes.forEach((n) => {
        try { n.stop(); } catch { /* already stopped */ }
      });
      g.disconnect();
    }, 900);
  }
}

function fadeIn(g: GainNode, to: number): void {
  const c = getCtx();
  g.gain.setValueAtTime(0, c.currentTime);
  g.gain.linearRampToValueAtTime(to, c.currentTime + 2);
}

function chirp(dest: AudioNode, vol: number): void {
  const c = getCtx();
  const base = 2400 + Math.random() * 1400;
  const n = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const t0 = c.currentTime + i * 0.13;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(base, t0);
    o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.3), t0 + 0.08);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
    o.connect(g).connect(dest);
    o.start(t0);
    o.stop(t0 + 0.12);
  }
}

function cricket(dest: AudioNode, vol: number): void {
  const c = getCtx();
  const f = 4200 + Math.random() * 600;
  for (let i = 0; i < 3; i++) {
    const t0 = c.currentTime + i * 0.07;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
    o.connect(g).connect(dest);
    o.start(t0);
    o.stop(t0 + 0.06);
  }
}

function startAmbient(kind: 'day' | 'night'): void {
  const c = getCtx();
  const g = c.createGain();
  g.connect(bus());
  ambGain = g;

  if (kind === 'day') {
    // very quiet wind: looped noise through a slowly breathing low-pass
    const s = c.createBufferSource();
    s.buffer = noise();
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = 0.13;
    lg.gain.value = 160;
    lfo.connect(lg).connect(f.frequency);
    const wg = c.createGain();
    wg.gain.value = 0.16;
    s.connect(f).connect(wg).connect(g);
    s.start();
    lfo.start();
    ambNodes.push(s, lfo);
    fadeIn(g, 1);
    const loop = () => {
      if (ambKind !== 'day') return;
      chirp(g, 0.035);
      ambTimer = setTimeout(loop, 5000 + Math.random() * 9000);
    };
    ambTimer = setTimeout(loop, 3000 + Math.random() * 4000);
  } else {
    fadeIn(g, 1);
    const loop = () => {
      if (ambKind !== 'night') return;
      cricket(g, 0.018);
      ambTimer = setTimeout(loop, 500 + Math.random() * 1400);
    };
    ambTimer = setTimeout(loop, 400);
  }
}

// ─── public ─────────────────────────────────────────────────────────────────

const lastPlayed = new Map<SfxName, number>();

export const sfx: ISfx = {
  unlock() {
    unlockAudio();
  },

  play(name, opts) {
    const now = performance.now();
    if (now - (lastPlayed.get(name) ?? -1e9) < 25) return; // anti-stack
    lastPlayed.set(name, now);
    try {
      const c = getCtx();
      if (c.state !== 'running') void c.resume();
      recipes[name]({ c, t: c.currentTime + 0.005, v: opts?.volume ?? 1, p: opts?.pitch ?? 1, dest: bus() });
    } catch {
      /* audio unavailable: stay silent */
    }
  },

  setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (out) out.gain.value = volume;
  },

  ambient(kind) {
    if (kind === ambKind) return;
    ambKind = kind;
    try {
      stopAmbient();
      if (kind) startAmbient(kind);
    } catch {
      /* audio unavailable: stay silent */
    }
  },
};
