import { SONG_IDS } from '../content/music';
import { getCtx, getMaster } from './audio';
import { DISC_TUNES } from './discTunes';
import { at, bell, chug, hiss, hz, osc, whistle, type Bars, type Song } from './synth';

/**
 * The speakers' music, made in code on the shared AudioContext (no files, so it plays
 * offline). The little songs (DESIGN.md «Music»; the order is SONG_IDS in content/music.ts; the
 * later discs' tunes are in discTunes.ts):
 *   0 disco   — kick, clap, hats, octave bass, chord stabs, a bell tune; C–G–Am–F, 120 a minute
 *   1 rock    — kick and snare, chugging power chords, a square-wave riff; A–D–E–D, 132
 *   2 happy   — oom-pah bass, plucked chords, a whistled tune, shaker and woodblock; C–F–G–C, 108
 *   3 lullaby — a music box over a soft pad, no drums; F–C–Dm–Bb, 72
 * Every kind of speaker plays its own song; one is heard where the hero stands (walking from one
 * speaker to another, one fades out as the other comes in). It gets louder
 * as the hero comes closer and dips under the voice. Notes are scheduled a little ahead on the
 * audio clock, so a slow frame never makes the beat stumble; a song out of earshot schedules
 * nothing at all.
 */

const LOOP = 64;
const AHEAD = 0.2;

const DISCO = {
  bass: [36, 43, 45, 41],
  chords: [
    [60, 64, 67],
    [59, 62, 67],
    [57, 60, 64],
    [57, 60, 65],
  ],
  tune: [
    [[0, 72], [3, 76], [6, 79], [8, 76], [10, 74], [12, 72], [14, 74]],
    [[0, 74], [3, 79], [6, 81], [8, 79], [10, 76], [12, 74]],
    [[0, 76], [3, 81], [6, 84], [8, 81], [10, 79], [12, 76]],
    [[0, 77], [3, 81], [6, 84], [8, 81], [10, 79], [12, 77], [14, 76]],
  ] as Bars,
};

const ROCK = {
  roots: [45, 50, 52, 50],
  riff: [
    [[0, 69], [2, 72], [4, 74], [6, 72], [8, 76], [11, 74], [12, 72]],
    [[0, 74], [2, 76], [4, 78], [6, 76], [8, 74], [12, 72]],
    [[0, 76], [2, 79], [4, 81], [6, 79], [8, 76], [10, 74], [12, 76]],
    [[0, 74], [3, 72], [6, 69], [8, 72], [12, 74], [14, 76]],
  ] as Bars,
};

const HAPPY = {
  bass: [48, 53, 55, 48],
  chords: [
    [64, 67, 72],
    [65, 69, 72],
    [62, 67, 71],
    [64, 67, 72],
  ],
  tune: [
    [[0, 76], [2, 79], [4, 84], [8, 79], [10, 76], [12, 79]],
    [[0, 77], [2, 81], [4, 84], [8, 81], [12, 77], [14, 81]],
    [[0, 79], [2, 83], [4, 86], [6, 83], [8, 79], [12, 74]],
    [[0, 76], [4, 72], [6, 74], [8, 76], [12, 72]],
  ] as Bars,
};

const LULLABY = {
  pad: [
    [53, 57, 60],
    [48, 52, 55],
    [50, 53, 57],
    [46, 50, 53],
  ],
  box: [
    [[0, 77], [4, 81], [8, 84], [12, 81]],
    [[0, 79], [4, 76], [8, 72], [12, 76]],
    [[0, 74], [4, 77], [8, 81], [12, 77]],
    [[0, 74], [4, 77], [8, 82], [10, 81], [12, 77]],
  ] as Bars,
};

