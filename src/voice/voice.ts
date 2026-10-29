import type { IVoice, Speaker } from '../contracts';
import { LINES, type LineId } from '../content/lines';
import { getCtx, getMaster, unlockAudio } from './audio';

const BASE = import.meta.env.BASE_URL;
const REPEAT_GUARD_MS = 2000;

let known: Set<string> | null = null;
let indexPromise: Promise<Set<string>> | null = null;
const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer | null>>();
const lastSaid = new Map<string, number>();

let gain: GainNode | null = null;
let volume = 1;
let current: { src: AudioBufferSourceNode; priority: number } | null = null;
/** performance.now() when the last line ended (the quiet before Пупся's thoughts). */
let lastEnd = -Infinity;
/** Bumped on every say() so a slow fetch cannot start after a newer request. */
let ticket = 0;

function loadIndex(): Promise<Set<string>> {
  if (!indexPromise) {
    indexPromise = fetch(`${BASE}voice/index.json`)
      .then((r) => (r.ok ? (r.json() as Promise<string[]>) : []))
      .catch(() => [] as string[])
      .then((ids) => (known = new Set(ids)));
  }
  return indexPromise;
}

function load(id: string): Promise<AudioBuffer | null> {
  const hit = buffers.get(id);
  if (hit) return Promise.resolve(hit);
  let p = loading.get(id);
  if (!p) {
    p = (async () => {
      const ids = await loadIndex();
      if (!ids.has(id)) return null;
      try {
        const res = await fetch(`${BASE}voice/${id}.mp3`);
        if (!res.ok) return null;
        const buf = await getCtx().decodeAudioData(await res.arrayBuffer());
        buffers.set(id, buf);
        return buf;
      } catch {
        return null;
      } finally {
        loading.delete(id);
      }
    })();
    loading.set(id, p);
  }
  return p;
}

function out(): GainNode {
  if (!gain) {
    gain = getCtx().createGain();
    gain.gain.value = volume;
    gain.connect(getMaster());
  }
  return gain;
}

/** Robots buzz (ring modulation), aliens echo: added as their lines play (DESIGN.md «Villages»). */
function connect(c: AudioContext, src: AudioBufferSourceNode, speaker: Speaker | undefined): void {
  if (speaker === 'robot') {
    const ring = c.createGain();
    ring.gain.value = 0;
    const osc = c.createOscillator();
    osc.frequency.value = 62;
    const depth = c.createGain();
    depth.gain.value = 0.7;
    osc.connect(depth).connect(ring.gain);
    const dry = c.createGain();
    dry.gain.value = 0.55;
    src.connect(dry).connect(out());
    src.connect(ring).connect(out());
    osc.start();
    src.addEventListener('ended', () => osc.stop());
    return;
  }
  src.connect(out());
  if (speaker === 'alien' || speaker === 'alien_kid') {
    const delay = c.createDelay(1);
    delay.delayTime.value = 0.17;
    const back = c.createGain();
    back.gain.value = 0.36;
    const wet = c.createGain();
    wet.gain.value = 0.42;
    src.connect(delay);
    delay.connect(back).connect(delay);
    delay.connect(wet).connect(out());
  }
}

export const voice: IVoice & { preload(ids: string[]): void; quietSeconds(): number } = {
  unlock() {
    unlockAudio();
    void loadIndex();
  },

  say(lineId, opts) {
    const priority = opts?.priority ?? 0;
    const now = performance.now();
    const last = lastSaid.get(lineId);
    if (last !== undefined && now - last < REPEAT_GUARD_MS) return;
    if (current && !opts?.interrupt && current.priority > priority) return;
    lastSaid.set(lineId, now);
    const my = ++ticket;

    void load(lineId).then((buf) => {
      if (!buf || my !== ticket) return;
      // Re-check: something more important may have started while we loaded.
      if (current && !opts?.interrupt && current.priority > priority) return;
      if (current) {
        const old = current;
        current = null;
        try { old.src.stop(); } catch { /* already ended */ }
      }
      const c = getCtx();
      if (c.state !== 'running') void c.resume();
      const src = c.createBufferSource();
      src.buffer = buf;
      connect(c, src, LINES[lineId as LineId]?.speaker);
      const entry = { src, priority };
      current = entry;
      src.onended = () => {
        if (current === entry) {
          current = null;
          lastEnd = performance.now();
        }
      };
      src.start();
    });
  },

  isSpeaking() {
    return current !== null;
  },

  /** Seconds since the last line ended; 0 while one plays. */
  quietSeconds() {
    return current ? 0 : (performance.now() - lastEnd) / 1000;
  },

  setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (gain) gain.gain.value = volume;
  },

  preload(ids) {
    for (const id of ids) void load(id);
  },
};
