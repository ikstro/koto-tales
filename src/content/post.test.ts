import { describe, expect, it } from 'vitest';
import { nextReward } from './progress';
import {
  MAIL,
  freshPost,
  inParcels,
  isParcelReward,
  letterDue,
  letterWay,
  nextToOpen,
  openThing,
  parcelReward,
  staleLetters,
  upgradesInParcels,
  type PostThing,
} from './post';
import { REWARDS } from './progress';

describe('where a letter goes', () => {
  it('near home it flies into the postbox, portal or not', () => {
    expect(letterWay(5, false)).toBe('postbox');
    expect(letterWay(MAIL.homeNear, true)).toBe('postbox');
  });
  it('far away with the portal it waits at home', () => {
    expect(letterWay(MAIL.homeNear + 1, true)).toBe('box');
    expect(letterWay(400, true)).toBe('box');
  });
  it('far away without the portal it flies to the hero as always', () => {
    expect(letterWay(MAIL.homeNear + 1, false)).toBe('hero');
  });
});

describe('a waiting letter', () => {
  it('finds the party the next morning or after five minutes', () => {
    expect(letterDue({ day: 3 }, 3, 10)).toBe(false);
    expect(letterDue({ day: 3 }, 3, MAIL.waitSeconds)).toBe(true);
    expect(letterDue({ day: 3 }, 4, 0)).toBe(true);
  });
  it('is dropped once its tale is done or under way', () => {
    const box: PostThing[] = [
      { kind: 'letter', tale: 'a', day: 1 },
      { kind: 'letter', tale: 'b', day: 1 },
      { kind: 'letter', tale: 'c', day: 1 },
      { kind: 'gift', from: 'elves', coins: 5, day: 1 },
    ];
    expect(staleLetters(box, ['a'], 'b').map((t) => (t.kind === 'letter' ? t.tale : t.kind))).toEqual(['c', 'gift']);
  });
});

describe('opening the postbox', () => {
  const box: PostThing[] = [
    { kind: 'letter', tale: 'later', day: 1 },
    { kind: 'parcel', reward: { id: '+pole', line: 'reward_poles', items: [['pole', 2]] }, day: 2 },
    { kind: 'gift', from: 'gnomes', item: 'apple', day: 3 },
  ];
  it('takes the oldest thing first', () => {
    expect(nextToOpen(box, () => true)).toBe(0);
  });
  it('skips a letter that cannot begin now (another tale under way)', () => {
    expect(nextToOpen(box, () => false)).toBe(1);
    expect(nextToOpen([box[0]], () => false)).toBe(-1);
    expect(nextToOpen(freshPost().box, () => true)).toBe(-1);
  });
  it('gives what each thing holds', () => {
    expect(openThing(box[0])).toEqual({ kind: 'letter', tale: 'later' });
    expect(openThing(box[1])).toMatchObject({ kind: 'parcel', reward: { id: '+pole' } });
    expect(openThing(box[2])).toEqual({ kind: 'gift', from: 'gnomes', coins: 0, item: 'apple' });
    expect(openThing({ kind: 'gift', from: 'olia', coins: 6, day: 1 })).toEqual({ kind: 'gift', from: 'olia', coins: 6, item: null });
  });
  it('an empty gift or an odd parcel gives nothing and breaks nothing', () => {
    expect(openThing({ kind: 'gift', from: 'elves', day: 1 })).toEqual({ kind: 'nothing' });
    expect(openThing({ kind: 'parcel', reward: null, day: 1 })).toEqual({ kind: 'nothing' });
    expect(openThing({ kind: 'parcel', reward: { id: 3 }, day: 1 })).toEqual({ kind: 'nothing' });
  });
});

describe('parcels', () => {
  it('only the endless rewards come as parcels', () => {
    for (const r of REWARDS) expect(isParcelReward(r)).toBe(false);
    const all = REWARDS.map((r) => r.id);
    const endless = nextReward(all, () => 0, () => 0);
    expect(isParcelReward(endless)).toBe(true);
    expect(isParcelReward({ id: '+coins' })).toBe(true);
    expect(isParcelReward({ id: '+lvl:generator' })).toBe(true);
  });
  it('what waits in parcels still counts, so the box keeps its caps', () => {
    const box: PostThing[] = [
      { kind: 'parcel', reward: { id: '+pole', line: 'reward_poles', items: [['pole', 2]] }, day: 1 },
      { kind: 'parcel', reward: { id: '+pole', line: 'reward_poles', items: [['pole', 2]] }, day: 2 },
      { kind: 'parcel', reward: { id: '+lvl:generator', line: 'up_generator', upgrade: 'generator' }, day: 2 },
      { kind: 'letter', tale: 'x', day: 2 },
    ];
    expect(inParcels(box, 'pole')).toBe(4);
    expect(inParcels(box, 'lamp')).toBe(0);
    expect(upgradesInParcels(box, 'generator')).toBe(1);
    expect(parcelReward(box[3])).toBeNull();
  });
});
