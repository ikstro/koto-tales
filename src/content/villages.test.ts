import { describe, expect, it } from 'vitest';
import type { BuildingId } from './buildings';
import { freshVillage, RACE_CARDS, villageTask, type VillageSave } from './villages';

const none = () => false;
const all = () => true;
const only = (...ids: BuildingId[]) => (id: BuildingId) => ids.includes(id);

describe('village tasks', () => {
  it('asks in the race order', () => {
    const v = freshVillage();
    expect(villageTask(RACE_CARDS.elves, v, all, 0)).toMatchObject({ kind: 'find', blocked: false });
    v.done = ['find'];
    expect(villageTask(RACE_CARDS.elves, v, all, 0)?.kind).toBe('gather');
    v.done = ['find', 'gather'];
    expect(villageTask(RACE_CARDS.elves, v, all, 0)?.kind).toBe('disco');
  });

  it('a task waiting for a building moves to the end, and comes back once it is there', () => {
    const v = freshVillage();
    // robots start with power: without a windmill they ask to gather first
    expect(villageTask(RACE_CARDS.robots, v, none, 0)?.kind).toBe('gather');
    v.done = ['gather', 'defend'];
    expect(villageTask(RACE_CARDS.robots, v, none, 0)).toMatchObject({ kind: 'power', blocked: true });
    expect(villageTask(RACE_CARDS.robots, v, only('windmill'), 0)).toMatchObject({ kind: 'power', blocked: false });
    // elves' disco takes the boombox
    expect(villageTask(RACE_CARDS.elves, { ...freshVillage(), done: ['find', 'gather'] }, only('boombox'), 0)?.blocked).toBe(false);
  });

  it('keeps the task under way even when an earlier one becomes possible', () => {
    const v: VillageSave = { ...freshVillage(), cur: 'gather', got: 3 };
    expect(villageTask(RACE_CARDS.robots, v, all, 0)?.kind).toBe('gather');
  });

  it('friends ask one small task a day', () => {
    const v: VillageSave = { ...freshVillage(), done: ['find', 'gather', 'disco'] };
    expect(villageTask(RACE_CARDS.elves, v, all, 4)).toMatchObject({ kind: 'gather', daily: true, goal: 4 });
    expect(villageTask(RACE_CARDS.elves, v, all, 5)?.kind).toBe('defend');
    v.daily = 5;
    expect(villageTask(RACE_CARDS.elves, v, all, 5)).toBeNull();
  });
});
