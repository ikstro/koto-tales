import * as THREE from 'three';
import type { ItemId } from '../contracts';
import { ARTIFACTS } from '../content/artifacts';
import { EFFECTS, EffectTimers, resolve, type Effect, type EffectKind } from '../content/effects';
import { HERO_STATS } from '../content/heroes';
import { ITEMS, ITEM_ORDER, type ItemCard } from '../content/items';
import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { sfx } from '../voice/sfx';
import { homeGate, travelTo } from './travel';

/**
 * Effects (content/effects.ts) on the existing code paths: timed ones started by using an item
 * (the kit plate's second row), lasting ones kept on by the artifacts the party has. The
 * monsters, heroes and spawning ask here (`peaceAt`, `lightAt`, `healsFast`); freeze and fast
 * write the monsters' `frozen` and the party's `ctx.fast` themselves.
 */

const timers = new EffectTimers();
const tmp = new THREE.Vector3();

/** The effects the party's artifacts keep on (resolved, `home` never). */
export function lasting(ctx: Ctx): Required<Effect>[] {
  return (ctx.save.artifacts ?? []).flatMap((id) => {
    const a = ARTIFACTS[id];
    return a && EFFECTS[a.always.kind].always ? [resolve(a.always)] : [];
  });
}

const lastingReach = (ctx: Ctx, kind: EffectKind): number | null =>
  lasting(ctx).reduce<number | null>((m, e) => (e.kind === kind && (m === null || e.reach > m) ? e.reach : m), null);

const near = (ctx: Ctx, x: number, z: number, reach: number | null) =>
  reach !== null && Math.hypot(x - ctx.player.pos.x, z - ctx.player.pos.z) < reach;

/** Monsters here dance and do not bite (a peace effect around the party). */
export function peaceAt(ctx: Ctx, x: number, z: number): boolean {
  return near(ctx, x, z, timers.reach('peace')) || near(ctx, x, z, lastingReach(ctx, 'peace'));
}

/** No monster appears here (a light effect around the party; a lasting one only at night). */
export function lightAt(ctx: Ctx, x: number, z: number, night: boolean): boolean {
  return near(ctx, x, z, timers.reach('light')) || (night && near(ctx, x, z, lastingReach(ctx, 'light')));
}

/** Hearts come back fast everywhere (a lasting heal). */
export function healsFast(ctx: Ctx): boolean {
  return lastingReach(ctx, 'heal') !== null;
}

/** Starts an effect at the party now. */
export function startEffect(ctx: Ctx, e: Effect): void {
  const r = resolve(e);
  const at = tmp.copy(ctx.player.pos).setY(ctx.player.pos.y + 0.1);
  ctx.effects.ring(at, EFFECTS[r.kind].color, Math.max(1.8, r.reach * 0.5));
  ctx.effects.sparkle(tmp.copy(ctx.player.pos).setY(ctx.player.pos.y + 1.2), EFFECTS[r.kind].color);
  switch (r.kind) {
    case 'heal':
      for (const h of ctx.heroes.values()) {
        h.hearts = HERO_STATS.maxHearts;
        h.model.play('cheer');
      }
      break;
    case 'fast':
      ctx.fast = Math.max(ctx.fast, r.for);
      break;
    case 'freeze':
      for (const m of ctx.monsters) if (m.alive && near(ctx, m.pos.x, m.pos.z, r.reach)) m.frozen = Math.max(m.frozen, r.for);
      break;
    case 'home': {
      const gate = homeGate();
      if (gate) void travelTo(ctx, gate.pos, gate.yaw);
      else if (ctx.house) void travelTo(ctx, ctx.house.wake, 0);
      break;
    }
    case 'peace':
    case 'light':
      break;
  }
  timers.start(r);
  events.emit('effect:start', { kind: r.kind });
}

const useOf = (id: ItemId) => (ITEMS[id] as ItemCard).use;

/** Items the party carries that can be used by a tap, with how many (the kit plate's second row). */
export function carried(ctx: Ctx): { id: ItemId; count: number }[] {
  return ITEM_ORDER.flatMap((id) => {
    const u = useOf(id);
    const n = ctx.save.inv[id] ?? 0;
    return u && u !== 'auto' && n > 0 ? [{ id, count: n }] : [];
  });
}

/** The child tapped a carried item: one is used up and its effect starts. False when none is left. */
export function useItem(ctx: Ctx, id: ItemId): boolean {
  const u = useOf(id);
  const n = ctx.save.inv[id] ?? 0;
  if (!u || u === 'auto' || n <= 0) return false;
  ctx.save.inv[id] = n - 1;
  sfx.play('sticker', { pitch: 1.15 });
  startEffect(ctx, u);
  events.emit('item:used', { item: id });
  pushCarried(ctx);
  return true;
}

/**
 * An `use: 'auto'` item (a key) fires by itself: a lock's system calls this when the party is
 * next to it. True (and one is used up) when the party had one.
 */
export function autoUse(ctx: Ctx, id: ItemId): boolean {
  const n = ctx.save.inv[id] ?? 0;
  if (useOf(id) !== 'auto' || n <= 0) return false;
  ctx.save.inv[id] = n - 1;
  events.emit('item:used', { item: id });
  return true;
}

let shown = '';

/** Tells the HUD what the party carries (only when it changed). */
export function pushCarried(ctx: Ctx): void {
  const list = carried(ctx);
  const sig = list.map((c) => `${c.id}:${c.count}`).join(',');
  if (sig === shown) return;
  shown = sig;
  ctx.hud.setCarried(list.map((c) => ({ id: c.id, img: ctx.portraits.items[c.id], count: c.count })));
}

export function initEffects(ctx: Ctx): void {
  timers.clear();
  shown = '\u0000';
  ctx.hud.onCarriedUse = (id) => useItem(ctx, id as ItemId);
  events.on('item:picked', () => pushCarried(ctx));
  pushCarried(ctx);
}

export function updateEffects(ctx: Ctx, dt: number): void {
  timers.tick(dt);
  // a lasting freeze: monsters close to the party keep waiting; a timed one was set when it began
  const freeze = lastingReach(ctx, 'freeze');
  if (freeze !== null) for (const m of ctx.monsters) if (m.alive && near(ctx, m.pos.x, m.pos.z, freeze)) m.frozen = Math.max(m.frozen, 0.3);
  // a lasting fast: the ice cream's running never runs out
  if (lastingReach(ctx, 'fast') !== null) ctx.fast = Math.max(ctx.fast, 0.5);
}

/** For automated checks and the debug params: what is on now. */
export function exposeEffects(ctx: Ctx): void {
  (window as unknown as { __kotoEffects: object }).__kotoEffects = {
    start: (e: Effect) => startEffect(ctx, e),
    use: (id: ItemId) => useItem(ctx, id),
    get timed() {
      return timers.list.map((t) => ({ kind: t.kind, left: +t.left.toFixed(1), reach: t.reach }));
    },
    get lasting() {
      return lasting(ctx);
    },
  };
}
