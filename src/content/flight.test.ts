import { describe, expect, it } from 'vitest';
import { bounceAt, cloudsAt, dawnAt, FLIGHT, liftAt, phaseAt, seenAt, squashAt, swayAt, swirlAt, lagAt, zoomAt } from './flight';

describe('the house flight', () => {
  it('rises, flies level, comes down and bounces to rest', () => {
    expect(liftAt(0)).toBe(0);
    expect(liftAt(FLIGHT.lift)).toBe(0);
    expect(liftAt((FLIGHT.lift + FLIGHT.cruise) / 2)).toBeCloseTo(FLIGHT.height / 2, 5);
    expect(liftAt(FLIGHT.cruise)).toBe(FLIGHT.height);
    expect(liftAt(FLIGHT.teleport)).toBe(FLIGHT.height);
    expect(liftAt(FLIGHT.descend)).toBe(FLIGHT.height);
    expect(liftAt(FLIGHT.touch)).toBe(0);
    expect(liftAt(FLIGHT.touch + 0.17)).toBeGreaterThan(0.1);
    expect(liftAt(FLIGHT.dock)).toBe(0);
    for (let t = 0; t < FLIGHT.dock; t += 0.05) expect(liftAt(t)).toBeGreaterThanOrEqual(0);
  });

  it('names its phases in order', () => {
    expect(phaseAt(0)).toBe('settle');
    expect(phaseAt(FLIGHT.settle)).toBe('lift');
    expect(phaseAt(FLIGHT.cruise)).toBe('glide');
    expect(phaseAt(FLIGHT.descend)).toBe('descend');
    expect(phaseAt(FLIGHT.touch)).toBe('touch');
    expect(phaseAt(FLIGHT.dock)).toBe('done');
  });

  it('covers the world with clouds while it moves underneath', () => {
    expect(cloudsAt(0)).toBe(0);
    expect(cloudsAt(FLIGHT.cloudsIn[1])).toBe(1);
    expect(cloudsAt(FLIGHT.teleport)).toBe(1);
    expect(cloudsAt(FLIGHT.cloudsOut[0])).toBe(1);
    expect(cloudsAt(FLIGHT.cloudsOut[1])).toBe(0);
    expect(cloudsAt(FLIGHT.dock)).toBe(0);
    // the house is still above the layer while the clouds are thick
    expect(liftAt(FLIGHT.cloudsOut[0] + 0.5)).toBeGreaterThan(FLIGHT.height - FLIGHT.cloudBelow);
  });

  it('sways only in the air and brings the dawn down with it', () => {
    expect(swayAt(1, 0)).toEqual([0, 0]);
    expect(Math.hypot(...swayAt(5, FLIGHT.height))).toBeGreaterThan(0);
    expect(dawnAt(FLIGHT.descend - 0.1)).toBeNull();
    expect(dawnAt(FLIGHT.descend)).toBe(FLIGHT.dawnFrom);
    expect(dawnAt(FLIGHT.dock)).toBeCloseTo(FLIGHT.dawnTo, 6);
    expect(swirlAt(0)).toBe(0);
    expect(swirlAt(FLIGHT.lift)).toBe(1);
    expect(swirlAt(FLIGHT.teleport)).toBe(0);
    expect(swirlAt(FLIGHT.touch)).toBeGreaterThan(0.5);
    expect(swirlAt(FLIGHT.dock)).toBe(0);
    for (let t = 0; t < FLIGHT.dock + 1; t += 0.05) {
      expect(swirlAt(t)).toBeGreaterThanOrEqual(0);
      expect(swirlAt(t)).toBeLessThanOrEqual(1);
    }
    expect(bounceAt(0)).toBe(0);
    expect(squashAt(0)).toBeCloseTo(0.11, 5);
    expect(squashAt(1)).toBe(0);
  });

  it('seen from the yard: lifts, drifts away, fades and is gone', () => {
    const start = seenAt(FLIGHT.seenLift);
    expect(start.lift).toBe(0);
    expect(start.opacity).toBe(1);
    expect(start.gone).toBe(false);
    const mid = seenAt((FLIGHT.seenLift + FLIGHT.seenGone) / 2);
    expect(mid.lift).toBeGreaterThan(3);
    expect(mid.away).toBeGreaterThan(0);
    expect(mid.opacity).toBe(1);
    const end = seenAt(FLIGHT.seenGone);
    expect(end.lift).toBeCloseTo(FLIGHT.seenHeight, 3);
    expect(start.size).toBe(1);
    expect(end.size).toBeCloseTo(1 - FLIGHT.seenShrink, 5);
    expect(seenAt(0).look).toBe(0);
    expect(start.look).toBeGreaterThan(0);
    expect(end.look).toBe(1);
    expect(end.opacity).toBe(0);
    expect(end.gone).toBe(true);
    expect(seenAt(FLIGHT.seenSwirl + 0.4).swirl).toBeGreaterThan(0);
    expect(seenAt(FLIGHT.seenLift).swirl).toBe(1);
    expect(seenAt(FLIGHT.seenGone).swirl).toBe(0);
  });

  it('pulls the camera back for the flight and gives it back at the end', () => {
    expect(zoomAt(0)).toBe(FLIGHT.zoomBed);
    expect(zoomAt(FLIGHT.teleport)).toBe(FLIGHT.zoomSky);
    expect(zoomAt(FLIGHT.touch)).toBe(FLIGHT.zoomBed);
    expect(zoomAt(FLIGHT.dock)).toBe(1);
    expect(FLIGHT.zoomSky).toBeGreaterThan(FLIGHT.zoomBed);
  });

  it('lets the house run ahead of the view on the way up and down, and none at rest', () => {
    expect(lagAt(0)).toBe(0);
    expect(lagAt((FLIGHT.lift + FLIGHT.cruise) / 2)).toBeCloseTo(-FLIGHT.lag, 5);
    expect(lagAt(FLIGHT.teleport)).toBe(0);
    expect(lagAt((FLIGHT.descend + FLIGHT.touch) / 2)).toBeGreaterThan(0);
    expect(lagAt(FLIGHT.touch)).toBe(0);
  });
});
