import { BUILDINGS } from '../content/buildings';
import { TASKS, nextReward, taskFor, type Reward, type TaskKind } from '../content/progress';
import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import { addToKit, owned, raiseLevel } from './kit';

/**
 * The kit box's endless goal (content/progress.ts): one task at a time, counted from
 * where the save stood when it began. The eight studs around the kit piece light up
 * as it fills; when it is full the box gives its reward with a fanfare and the next
 * task begins. Every counter only grows, so nothing can be undone.
 */

let lastCoins = -1;
let lastLit = -1;
/** The level whose task the voice has already named this session. */
let told = -1;

function counter(ctx: Ctx, kind: TaskKind): number {
  const s = ctx.save;
  switch (kind) {
    case 'monsters':
      return Object.values(s.defeated).reduce((a, b) => a + (b ?? 0), 0);
    case 'coins':
      return s.stats.coins;
    case 'places':
      return s.explored.length;
    case 'nights':
      return s.stats.slept;
    case 'boss':
      // the boss comes back a level higher each time it was beaten
      return s.boss.level - 1 + (s.boss.defeatedDay !== null ? 1 : 0);
    case 'lighthouse':
      return s.lit.length;
    case 'dance':
      return Math.floor(s.stats.danced);
  }
}

const next = (ctx: Ctx): Reward =>
  nextReward(
    ctx.save.progress.got,
    (b) => owned(ctx, b),
    (b) => ctx.save.upgrades[b] ?? 0,
  );

/** What the kit plate shows in its last cell: the next reward (dark) and the task's picture. */
function pushNext(ctx: Ctx): void {
  const r = next(ctx);
  const b = r.upgrade ?? r.items?.[0][0];
  const sprite = r.ability === 'portal' ? 'b-portal' : b ? BUILDINGS[b].sprite : 'coin';
  ctx.hud.setKitNext({ sprite, task: TASKS[ctx.save.progress.kind].icon });
}

export function initProgress(ctx: Ctx): void {
  lastCoins = ctx.save.coins;
  events.on('coins:changed', ({ coins }) => {
    if (coins > lastCoins) ctx.save.stats.coins += coins - lastCoins;
    lastCoins = coins;
  });
  ctx.hud.onKitTask = () => tellTask(ctx, true);
  ctx.hud.onKitOpen = () => {
    if (told !== ctx.save.progress.level) tellTask(ctx, false);
  };
  begin(ctx);
  (window as unknown as { __kotoProgress: object }).__kotoProgress = {
    get state() {
      const p = ctx.save.progress;
      const goal = taskFor(p.level, p.got).goal;
      return { ...p, goal, now: counter(ctx, p.kind) - (p.start ?? 0) };
    },
    /** Finishes the current task at once. */
    finish: () => (ctx.save.progress.start = counter(ctx, ctx.save.progress.kind) - taskFor(ctx.save.progress.level, ctx.save.progress.got).goal),
  };
}

function tellTask(ctx: Ctx, interrupt: boolean): void {
  told = ctx.save.progress.level;
  voice.say(TASKS[ctx.save.progress.kind].line, { priority: 6, interrupt });
}

/** Starts the task for the current level, counting from now. */
function begin(ctx: Ctx): void {
  const p = ctx.save.progress;
  const { kind } = taskFor(p.level, p.got);
  if (p.kind !== kind || p.start === null) {
    p.kind = kind;
    p.start = counter(ctx, kind);
  }
  lastLit = -1;
  pushNext(ctx);
}

function give(ctx: Ctx, r: Reward): void {
  const p = ctx.save.progress;
  p.got.push(r.id);
  p.level++;
  p.start = null;
  for (const [id, n] of r.items ?? []) addToKit(ctx, id, n);
  if (r.upgrade) raiseLevel(ctx, r.upgrade);
  if (r.coins) {
    ctx.save.coins += r.coins;
    events.emit('coins:changed', { coins: ctx.save.coins });
  }
  sfx.play('sticker');
  ctx.hud.kitBump();
  ctx.effects.ring(ctx.player.pos, 0xffd23a, 2.4);
  ctx.effects.poof(ctx.player.pos.clone().setY(ctx.player.pos.y + 1.2), 0xffd23a, 22);
  ctx.player.model.play('cheer');
  voice.say('level_up', { priority: 8, interrupt: true });
  setTimeout(() => voice.say(r.line, { priority: 8, interrupt: true }), 2600);
  events.emit('kit:reward', { id: r.id });
  begin(ctx);
}

export function updateProgress(ctx: Ctx): void {
  if (!ctx.playing || ctx.sleeping) return;
  const p = ctx.save.progress;
  if (p.start === null || p.kind !== taskFor(p.level, p.got).kind) begin(ctx);
  const { goal } = taskFor(p.level, p.got);
  const done = Math.max(0, counter(ctx, p.kind) - (p.start ?? 0));
  const lit = Math.min(8, Math.floor((done / goal) * 8 + 1e-6));
  if (lit !== lastLit) {
    ctx.hud.setKitProgress(lit);
    lastLit = lit;
  }
  if (done >= goal) give(ctx, next(ctx));
}

/** Whether the box has already given an ability. */
export function hasAbility(ctx: Ctx, id: 'portal'): boolean {
  return ctx.save.progress.got.includes(id);
}
