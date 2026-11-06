import { at, bell, bloop, brass, chirp, hiss, hz, mew, osc, pluck, purr, wah, whistle, type Bars, type Song } from './synth';

/**
 * The songs on Бабуся's later discs and the bird feeder's birdsong (DESIGN.md «Music»), all tunes of
 * our own, made in code; the order is the tail of SONG_IDS in content/music.ts:
 *   hopak  — a fast dance in A minor: stamping bass, bandura chords, a running tune, 150 a minute
 *   reggae — off-beat chords, a one-drop drum, a melodica; G–C–D–C, 80
 *   march  — snare rolls, a tuba, toy horns; C–G–F–G, 116
 *   space  — a slow arpeggio with a long echo over a pad, a saucer's whoop; 92
 *   funk   — a jumping bass, wah chords, a robot's beeps; E minor, 108
 *   blues  — twelve bars with a shuffle, a walking bass and bubbles; 88
 *   purr   — Пупся's purring for a bass, a soft paw beat and little mews; 96
 *   carol  — bells and sleigh bells over a drone, three beats a bar, D minor; 100
 *   granny — a warm tune whistled over a bandura; G major, 88
 *   birds  — birds in a garden over a soft hum, no drums; 72 (never on a disc: the feeder's own)
 */

/** Steps in a bar of four beats. */
const BAR = 16;

const HOPAK = {
  bass: [45, 40, 45, 40],
  chords: [
    [69, 72, 76],
    [68, 71, 74],
    [69, 72, 76],
    [68, 71, 76],
  ],
  tune: [
    [[0, 76], [2, 76], [4, 72], [6, 76], [8, 81], [10, 79], [12, 77], [14, 76]],
    [[0, 74], [2, 74], [4, 71], [6, 74], [8, 80], [10, 76], [12, 74], [14, 71]],
    [[0, 72], [2, 76], [4, 81], [6, 84], [8, 83], [10, 81], [12, 79], [14, 77]],
    [[0, 76], [2, 77], [4, 74], [6, 71], [8, 69], [12, 69]],
  ] as Bars,
};

const REGGAE = {
  roots: [43, 48, 50, 48],
  chords: [
    [67, 71, 74],
    [67, 72, 76],
    [66, 69, 74],
    [67, 72, 76],
  ],
  /** The bass's jump inside a bar, from the root. */
  bass: [[0, 0], [3, 0], [6, 7], [10, 5], [12, 7]] as [number, number][],
  tune: [
    [[0, 74], [4, 79], [6, 79], [8, 83], [12, 81]],
    [[0, 79], [4, 76], [8, 79], [10, 76], [12, 72]],
    [[0, 74], [4, 78], [6, 81], [8, 78], [12, 74]],
    [[0, 76], [4, 72], [8, 74], [12, 71]],
  ] as Bars,
};

const MARCH = {
  bass: [48, 43, 41, 43],
  tune: [
    [[0, 72], [3, 72], [4, 76], [8, 79], [11, 79], [12, 84]],
    [[0, 83], [3, 81], [4, 79], [8, 74], [11, 76], [12, 77]],
    [[0, 81], [3, 81], [4, 84], [8, 81], [11, 79], [12, 77]],
    [[0, 79], [3, 77], [4, 76], [6, 74], [8, 72], [12, 72]],
  ] as Bars,
};

const SPACE = {
  chords: [
    [57, 60, 64, 71],
    [53, 57, 60, 64],
    [48, 55, 59, 64],
    [55, 59, 62, 69],
  ],
};

const FUNK = {
  roots: [40, 40, 45, 43],
  bass: [[0, 0], [3, 0], [6, 12], [8, 0], [10, 10], [11, 12], [14, 7]] as [number, number][],
  stabs: [
    [64, 67, 71],
    [64, 67, 71],
    [64, 69, 72],
    [62, 67, 71],
  ],
  beeps: [
    [[0, 76], [2, 79], [8, 76], [10, 74]],
    [[4, 71], [6, 74], [8, 76], [12, 79]],
    [[0, 81], [2, 84], [8, 81], [10, 79]],
    [[0, 79], [4, 78], [6, 76], [8, 74], [12, 71]],
  ] as Bars,
};