// Бабуся's discs: three more little songs made here, all their own tunes
const POLKA = {
  bass: [36, 43, 41, 43],
  chords: [
    [60, 64, 67],
    [59, 62, 67],
    [60, 65, 69],
    [59, 62, 67],
  ],
  tune: [
    [[0, 72], [2, 76], [4, 79], [6, 76], [8, 74], [10, 77], [12, 81], [14, 77]],
    [[0, 74], [2, 79], [4, 83], [6, 79], [8, 74], [12, 71]],
    [[0, 77], [2, 81], [4, 84], [6, 81], [8, 79], [10, 76], [12, 74], [14, 76]],
    [[0, 74], [2, 77], [4, 79], [6, 77], [8, 72], [12, 72]],
  ] as Bars,
};

/** Bars of three beats: twelve steps. */
const WALTZ = {
  bass: [41, 36, 38, 34],
  chords: [
    [60, 65, 69],
    [60, 64, 67],
    [62, 65, 69],
    [58, 62, 65],
  ],
  tune: [
    [[0, 77], [4, 81], [8, 84]],
    [[0, 84], [4, 79], [8, 76]],
    [[0, 81], [4, 77], [6, 79], [8, 81]],
    [[0, 82], [4, 81], [8, 77]],
  ] as Bars,
};

const TWIST = {
  roots: [36, 36, 41, 43],
  /** The bass walks up and down the chord, a step every eighth. */
  walk: [0, 4, 7, 9, 10, 9, 7, 4],
  tune: [
    [[0, 72], [3, 75], [4, 76], [8, 79], [10, 76], [12, 72]],
    [[0, 72], [3, 75], [4, 76], [8, 79], [10, 81], [12, 79]],
    [[0, 77], [3, 80], [4, 81], [8, 84], [10, 81], [12, 77]],
    [[0, 79], [3, 82], [4, 83], [8, 86], [10, 83], [14, 79]],
  ] as Bars,
};

