import { describe, expect, it } from 'vitest';
import type { IWorld } from '../contracts';
import { jump, makeBody, placeOnGround, stepBody } from './physics';

/** Flat ground at y = 10 with a pit at x = 0, z = 0 `depth` blocks deep. */
function pitWorld(depth: number): IWorld {
  const ground = (x: number, z: number) => (x === 0 && z === 0 ? 10 - depth : 10);
  return {
    isSolid: (x: number, y: number, z: number) => y < ground(x, z),
    isWater: () => false,
    groundHeight: (x: number, z: number) => ground(x, z),
  } as unknown as IWorld;
}

/** A hero in the pit pushes east for two seconds, tapping jump when asked; returns where they end up. */
function climb(depth: number, tap: boolean) {
  const world = pitWorld(depth);
  const b = makeBody(0.3, 1.6);
  placeOnGround(world, b, 0.5, 0.5);
  for (let i = 0; i < 120; i++) {
    b.vel.x = 3;
    b.vel.z = 0;
    if (tap && i % 20 === 0) jump(b);
    stepBody(world, b, 1 / 60);
  }
  return b.pos;
}

describe('jump', () => {
  it('a one-block pit needs no jump', () => {
    expect(climb(1, false).x).toBeGreaterThan(1.5);
  });

  it('a two-block pit holds a walker, the jump gets them out', () => {
    expect(climb(2, false).x).toBeLessThan(1);
    const out = climb(2, true);
    expect(out.x).toBeGreaterThan(1.5);
    expect(out.y).toBeGreaterThan(9.99);
  });

  it('three blocks are too high', () => {
    expect(climb(3, true).x).toBeLessThan(1);
  });

  it('never in the air', () => {
    const b = makeBody(0.3, 1.6);
    b.onGround = false;
    expect(jump(b)).toBe(false);
  });
});