/** Twelve bars: the roots of a blues, and the tune's two little riffs (moved up with the chord). */
const BLUES = {
  roots: [36, 36, 36, 36, 41, 41, 36, 36, 43, 41, 36, 43],
  walk: [0, 4, 7, 9],
  riffs: [
    [[0, 72], [4, 75], [6, 76], [8, 79], [12, 75]],
    [[0, 79], [4, 76], [8, 72]],
  ] as Bars,
};

const PURR = {
  chords: [
    [60, 64, 67],
    [57, 60, 64],
    [53, 57, 60],
    [55, 59, 62],
  ],
  mews: [
    [[4, 76], [12, 79]],
    [[4, 72], [12, 76]],
    [[4, 77], [10, 81], [12, 79]],
    [[4, 74], [8, 79], [12, 83]],
  ] as Bars,
};

/** Bars of three beats: twelve steps. */
const CAROL = {
  bass: [38, 38, 43, 38, 45, 38, 43, 38],
  chords: [
    [62, 65, 69],
    [62, 65, 69],
    [62, 67, 70],
    [62, 65, 69],
    [61, 64, 69],
    [62, 65, 69],
    [62, 67, 70],
    [62, 65, 69],
  ],
  tune: [
    [[0, 74], [4, 77], [8, 81]],
    [[0, 81], [4, 79], [8, 77]],
    [[0, 79], [4, 82], [8, 79]],
    [[0, 77], [8, 74]],
    [[0, 76], [4, 79], [8, 81]],
    [[0, 77], [4, 76], [8, 74]],
    [[0, 79], [4, 77], [8, 76]],
    [[0, 74]],
  ] as Bars,
};

const GRANNY = {
  bass: [43, 40, 48, 50, 43, 48, 50, 43],
  chords: [
    [55, 59, 62],
    [52, 55, 59],
    [55, 60, 64],
    [54, 57, 62],
    [55, 59, 62],
    [55, 60, 64],
    [54, 57, 62],
    [55, 59, 62],
  ],
  /** Which note of the chord on each eighth of the bar. */
  arp: [0, 1, 2, 1, 0, 1, 2, 1],
  tune: [
    [[0, 74], [4, 79], [6, 81], [8, 83], [12, 79]],
    [[0, 83], [2, 81], [4, 79], [8, 76], [12, 79]],
    [[0, 84], [4, 83], [6, 81], [8, 79], [12, 76]],
    [[0, 78], [4, 81], [8, 74]],
    [[0, 74], [4, 79], [6, 81], [8, 83], [12, 86]],
    [[0, 84], [2, 83], [4, 81], [8, 79], [12, 84]],
    [[0, 83], [4, 81], [6, 79], [8, 78], [12, 81]],
    [[0, 79], [8, 79]],
  ] as Bars,
};

const BIRDS = {
  pad: [
    [60, 64, 67],
    [57, 60, 65],
    [55, 59, 62],
    [60, 64, 67],
  ],
  /** Who sings when: [step in the bar, note]; a different bird on each register. */
  calls: [
    [[2, 91], [3, 93], [10, 88]],
    [[6, 96], [7, 96], [8, 96]],
    [[0, 86], [4, 91], [12, 93]],
    [[8, 88], [9, 91], [10, 93], [14, 96]],
  ] as Bars,
};

