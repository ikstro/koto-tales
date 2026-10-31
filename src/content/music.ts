/**
 * Which song is heard where (DESIGN.md «Music»): every kind of speaker plays its own song —
 * the boombox disco, the big speaker rock, the DJ console whatever the child picked — and the
 * bigger it is, the louder. Where several carry, one song is heard: the speaker the hero stands
 * at, and further off the one that sounds strongest (bigger and closer).
 */

/** The songs, in the order voice/music.ts makes them. */
export const SONG_IDS = ['disco', 'rock', 'happy', 'lullaby'] as const;
export type SongId = (typeof SONG_IDS)[number];

/** A speaker card's song: one of the songs, or `dj` — the one the DJ console's note picked (`save.song`). */
export type SpeakerSong = SongId | 'dj';

/** The DJ console's song in a new game (the boombox already plays disco, the big speaker rock). */
export const DJ_FIRST_SONG = SONG_IDS.indexOf('happy');

/** The song a speaker plays, as an index into SONG_IDS. */
export function songOf(song: SpeakerSong, djSong: number): number {
  if (song !== 'dj') return SONG_IDS.indexOf(song);
  return ((djSong % SONG_IDS.length) + SONG_IDS.length) % SONG_IDS.length;
}

/** A speaker playing: where it stands, how far it carries, its song, how loud it is close by. */
export interface Speaker {
  x: number;
  z: number;
  hear: number;
  song: number;
  loud: number;
}

/** How loud one speaker is at (x, z): 0 out of earshot, up to its `loud` close by. */
export function loudness(sp: Speaker, x: number, z: number): number {
  const near = Math.min(1, Math.max(0, (sp.hear - Math.hypot(x - sp.x, z - sp.z)) / (sp.hear - 4)));
  return Math.pow(near, 1.3) * sp.loud;
}

/**
 * How strongly a speaker in earshot sounds against the others: its size over the distance squared,
 * so the one right next to the hero wins even beside a bigger one (the volume is `loudness`).
 */
function pull(sp: Speaker, x: number, z: number): number {
  if (loudness(sp, x, z) <= 0) return 0;
  const d = Math.max(0.75, Math.hypot(x - sp.x, z - sp.z));
  return sp.loud / (d * d);
}

/** The heard song keeps playing until another sounds clearly stronger (no flicker between two). */
const SWITCH = 1.15;

/**
 * The song heard at (x, z) and how loud (`song` -1: none carries this far). `current` is the song
 * heard until now: it keeps playing while it is nearly as strong as the strongest.
 */
export function hear(speakers: readonly Speaker[], x: number, z: number, current = -1): { song: number; level: number } {
  const pulls = SONG_IDS.map(() => 0);
  const levels = SONG_IDS.map(() => 0);
  for (const sp of speakers) {
    pulls[sp.song] = Math.max(pulls[sp.song], pull(sp, x, z));
    levels[sp.song] = Math.max(levels[sp.song], loudness(sp, x, z));
  }
  let song = -1;
  for (let i = 0; i < pulls.length; i++) if (pulls[i] > 0 && (song < 0 || pulls[i] > pulls[song])) song = i;
  if (song >= 0 && current >= 0 && pulls[current] * SWITCH >= pulls[song]) song = current;
  return { song, level: song < 0 ? 0 : levels[song] };
}