/** The songs, in the order the DJ console steps through them. */
export const SONGS: Song[] = [
  // disco
  {
    bpm: 120,
    gain: 1,
    step(c, out, step, t) {
      const bar = Math.floor(step / 16) % 4;
      const s = step % 16;
      // drums: four on the floor, clap on 2 and 4, hats on every 8th, an open hat off the beat
      if (s % 4 === 0) osc(c, out, t, 'sine', 150, 0.2, 0.9, 42);
      if (s === 4 || s === 12) {
        hiss(c, out, t, 'bandpass', 1600, 0.13, 0.32);
        osc(c, out, t, 'triangle', 220, 0.06, 0.12, 140);
      }
      if (s % 2 === 0) hiss(c, out, t, 'highpass', 7500, s % 4 === 2 ? 0.11 : 0.04, s % 4 === 2 ? 0.09 : 0.06);
      // octave bass on every 8th, chord stabs off the beat, the bell tune on top
      if (s % 2 === 0) osc(c, out, t, 'triangle', hz(DISCO.bass[bar] + (s % 4 === 2 ? 12 : 0)), 0.12, 0.3);
      if (s % 4 === 2) for (const n of DISCO.chords[bar]) osc(c, out, t, 'triangle', hz(n), 0.16, 0.035);
      for (const n of at(DISCO.tune, bar, s)) bell(c, out, t, n, 0.35, 0.09);
    },
  },
  // rock
  {
    bpm: 132,
    gain: 0.9,
    step(c, out, step, t) {
      const bar = Math.floor(step / 16) % 4;
      const s = step % 16;
      // kick on 1 and 3 (and a push before 3), snare on 2 and 4, closed hats on 8ths
      if (s === 0 || s === 6 || s === 8) osc(c, out, t, 'sine', 140, 0.22, 0.9, 40);
      if (s === 4 || s === 12) {
        hiss(c, out, t, 'bandpass', 2200, 0.16, 0.4);
        osc(c, out, t, 'triangle', 190, 0.08, 0.2, 120);
      }
      if (s % 2 === 0) hiss(c, out, t, 'highpass', 8000, 0.04, 0.07);
      // power chords chugging on 8ths, a square-wave riff over them
      if (s % 2 === 0) chug(c, out, t, ROCK.roots[bar], 0.13, s % 4 === 0 ? 0.075 : 0.05);
      for (const n of at(ROCK.riff, bar, s)) osc(c, out, t, 'square', hz(n), 0.16, 0.035);
    },
  },
  // happy
  {
    bpm: 108,
    gain: 0.95,
    step(c, out, step, t) {
      const bar = Math.floor(step / 16) % 4;
      const s = step % 16;
      // oom-pah: root and fifth on the beats, plucked chords between
      if (s % 8 === 0) osc(c, out, t, 'triangle', hz(HAPPY.bass[bar]), 0.22, 0.34);
      if (s % 8 === 4) osc(c, out, t, 'triangle', hz(HAPPY.bass[bar] + 7), 0.18, 0.26);
      if (s % 4 === 2) for (const n of HAPPY.chords[bar]) osc(c, out, t, 'triangle', hz(n), 0.1, 0.04);
      // shaker on 8ths, a woodblock on the off-beats, the whistled tune
      if (s % 2 === 0) hiss(c, out, t, 'highpass', 6000, 0.05, 0.05);
      if (s % 4 === 2) osc(c, out, t, 'sine', 880, 0.04, 0.08, 700);
      for (const n of at(HAPPY.tune, bar, s)) whistle(c, out, t, n, 0.3, 0.08);
    },
  },
  // lullaby
  {
    bpm: 72,
    gain: 0.85,
    step(c, out, step, t) {
      const bar = Math.floor(step / 16) % 4;
      const s = step % 16;
      // a soft pad held through the bar, the music box ringing over it with a quiet echo
      if (s === 0) for (const n of LULLABY.pad[bar]) osc(c, out, t, 'triangle', hz(n), (60 / 72) * 4, 0.03);
      for (const n of at(LULLABY.box, bar, s)) {
        bell(c, out, t, n, 1.4, 0.08);
        bell(c, out, t + (60 / 72) * 0.75, n + 12, 0.8, 0.02);
      }
    },
  },
  // polka
  {
    bpm: 126,
    gain: 0.9,
    step(c, out, step, t) {
      const bar = Math.floor(step / 16) % 4;
      const s = step % 16;
      // oom-pah at a run: bass on the beat, the squeezebox chord right after it
      if (s % 4 === 0) osc(c, out, t, 'triangle', hz(POLKA.bass[bar] + (s % 8 === 4 ? 7 : 0)), 0.14, 0.34);
      if (s % 4 === 2) for (const n of POLKA.chords[bar]) osc(c, out, t, 'square', hz(n), 0.08, 0.022);
      if (s % 8 === 2) hiss(c, out, t, 'bandpass', 3000, 0.05, 0.1);
      for (const n of at(POLKA.tune, bar, s)) {
        osc(c, out, t, 'square', hz(n), 0.13, 0.04);
        osc(c, out, t, 'sawtooth', hz(n + 12), 0.1, 0.012);
      }
    },
  },
  // waltz
  {
    bpm: 112,
    gain: 0.9,
    loop: 48,
    step(c, out, step, t) {
      const bar = Math.floor(step / 12) % 4;
      const s = step % 12;
      // one on the bass, two and three on the strings, the tune sung by a bell and a whistle
      if (s === 0) osc(c, out, t, 'triangle', hz(WALTZ.bass[bar]), 0.5, 0.34);
      if (s === 4 || s === 8) for (const n of WALTZ.chords[bar]) osc(c, out, t, 'triangle', hz(n), 0.26, 0.04);
      for (const n of at(WALTZ.tune, bar, s)) {
        bell(c, out, t, n, 0.7, 0.07);
        whistle(c, out, t, n, 0.42, 0.03);
      }
    },
  },
  // twist
  {
    bpm: 152,
    gain: 0.9,
    step(c, out, step, t) {
      const bar = Math.floor(step / 16) % 4;
      const s = step % 16;
      // kick and clap, a bass walking on the eighths, a bright horn on top
      if (s % 8 === 0) osc(c, out, t, 'sine', 150, 0.18, 0.8, 44);
      if (s === 4 || s === 12) hiss(c, out, t, 'bandpass', 1800, 0.1, 0.3);
      if (s % 2 === 0) {
        hiss(c, out, t, 'highpass', 7000, 0.03, 0.05);
        osc(c, out, t, 'triangle', hz(TWIST.roots[bar] + TWIST.walk[s / 2]), 0.13, 0.32);
      }
      for (const n of at(TWIST.tune, bar, s)) osc(c, out, t, 'square', hz(n), 0.14, 0.04);
    },
  },
  ...DISC_TUNES,
];