export const DISC_TUNES: Song[] = [
  // hopak
  {
    bpm: 150,
    gain: 0.85,
    step(c, out, step, t) {
      const bar = Math.floor(step / BAR) % 4;
      const s = step % BAR;
      // a stamp and the bass on the beats, the bandura's chord between, a tambourine on the eighths
      if (s % 8 === 0) {
        osc(c, out, t, 'sine', 120, 0.14, 0.7, 50);
        osc(c, out, t, 'triangle', hz(HOPAK.bass[bar]), 0.16, 0.32);
      }
      if (s % 8 === 4) {
        osc(c, out, t, 'triangle', hz(HOPAK.bass[bar] + 7), 0.13, 0.26);
        for (const n of HOPAK.chords[bar]) pluck(c, out, t, n, 0.16, 0.05);
      }
      if (s % 2 === 0) hiss(c, out, t, 'highpass', 6500, 0.04, 0.06);
      for (const n of at(HOPAK.tune, bar, s)) pluck(c, out, t, n, 0.2, 0.11);
    },
  },
  // reggae
  {
    bpm: 80,
    gain: 0.95,
    step(c, out, step, t) {
      const bar = Math.floor(step / BAR) % 4;
      const s = step % BAR;
      // the drum falls on the third beat, the chords on every off-beat, the bass jumps about
      if (s === 8) {
        osc(c, out, t, 'sine', 130, 0.2, 0.8, 44);
        hiss(c, out, t, 'bandpass', 2400, 0.06, 0.2);
      }
      if (s % 2 === 0) hiss(c, out, t, 'highpass', 8000, 0.03, 0.05);
      if (s % 4 === 2) for (const n of REGGAE.chords[bar]) osc(c, out, t, 'square', hz(n), 0.09, 0.024);
      for (const [k, off] of REGGAE.bass) if (k === s) osc(c, out, t, 'sine', hz(REGGAE.roots[bar] + off), 0.28, 0.42);
      for (const n of at(REGGAE.tune, bar, s)) whistle(c, out, t, n, 0.34, 0.06);
    },
  },
  // march
  {
    bpm: 116,
    gain: 0.9,
    step(c, out, step, t) {
      const bar = Math.floor(step / BAR) % 4;
      const s = step % BAR;
      // the big drum on one and three, the snare rolling up to the bar's end, the tuba, the horns
      if (s === 0 || s === 8) osc(c, out, t, 'sine', 110, 0.24, 0.8, 42);
      if (s % 4 === 2 || s >= 12) hiss(c, out, t, 'bandpass', 2600, 0.05, s >= 12 ? 0.14 : 0.2);
      if (s % 4 === 0) osc(c, out, t, 'triangle', hz(MARCH.bass[bar] - 12 + (s % 8 === 4 ? 7 : 0)), 0.22, 0.4);
      for (const n of at(MARCH.tune, bar, s)) {
        brass(c, out, t, n, 0.22, 0.09);
        brass(c, out, t, n - 12, 0.22, 0.05);
      }
    },
  },
  // space
  {
    bpm: 92,
    gain: 1.5,
    step(c, out, step, t) {
      const bar = Math.floor(step / BAR) % 4;
      const s = step % BAR;
      const beat = 60 / 92;
      // a pad held through the bar, the arpeggio with its long echo, a saucer's whoop at the end
      if (s === 0) for (const n of SPACE.chords[bar]) osc(c, out, t, 'triangle', hz(n), beat * 4, 0.035);
      if (s % 2 === 0) {
        const n = SPACE.chords[bar][(s / 2) % 4] + 24;
        bell(c, out, t, n, 0.5, 0.06);
        bell(c, out, t + beat * 0.75, n, 0.4, 0.02);
      }
      if (bar === 3 && s === 8) osc(c, out, t, 'sine', 300, beat * 2, 0.05, 1500);
      if (bar === 1 && s === 12) hiss(c, out, t, 'bandpass', 900, beat * 2, 0.04);
    },
  },
  // funk
  {
    bpm: 108,
    gain: 0.9,
    step(c, out, step, t) {
      const bar = Math.floor(step / BAR) % 4;
      const s = step % BAR;
      // kick and snare, hats on every step, a jumping square bass, wah chords, the robot's beeps
      if (s === 0 || s === 6 || s === 10) osc(c, out, t, 'sine', 140, 0.16, 0.85, 44);
      if (s === 4 || s === 12) hiss(c, out, t, 'bandpass', 2000, 0.12, 0.34);
      hiss(c, out, t, 'highpass', 8500, 0.025, s % 2 ? 0.03 : 0.05);
      for (const [k, off] of FUNK.bass) if (k === s) osc(c, out, t, 'square', hz(FUNK.roots[bar] + off), 0.13, 0.11);
      if (s === 2 || s === 10) wah(c, out, t, FUNK.stabs[bar], 0.24, 0.14);
      for (const n of at(FUNK.beeps, bar, s)) osc(c, out, t, 'square', hz(n + 12), 0.08, 0.03);
      if (bar === 3 && s === 14) {
        osc(c, out, t, 'square', hz(96), 0.05, 0.025);
        osc(c, out, t + 0.08, 'square', hz(100), 0.05, 0.025);
      }
    },
  },
  // blues
  {
    bpm: 88,
    gain: 0.95,
    loop: 192,
    step(c, out, step, t) {
      const bar = Math.floor(step / BAR) % 12;
      const s = step % BAR;
      const root = BLUES.roots[bar];
      // every second eighth comes a little late: the shuffle
      const late = s % 4 === 2 ? (60 / 88 / 4) * 0.36 : 0;
      if (s % 4 === 0) osc(c, out, t, 'triangle', hz(root + BLUES.walk[s / 4]), 0.3, 0.36);
      if (s % 8 === 4) hiss(c, out, t, 'bandpass', 1500, 0.1, 0.16);
      if (s % 2 === 0) hiss(c, out, t + late, 'highpass', 7000, 0.04, 0.05);
      if (s === 2 || s === 10) for (const n of [root + 28, root + 34]) osc(c, out, t + late, 'triangle', hz(n), 0.14, 0.05);
      // a riff in two bars of three, a bar of bubbles after it
      if (bar % 3 !== 2) for (const n of at(BLUES.riffs, bar % 3, s)) whistle(c, out, t + late, n + root - 36, 0.3, 0.07);
      else if (s >= 8 && s % 2 === 0) bloop(c, out, t, 72 + (s - 8) * 2, 0.08);
    },
  },
  // purr
  {
    bpm: 96,
    gain: 0.95,
    step(c, out, step, t) {
      const bar = Math.floor(step / BAR) % 4;
      const s = step % BAR;
      const beat = 60 / 96;
      // the purr for a bass, a soft paw beat, plucked chords, little mews on top
      if (s % 8 === 0) purr(c, out, t, beat * 2, 0.2);
      if (s === 0 || s === 8) osc(c, out, t, 'sine', 100, 0.14, 0.5, 46);
      if (s === 4 || s === 12) hiss(c, out, t, 'bandpass', 1200, 0.07, 0.12);
      if (s % 4 === 2) osc(c, out, t, 'sine', 620, 0.03, 0.05, 480);
      if (s % 8 === 2) for (const n of PURR.chords[bar]) pluck(c, out, t, n + 12, 0.2, 0.035);
      for (const n of at(PURR.mews, bar, s)) mew(c, out, t, n, 0.34, 0.2);
    },
  },
  // carol
  {
    bpm: 100,
    gain: 0.85,
    loop: 96,
    step(c, out, step, t) {
      const bar = Math.floor(step / 12) % 8;
      const s = step % 12;
      // a low drone, soft chords, sleigh bells on the beats, the tune rung on bells
      if (s === 0) osc(c, out, t, 'triangle', hz(CAROL.bass[bar]), 1.6, 0.26);
      if (s === 4 || s === 8) for (const n of CAROL.chords[bar]) osc(c, out, t, 'triangle', hz(n), 0.4, 0.028);
      if (s % 4 === 0) hiss(c, out, t, 'highpass', 9000, 0.09, 0.07);
      if (s % 4 === 2) hiss(c, out, t, 'highpass', 9500, 0.05, 0.035);
      for (const n of at(CAROL.tune, bar, s)) bell(c, out, t, n + 12, 0.95, 0.09);
    },
  },
  // granny
  {
    bpm: 88,
    gain: 0.95,
    loop: 128,
    step(c, out, step, t) {
      const bar = Math.floor(step / BAR) % 8;
      const s = step % BAR;
      // the bass on one and three, the bandura rolling up and down its chord, the tune whistled over it
      if (s === 0) osc(c, out, t, 'triangle', hz(GRANNY.bass[bar]), 0.6, 0.3);
      if (s === 8) osc(c, out, t, 'triangle', hz(GRANNY.bass[bar] + 7), 0.5, 0.22);
      if (s % 2 === 0) pluck(c, out, t, GRANNY.chords[bar][GRANNY.arp[s / 2]] + 12, 0.3, 0.06);
      for (const n of at(GRANNY.tune, bar, s)) {
        whistle(c, out, t, n, 0.46, 0.075);
        bell(c, out, t, n, 0.5, 0.025);
      }
    },
  },
  // birds
  {
    bpm: 72,
    gain: 1.7,
    step(c, out, step, t) {
      const bar = Math.floor(step / BAR) % 4;
      const s = step % BAR;
      if (s === 0) for (const n of BIRDS.pad[bar]) osc(c, out, t, 'triangle', hz(n), (60 / 72) * 4, 0.02);
      for (const n of at(BIRDS.calls, bar, s)) chirp(c, out, t, n, 0.08);
    },
  },
];
