/** Two winds: one hazard and one ride. Budgets stay fixed even after repeated calls. */
export const TORNADO = {
  fire: { speed: 2.5, reach: 2.25, damage: 2, hitEvery: 1, warn: 2.5, life: 45, chaseFor: 6, restFor: 5, monsterSight: 16, monsterSpeed: 3.6, spawnMin: 70, spawnMax: 160, maxDistance: 65 },
  blue: { speed: 15, boardReach: 5.5, clearance: 9, front: 1.8, recallEvery: 2, range: 300, reserve: 37.5, recharge: 30, liftSpeed: 12 },
} as const;

export const nextFireDelay = (): number => TORNADO.fire.spawnMin + Math.random() * (TORNADO.fire.spawnMax - TORNADO.fire.spawnMin);
export interface WindSave { giftDay: number; fuel: number; fireIn: number | null }
export const freshWind = (): WindSave => ({ giftDay: -1, fuel: TORNADO.blue.range, fireIn: null });
export const normalWind = (raw: unknown): WindSave => {
  const {giftDay:day, fuel, fireIn} = (raw ?? {}) as Partial<WindSave>;
  return { giftDay: typeof day === 'number' && Number.isInteger(day) && day >= -1 ? day : -1,
    fuel: typeof fuel === 'number' && Number.isFinite(fuel) ? Math.max(0, Math.min(TORNADO.blue.range, fuel)) : TORNADO.blue.range,
    fireIn: typeof fireIn === 'number' && Number.isFinite(fireIn) ? Math.max(0,Math.min(TORNADO.fire.spawnMax,fireIn)) : null };
};
