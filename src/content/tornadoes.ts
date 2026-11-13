/** Two winds: one hazard and one ride. Budgets stay fixed even after repeated calls. */
export const TORNADO = {
  fire: { speed: 2.5, reach: 2.25, damage: 2, hitEvery: 1, warn: 2.5, life: 45, chaseFor: 6, restFor: 5, spawnEvery: 120, maxDistance: 65 },
  blue: { speed: 7, boardReach: 5.5, clearance: 1.4, front: 1.8, recallEvery: 2, landingEvery: 0.75 },
} as const;

export interface WindSave { giftDay: number }
export const freshWind = (): WindSave => ({ giftDay: -1 });
export const normalWind = (raw: unknown): WindSave => {
  const day = (raw as Partial<WindSave> | null)?.giftDay;
  return { giftDay: typeof day === 'number' && Number.isInteger(day) && day >= -1 ? day : -1 };
};
