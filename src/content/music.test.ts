import { describe, expect, it } from 'vitest';
import { BUILDINGS } from './buildings';
import { DISC_SONGS, DJ_FIRST_SONG, hear, loudness, nextSong, ownedSongs, SONG_IDS, songOf, type Speaker } from './music';

const at = (id: 'boombox' | 'bigspeaker' | 'djconsole', x: number, djSong = DJ_FIRST_SONG): Speaker => {
  const m = BUILDINGS[id].music!;
  return { x, z: 0, hear: m.hear, loud: m.loud, song: songOf(m.song, djSong) };
};
const heard = (speakers: Speaker[], x: number, current = -1) => {
  const h = hear(speakers, x, 0, current);
  return h.song < 0 ? null : SONG_IDS[h.song];
};

describe('music', () => {
  it('gives every kind of speaker its own song', () => {
    expect(SONG_IDS[at('boombox', 0).song]).toBe('disco');
    expect(SONG_IDS[at('bigspeaker', 0).song]).toBe('rock');
    expect(SONG_IDS[at('djconsole', 0).song]).toBe('happy');
    expect(SONG_IDS[at('djconsole', 0, 3).song]).toBe('lullaby');
  });

  it('makes the bigger speaker louder from the same distance', () => {
    const quiet = loudness(at('boombox', 6), 0, 0);
    const mid = loudness(at('djconsole', 6), 0, 0);
    const loud = loudness(at('bigspeaker', 6), 0, 0);
    expect(quiet).toBeGreaterThan(0);
    expect(mid).toBeGreaterThan(quiet);
    expect(loud).toBeGreaterThan(mid);
  });

  it('plays the song of the speaker the hero stands at, even beside a bigger one', () => {
    // the DJ console with the big speaker right beside it, as at a disco
    const disco = [at('bigspeaker', 0), at('djconsole', 2)];
    expect(heard(disco, 3)).toBe('happy');
    expect(heard(disco, -1)).toBe('rock');
    // further off the bigger one carries
    expect(heard(disco, 20)).toBe('rock');
    expect(heard(disco, -40)).toBeNull();
  });

  it('plays only the songs the party has: the four built in and every disc found', () => {
    const names = (found: string[]) => ownedSongs(found).map((i) => SONG_IDS[i]);
    expect(names([])).toEqual(['disco', 'rock', 'happy', 'lullaby']);
    expect(names(['apple', 'disc_waltz'])).toEqual(['disco', 'rock', 'happy', 'lullaby', 'waltz']);
    expect(names(Object.keys(DISC_SONGS))).toEqual(SONG_IDS.filter((s) => s !== 'birds'));
  });

  it('steps the note through the songs the party has, and round to the first', () => {
    const song = (s: string) => SONG_IDS.indexOf(s as (typeof SONG_IDS)[number]);
    expect(SONG_IDS[nextSong(song('disco'), [])]).toBe('rock');
    expect(SONG_IDS[nextSong(song('lullaby'), [])]).toBe('disco');
    expect(SONG_IDS[nextSong(song('lullaby'), ['disc_twist'])]).toBe('twist');
    expect(SONG_IDS[nextSong(song('twist'), ['disc_twist'])]).toBe('disco');
  });

  it('keeps the song heard until another is clearly stronger', () => {
    const two = [at('boombox', 0), at('djconsole', 10)];
    // about halfway the boombox (smaller) is a little weaker than the console
    expect(heard(two, 4.8)).toBe('happy');
    expect(heard(two, 4.8, SONG_IDS.indexOf('disco'))).toBe('disco');
    expect(heard(two, 8, SONG_IDS.indexOf('disco'))).toBe('happy');
  });
});
