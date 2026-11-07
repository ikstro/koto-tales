import type { Ctx } from '../core/ctx';
import { LATEST_RELEASE, unseenThings, type NewThing } from '../content/whatsNew';
import { WhatsNewPlate } from '../ui/whatsNew';
import { voice } from '../voice/voice';
import { lettersCalm } from './tales';

/**
 * «Що нового» (DESIGN.md «What's new», content/whatsNew.ts): the first start after an update that
 * brought new things. Once play has begun and all is calm, Пупся says something new has come and
 * the gift piece pops in by the top row; a tap opens the plate of picture cards (the game pauses);
 * closing it marks everything seen. Never tapped: it stays, and Пупся reminds once a session.
 */

/** Seconds of play before the hello (past the wake ritual and the first seconds). */
const HELLO_AFTER = 8;
/** The reminder comes this long after the gift appeared (s), once a session. */
const REMIND_AFTER = 180;

let things: NewThing[] = [];
let plate: WhatsNewPlate | null = null;
let shown = false;
let reminded = false;
let since = 0;

export function initWhatsNew(ctx: Ctx): void {
  things = unseenThings(ctx.save.whatsNew ?? 0);
  shown = false;
  reminded = false;
  since = 0;
  if (!things.length) return;
  const parent = ctx.hud.root.parentElement ?? document.body;
  plate ??= new WhatsNewPlate(parent, () => ctx.hud.pieceScale);
  ctx.hud.onGiftTap = () => open(ctx);
}

/** Nothing else is going on: no line, no monster near, no flight, no plate open. */
function quiet(ctx: Ctx): boolean {
  return !ctx.focus && !ctx.hud.isPaused && !ctx.hud.guideOpen && lettersCalm(ctx);
}

export function updateWhatsNew(ctx: Ctx, dt: number): void {
  if (!things.length || !ctx.playing || plate?.isOpen) return;
  since += dt;
  if (!shown) {
    if (since < HELLO_AFTER || !quiet(ctx)) return;
    shown = true;
    since = 0;
    voice.say('new_hello', { priority: 7 });
    ctx.hud.setGift(things.length);
    return;
  }
  if (!reminded && since > REMIND_AFTER && quiet(ctx)) {
    reminded = true;
    voice.say('new_reminder', { priority: 6 });
    ctx.hud.giftHop();
  }
}

function open(ctx: Ctx): void {
  if (!plate || plate.isOpen || !things.length) return;
  const release = ctx.hud.holdPause();
  plate.open(things, () => {
    release();
    ctx.save.whatsNew = LATEST_RELEASE;
    things = [];
    ctx.hud.setGift(0);
  });
}
