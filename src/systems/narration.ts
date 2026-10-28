import { HEROES } from '../content/heroes';
import { ITEMS } from '../content/items';
import type { LineId } from '../content/lines';
import { MONSTERS } from '../content/monsters';
import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';

/**
 * Everything the game says, in one place: the voice reacts to events, so a
 * child who cannot read is always told what just happened.
 */
const WISDOM: LineId[] = ['pupsia_wisdom_1', 'pupsia_wisdom_2', 'pupsia_wisdom_3', 'pupsia_wisdom_4', 'pupsia_wisdom_5', 'pupsia_wisdom_6'];
const WINS: LineId[] = ['win_1', 'win_2', 'win_3'];
const COIN_MILESTONES: [number, LineId][] = [
  [10, 'coins_10'],
  [50, 'coins_50'],
  [100, 'coins_100'],
];

let wisdomTimer = 120;
let lowHeartsSaid = false;

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

export function initNarration(ctx: Ctx): void {
  /** Says a line once per save (tips, milestones). */
  const once = (id: LineId, priority = 4) => {
    if (ctx.save.said.includes(id)) return false;
    ctx.save.said.push(id);
    voice.say(id, { priority });
    return true;
  };

  events.on('item:picked', ({ item, first }) => {
    if (!first) return;
    // The owner's call: no pop-up cards over the game, the voice names the find.
    voice.say(ITEMS[item].line, { priority: 6, interrupt: true });
    sfx.play('sticker');
  });

  events.on('coins:changed', ({ coins }) => {
    for (const [n, line] of COIN_MILESTONES) if (coins >= n) once(line, 5);
  });

  events.on('monster:spot', ({ kind, first }) => {
    if (first) voice.say(MONSTERS[kind].spotLine, { priority: 4 });
    if (!ctx.save.said.includes('tip_arrow')) setTimeout(() => once('tip_arrow', 7), 2500);
  });

  events.on('monster:defeated', ({ kind, first }) => {
    if (first) {
      voice.say(MONSTERS[kind].defeatLine, { priority: 6, interrupt: true });
      sfx.play('sticker');
      if (!ctx.save.said.includes('tip_lightning')) setTimeout(() => once('tip_lightning', 7), 3000);
    } else if (Math.random() < 0.3) {
      voice.say(Math.random() < 0.5 ? pick(WINS) : HEROES[ctx.player.id].lines.yay, { priority: 2 });
    }
  });

  events.on('time:phase', ({ phase }) => {
    voice.say(phase, { priority: 5 });
    if (phase === 'night') setTimeout(() => voice.say('pupsia_tip_night', { priority: 3 }), 5000);
  });

  events.on('hero:hurt', ({ hearts }) => {
    if (hearts === 1 && !lowHeartsSaid) {
      lowHeartsSaid = true;
      voice.say('pupsia_tip_hearts', { priority: 6 });
    }
  });

  events.on('hero:wake', () => voice.say('wake_home', { priority: 7, interrupt: true }));
  events.on('hero:switch', ({ hero }) => voice.say(HEROES[hero].lines.hi, { priority: 6, interrupt: true }));
  events.on('hero:home', ({ inside }) => {
    if (inside) once('home_here', 4);
  });
  events.on('album:open', () => once('chest_open', 3));
}

/** Timed lines: first tips, and Пупся's thoughts now and then. */
export function updateNarration(ctx: Ctx, dt: number): void {
  if (!ctx.playing || ctx.sleeping) return;
  const said = ctx.save.said;
  const e = ctx.clock.elapsed;
  const once = (id: LineId) => {
    if (said.includes(id)) return;
    said.push(id);
    voice.say(id, { priority: 7 });
  };
  if (e > 4 && !said.includes('tip_move')) once('tip_move');
  if (e > 90 && !said.includes('tip_build')) once('tip_build');

  wisdomTimer -= dt;
  if (wisdomTimer <= 0) {
    wisdomTimer = 100 + Math.random() * 70;
    if (!voice.isSpeaking()) voice.say(pick(WISDOM), { priority: 1 });
  }
}