/** One song's player: its own clock and gain, so one song can fade out while another comes in. */
class Player {
  private out: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  start = 0;
  private next = 0;
  private quietFor = 0;

  constructor(readonly song: number) {}

  get playing(): boolean {
    return this.timer !== null;
  }

  /** Every frame: how loud it should be now (0 = fading out; after 2 s of quiet it stops). */
  update(dt: number, target: number): void {
    if (target > 0) {
      this.quietFor = 0;
      if (!this.timer) this.begin();
    } else if (this.timer && (this.quietFor += dt) > 2) this.stop();
    if (!this.out) return;
    try {
      this.out.gain.setTargetAtTime(target * SONGS[this.song].gain, getCtx().currentTime, 0.25);
    } catch {
      /* audio unavailable: stay silent */
    }
  }

  /** Seconds per 16th step. */
  private get stepLen(): number {
    return 60 / SONGS[this.song].bpm / 4;
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
    const step = this.stepLen;
    if (this.start + this.next * step < now - 0.1) this.next = Math.ceil((now - this.start) / step);
    while (this.start + this.next * step < now + AHEAD) {
      SONGS[this.song].step(c, this.out, this.next % (SONGS[this.song].loop ?? LOOP), this.start + this.next * step);
      this.next++;
    }
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.quietFor = 0;
  }
}

class Music {
  private players = SONGS.map((_, i) => new Player(i));
  private volume = 1;
  private heard = 0;
  private show = false;

  /** The sound switch (pause menu). */
  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
  }

  /** The night show (DESIGN.md «Signal»): while it is on, every speaker plays disco. */
  setShow(on: boolean): void {
    this.show = on;
  }

  /** One sound right now, on top of the song (a drum hit, a piano key, the karaoke's voices). */
  play(make: (c: AudioContext, out: AudioNode, t: number) => void): void {
    if (this.volume <= 0) return;
    try {
      const c = getCtx();
      if (c.state !== 'running') return;
      make(c, getMaster(), c.currentTime + 0.01);
    } catch {
      /* audio unavailable: stay silent */
    }
  }

  /** The song heard where the hero stands (the last one, when none carries this far). */
  get songHeard(): number {
    return this.heard;
  }

  /**
   * Every frame: the song heard where the hero stands and how loud (content/music.ts `hear`:
   * -1 / 0 = out of earshot; a big speaker close by goes past 1) and whether a voice line is
   * playing (the music dips under it). The other songs fade out.
   */
  update(dt: number, song: number, level: number, voiceOn: boolean): void {
    level = song < 0 ? 0 : Math.min(1.4, level);
    if (this.show && level > 0) song = SONG_IDS.indexOf('disco');
    if (song >= 0 && level > 0) this.heard = song;
    const target = this.volume * level * (voiceOn ? 0.4 : 1) * 0.55;
    for (const p of this.players) p.update(dt, p.song === song ? target : 0);
  }

  /** Music time in beats of the song heard; without sound it keeps time by the clock, so the dancing still swings. */
  beat(): number {
    const bps = SONGS[this.heard].bpm / 60;
    const p = this.players[this.heard];
    if (p.playing) {
      try {
        return Math.max(0, (getCtx().currentTime - p.start) * bps);
      } catch {
        /* fall through */
      }
    }
    return (performance.now() / 1000) * bps;
  }
}

export const music = new Music();
