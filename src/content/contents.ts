import type { Biome } from '../contracts';
import type { SaveData } from '../systems/save';
import { RACES, type Race } from '../world/villages';
import { ARTIFACTS, ARTIFACT_ORDER } from './artifacts';
import { BUILDINGS, KIT_ORDER, type BuildingId } from './buildings';
import { CASTLE_CARDS, CASTLE_GOALS, castleOpen, castleTask, type CastleCard } from './castles';
import { COMPANIONS } from './companions';
import { ITEMS, ITEM_ORDER, type ItemCard } from './items';
import { LINES, type LineId } from './lines';
import { MONSTERS, MONSTER_ORDER, type MonsterCard } from './monsters';
import { REWARDS, TASKS, nextReward, taskCount, taskFor, type TaskKind } from './progress';
import { TALES, TALE_ITEMS, entryOf, stepGoal, talesLeft, type TaleCard, type TaleStep } from './tales';
import { RACE_CARDS, TASK_NEEDS, VILLAGE_GOALS, isFriend, villageTask, type RaceCard, type VillageTask } from './villages';

/**
 * «Зміст гри» (DESIGN.md «Contents»): everything the game has, for the parents, each thing marked
 * as had, under way or still ahead with how to get it. Built from the cards and the save only, so
 * a new card shows up here by itself. Ukrainian text (its `about` lines live on the cards).
 */

export type SectionId = 'next' | 'kit' | 'buildings' | 'villages' | 'castles' | 'tales' | 'items' | 'monsters' | 'world' | 'treasures' | 'friends';

/** A HUD sprite, or a picture rendered at runtime (ui/portraits.ts). */
export type Pic = { sprite: string } | { portrait: 'item' | 'monster' | 'artifact'; id: string };

/** have: the child has it / it is done; now: under way; later: still ahead. */
export type RowState = 'have' | 'now' | 'later';

export interface Row {
  key: string;
  pic: Pic;
  title: string;
  about: string;
  state: RowState;
  /** «Є ×2», «Зараз: …», «Як отримати: …». */
  status: string;
  /** Said when the picture is tapped (already voiced). */
  line?: LineId;
  /** A building's upgrade level (gold studs). */
  level?: number;
  /** Льоша made it up. */
  gold?: boolean;
  /** «Що чекає далі»: the section this row belongs to. */
  jump?: SectionId;
}

export interface Section {
  id: SectionId;
  title: string;
  icon: string;
  rows: Row[];
}

/** Where things stand in the world (centre cells), for the way there from home. */
export interface Places {
  home: [number, number] | null;
  villages: readonly { race: Race; x: number; z: number }[];
  castles: readonly { race: Race; x: number; z: number }[];
  boss: [number, number] | null;
}

// ─── words ───────────────────────────────────────────────────────────────────

/** Ukrainian noun after a number: 1 рибку, 2 рибки, 5 рибок. */
export function plural(n: number, [one, few, many]: readonly [string, string, string]): string {
  const a = n % 10;
  const b = n % 100;
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
}
const count = (n: number, words: readonly [string, string, string]) => `${n} ${plural(n, words)}`;

const MONSTERS_W = ['монстра', 'монстрів', 'монстрів'] as const;
const SECONDS_W = ['секунду', 'секунди', 'секунд'] as const;

/** The race in «до кого / чиє»: села ельфів, приз гномів. */
const RACE_OF: Record<Race, string> = { elves: 'ельфів', gnomes: 'гномів', robots: 'роботів', aliens: 'інопланетян' };

const BIOME: Record<Biome, string> = { meadow: 'луки', forest: 'ліс', beach: 'береги', hills: 'гори', snow: 'сніг' };

/** «на північному сході, ~140 блоків від дому» (north is up on the map: −z). */
export function wayFrom(home: [number, number] | null, x: number, z: number): string {
  const [hx, hz] = home ?? [0, 0];
  const dx = x - hx;
  const dz = z - hz;
  const SIDES = ['на півночі', 'на північному сході', 'на сході', 'на південному сході', 'на півдні', 'на південному заході', 'на заході', 'на північному заході'];
  const a = (Math.atan2(dx, -dz) / (Math.PI * 2) + 1) % 1;
  const side = SIDES[Math.round(a * 8) % 8];
  const d = Math.round(Math.hypot(dx, dz) / 10) * 10;
  return `${side}, ~${d} блоків від дому`;
}

function kitTask(kind: TaskKind, goal: number): string {
  switch (kind) {
    case 'monsters':
      return `переможи ${count(goal, MONSTERS_W)}`;
    case 'coins':
      return `збери ${count(goal, ['монетку', 'монетки', 'монет'])}`;
    case 'places':
      return `відкрий на карті ${count(goal, ['нове місце', 'нові місця', 'нових місць'])}`;
    case 'nights':
      return `поспи ${count(goal, ['ніч', 'ночі', 'ночей'])}`;
    case 'boss':
      return 'переможи Пожирача земель';
    case 'lighthouse':
      return 'засвіти ще один маяк';
    case 'dance':
      return `потанцюй ${count(goal, SECONDS_W)}`;
  }
}

function raceTask(kind: VillageTask, goal: number, things: string | undefined, where: 'village' | 'castle'): string {
  switch (kind) {
    case 'find':
      return 'знайди маля, що загубилося';
    case 'gather':
      return `збери ${goal} ${things ?? 'речей'}`;
    case 'defend':
      return where === 'castle' ? `прожени облогу: ${count(goal, MONSTERS_W)}` : `відбий ${count(goal, MONSTERS_W)}`;
    case 'power':
      return where === 'castle' ? 'проведи струм до замку' : 'проведи струм до серця села';
    case 'disco':
      return `увімкни музику на ${count(goal, SECONDS_W)}`;
  }
}

function taleStep(s: TaleStep): string {
  const n = stepGoal(s);
  switch (s.kind) {
    case 'gather':
      return n === 1 ? `знайди ${TALE_ITEMS[s.item!].words[0]}` : `збери ${count(n, TALE_ITEMS[s.item!].words)}`;
    case 'thief':
      return 'спіймай злодія';
    case 'place':
      return `постав «${BUILDINGS[s.building!].name}»${s.at === 'home' ? ' біля дому' : ''}`;
    case 'visit':
      return s.at === 'home' ? 'повернись додому' : `дійди до села ${RACE_OF[s.at as Race]}`;
    case 'music':
      return `увімкни музику на ${count(n, SECONDS_W)}`;
    case 'defend':
      return `відбий ${count(n, MONSTERS_W)}`;
    case 'sleep':
      return 'переночуй';
    case 'light':
      return 'засвіти маяк';
  }
}

const either = (ids: readonly BuildingId[]) => ids.map((b) => `«${BUILDINGS[b].name}»`).join(' або ');

// ─── the page ────────────────────────────────────────────────────────────────

export function contentsOf(save: SaveData, places: Places): Section[] {
  const found = new Set(save.found);
  const owned = (b: BuildingId) => (save.kit[b] ?? 0) + save.placed.filter((p) => p.id === b).length;
  const has = (b: BuildingId) => BUILDINGS[b].count === null || owned(b) > 0;
  const village = (r: Race) => save.villages[r];
  const castle = (r: Race) => save.castles[r];
  const placeOf = (list: Places['villages'], r: Race) => list.find((p) => p.race === r) ?? null;

  // the kit's task under way
  const p = save.progress;
  const task = taskFor(p.level, p.got);
  const done = Math.max(0, Math.min(task.goal, taskCount(save, task.kind) - (p.start ?? taskCount(save, task.kind))));
  const taskNow = `${kitTask(task.kind, task.goal)} (${done} з ${task.goal})`;

  // ─── the kit box ───
  const kit: Row[] = [
    {
      key: 'kit-task',
      pic: { sprite: TASKS[task.kind].icon },
      title: 'Завдання скриньки',
      about: 'За кожне виконане завдання скринька дарує нову будівлю. Завдання йдуть по колу: монстри, монетки, нові місця, монстри, ніч сну, Пожирач — і щоразу трохи більше.',
      state: 'now',
      status: `Зараз: ${taskNow}`,
      line: TASKS[task.kind].line,
    },
  ];
  const nextIdx = REWARDS.findIndex((r) => !p.got.includes(r.id));
  REWARDS.forEach((r, i) => {
    const b = r.items?.[0][0];
    const n = r.items?.[0][1] ?? 1;
    const got = p.got.includes(r.id);
    const title = r.ability === 'portal' ? 'Портал' : `${BUILDINGS[b!].name}${n > 1 ? ` ×${n}` : ''}${r.items && r.items.length > 1 ? ` і ${BUILDINGS[r.items[1][0]].name.toLowerCase()} ×${r.items[1][1]}` : ''}`;
    kit.push({
      key: `reward-${r.id}`,
      pic: { sprite: r.ability === 'portal' ? 'b-portal' : BUILDINGS[b!].sprite },
      title,
      about: r.ability === 'portal' ? 'Арка у дворі. Здалеку торкнись будиночка на карті — і ти вдома; через арку — назад.' : BUILDINGS[b!].about,
      state: got ? 'have' : i === nextIdx ? 'now' : 'later',
      status: got ? 'Отримано' : i === nextIdx ? `Наступна нагорода: ${taskNow}` : `Нагорода скриньки №${i + 1}, після «${kit[kit.length - 1].title}»`,
      line: r.ability === 'portal' ? 'guide_portal' : r.line,
    });
  });
  const allGot = nextIdx < 0;
  const after = allGot ? nextReward(p.got, owned, (b) => save.upgrades[b] ?? 0) : null;
  kit.push({
    key: 'reward-more',
    pic: { sprite: 'coin' },
    title: 'А далі',
    about: 'Коли список скінчиться, скринька по черзі дарує ще будівлі та покращення (рівні 1–3, золоті пупирки в скриньці), а коли все вже є — монетки.',
    state: allGot ? 'now' : 'later',
    status: after
      ? `Зараз: ${after.upgrade ? `покращення «${BUILDINGS[after.upgrade].name}»` : after.items ? `ще «${BUILDINGS[after.items[0][0]].name}»` : 'монетки'} — ${taskNow}`
      : 'Після всіх нагород зі списку',
  });

  // ─── buildings ───
  const howBuilding = (id: BuildingId): { state: RowState; status: string } => {
    const ri = REWARDS.findIndex((r) => r.items?.some(([b]) => b === id));
    if (ri >= 0) return ri === nextIdx ? { state: 'now', status: `Наступна нагорода скриньки: ${taskNow}` } : { state: 'later', status: `Як отримати: нагорода скриньки №${ri + 1}` };
    const race = RACES.find((r) => RACE_CARDS[r].prize === id);
    if (race) return { state: 'later', status: `Як отримати: приз ${RACE_OF[race]} за 3 завдання в їхньому селі (${village(race)?.done.length ?? 0} з 3)` };
    const cr = RACES.find((r) => CASTLE_CARDS[r].prize === id);
    if (cr) return { state: 'later', status: `Як отримати: у скрині на вершині замку «${CASTLE_CARDS[cr].name}»` };
    return { state: 'later', status: 'Як отримати: нагорода скриньки згодом' };
  };
  const buildings: Row[] = KIT_ORDER.map((id) => {
    const c = BUILDINGS[id];
    const level = save.upgrades[id] ?? 0;
    const mine = c.count === null ? { state: 'have' as const, status: 'Є завжди, не закінчується' } : owned(id) > 0 ? { state: 'have' as const, status: `Є ×${owned(id)}${level ? ` · рівень ${level}` : ''}` } : howBuilding(id);
    return { key: `b-${id}`, pic: { sprite: c.sprite }, title: c.name, about: c.about, ...mine, line: c.firstLine ?? c.rewardLine ?? (id === 'lantern' ? 'guide_boss' : undefined), level: level || undefined };
  });

  // ─── villages and castles ───
  const asks = (card: RaceCard | CastleCard, goals: Record<VillageTask, number>, where: 'village' | 'castle') => card.tasks.map((k) => raceTask(k, goals[k], card.things, where)).join(', ');
  const villages: Row[] = RACES.map((race) => {
    const card = RACE_CARDS[race];
    const v = village(race);
    const at = placeOf(places.villages, race);
    const prize = BUILDINGS[card.prize].name;
    let state: RowState = 'later';
    let status = `Як знайти: ${at ? wayFrom(places.home, at.x, at.z) : 'далеко від дому'}`;
    if (v && isFriend(v)) {
      state = 'have';
      status = `Друзі! Приз «${prize}» отримано. Щодня — маленьке завдання.`;
    } else if (v?.met) {
      state = 'now';
      const t = villageTask(card, v, has, save.day);
      status = `Завдань: ${v.done.length} з 3${t ? ` · зараз: ${raceTask(t.kind, t.goal, card.things, 'village')}${t.blocked ? ` (потрібна ${either(TASK_NEEDS[t.kind] ?? [])})` : ''}` : ''}`;
    }
    return {
      key: `v-${race}`,
      pic: { sprite: card.sticker },
      title: `Село: ${card.name}`,
      about: `${card.about} Просять: ${asks(card, VILLAGE_GOALS, 'village')}. Дарують: «${prize}».`,
      state,
      status,
      line: v?.met ? card.hello : card.seen,
    };
  });
  const castles: Row[] = RACES.map((race) => {
    const card = CASTLE_CARDS[race];
    const c = castle(race);
    const at = placeOf(places.castles, race);
    const prize = BUILDINGS[card.prize].name;
    let state: RowState = 'later';
    let status = `Як знайти: ${at ? wayFrom(places.home, at.x, at.z) : 'далеко за селом'} — ще далі за селом ${RACE_OF[race]}`;
    if (c?.freed) {
      state = 'have';
      status = `Скриню відкрито: «${prize}» у скриньці`;
    } else if (c?.met) {
      state = 'now';
      const t = castleTask(card, c, has);
      status = castleOpen(c) ? 'Ворота відкриті — піднімись сходами до скрині' : `Завдань: ${c.done.length} з 3${t ? ` · зараз: ${raceTask(t.kind, t.goal, card.things, 'castle')}` : ''}`;
    }
    return {
      key: `c-${race}`,
      pic: { sprite: card.sticker },
      title: card.name,
      about: `${card.about} Просять: ${asks(card, CASTLE_GOALS, 'castle')}. У скрині: «${prize}».`,
      state,
      status,
      line: c?.met ? card.hello : card.seen,
    };
  });

  // ─── tales ───
  const left = talesLeft(save.tales.done, has);
  const from = (t: TaleCard) => (t.from === 'pupsia' ? 'Пупся' : RACE_CARDS[t.from].name);
  const tales: Row[] = TALES.map((t) => {
    const isDone = save.tales.done.includes(t.id);
    const isCur = save.tales.cur === t.id;
    const steps = t.steps.map(taleStep).join(' → ');
    let state: RowState = 'later';
    let status: string;
    if (isDone) {
      state = 'have';
      status = 'Прочитано — сторінка в книзі казок';
    } else if (isCur) {
      state = 'now';
      const s = t.steps[save.tales.step];
      status = `Зараз: крок ${save.tales.step + 1} з ${t.steps.length}${s ? ` — ${taleStep(s)}` : ''}`;
    } else if (t.needs && !t.needs.some(has)) {
      status = `Чекає: потрібна будівля ${either(t.needs)}`;
    } else {
      const entry = entryOf(t);
      const nth = left.indexOf(t);
      status = `Ще попереду${nth === 0 ? ' (наступна)' : ''}: ${entry === 'wake' ? 'на початку гри' : entry === 'dream' ? 'Пупсі насниться після ночі сну' : `прилетить літачок-лист від ${RACE_OF[t.from as Race]}`}`;
    }
    return {
      key: `t-${t.id}`,
      pic: { sprite: t.sticker },
      title: `Казка «${t.name}»`,
      about: isDone ? LINES[t.retell].text : `${from(t)} просить: ${steps}.`,
      state,
      status,
      line: isDone ? t.retell : t.open,
      gold: t.lyosha,
    };
  });

  // ─── things and monsters ───
  const where = (c: ItemCard) => {
    if (c.id === 'coin') return 'з переможених монстрів і на землі';
    if (c.id === 'eater_heart') return 'тільки від переможеного Пожирача';
    const list = c.biomes === 'any' ? 'будь-де' : c.biomes.map((b) => BIOME[b]).join(', ');
    return `${list}${c.weight < 1 ? ' (рідко)' : ''}`;
  };
  const items: Row[] = ITEM_ORDER.map((id) => {
    const c: ItemCard = ITEMS[id];
    const n = id === 'coin' ? save.coins : (save.inv[id] ?? 0);
    const got = found.has(id);
    return { key: `i-${id}`, pic: { portrait: 'item', id }, title: c.name, about: c.about, state: got ? 'have' : 'later', status: got ? `Знайдено${n > 1 ? ` ×${n}` : ''}` : `Де шукати: ${where(c)}`, line: c.line, gold: c.lyosha };
  });
  const monsters: Row[] = MONSTER_ORDER.map((kind) => {
    const c: MonsterCard = MONSTERS[kind];
    const n = save.defeated[kind] ?? 0;
    const got = found.has(`m:${kind}`);
    const when = c.when === 'night' ? 'лише вночі' : c.when === 'day' ? 'лише вдень' : 'вдень і вночі';
    const biomes = c.biomes ? `, ${c.biomes.map((b) => BIOME[b]).join(', ')}` : '';
    return {
      key: `m-${kind}`,
      pic: { portrait: 'monster', id: kind },
      title: c.name,
      about: c.about,
      state: got ? 'have' : 'later',
      status: got ? (n ? `Переможено ×${n}` : 'Вже зустрічали') : `Коли: ${when}${biomes}`,
      line: c.spotLine,
      gold: c.lyosha,
    };
  });

  // ─── lighthouses and the boss ───
  const bossBeaten = taskCount(save, 'boss');
  const world: Row[] = [
    {
      key: 'lighthouse',
      pic: { sprite: 'map-lighthouse-lit' },
      title: 'Маяки',
      about: 'Стоять біля озер і широких річок, спершу темні. Принеси струм — постав поруч вітряк — і маяк засвітить, а вночі біля нього безпечно.',
      state: save.lit.length ? 'have' : 'later',
      status: save.lit.length ? `Світять: ${save.lit.length}` : 'Як: знайди маяк біля води і постав поруч вітряк (нагорода скриньки)',
      line: 'guide_lighthouse',
    },
    {
      key: 'boss',
      pic: { sprite: 'boss-face' },
      title: 'Пожирач земель',
      about: 'Великий кам’яний монстр у своїй пустці. Постав біля нього три ліхтарі — броня трісне, тоді стріляй у відкриту пащу. Через 3 дні повертається сильнішим.',
      state: bossBeaten ? 'have' : places.boss ? 'now' : 'later',
      status: `${bossBeaten ? `Переможено: ${bossBeaten}. ` : ''}${places.boss && save.boss.defeatedDay === null ? `Де: ${wayFrom(places.home, places.boss[0], places.boss[1])}` : bossBeaten ? 'Скоро повернеться' : 'З’явиться далеко від дому'}`,
      line: 'guide_boss',
    },
  ];

  // ─── treasures and friends (only once there are such cards) ───
  const treasures: Row[] = ARTIFACT_ORDER().map((id) => {
    const a = ARTIFACTS[id];
    const tale = TALES.find((t) => t.artifact === id);
    const cr = RACES.find((r) => CASTLE_CARDS[r].artifact === id);
    const got = save.artifacts.includes(id);
    const how = tale ? `наприкінці казки «${tale.name}»` : cr ? `у скрині замку «${CASTLE_CARDS[cr].name}»` : 'згодом';
    return { key: `a-${id}`, pic: { portrait: 'artifact', id }, title: a.name, about: a.about, state: got ? 'have' : 'later', status: got ? 'Знайдено — сила працює' : `Як отримати: ${how}`, line: a.line, gold: true };
  });
  const friends: Row[] = Object.values(COMPANIONS).map((c) => {
    const got = save.companions.includes(c.id);
    const tale = TALES.find((t) => t.companion === c.id);
    const cr = RACES.find((r) => CASTLE_CARDS[r].companion === c.id);
    const how = tale ? `наприкінці казки «${tale.name}»` : cr ? `у замку «${CASTLE_CARDS[cr].name}»` : 'нагорода скриньки';
    return { key: `f-${c.id}`, pic: { sprite: 'heart' }, title: c.name, about: c.about, state: got ? 'have' : 'later', status: got ? 'Ходить з героями' : `Як отримати: ${how}`, line: c.lines.hi };
  });

  // ─── what is waiting next: a few rows from the sections below ───
  const next: Row[] = [];
  const pick = (row: Row | undefined, jump: SectionId) => row && next.push({ ...row, key: `next-${row.key}`, jump });
  pick(kit.find((r) => r.state === 'now' && r.key.startsWith('reward-')) ?? kit[0], 'kit');
  pick(tales.find((r) => r.state === 'now') ?? tales.find((r) => r.status.includes('(наступна)')), 'tales');
  pick(villages.find((r) => r.state === 'now') ?? villages.find((r) => r.state === 'later'), 'villages');
  const friendVillage = RACES.find((r) => village(r) && isFriend(village(r)!) && !castle(r)?.freed);
  pick(castles.find((r) => r.state === 'now') ?? (friendVillage ? castles[RACES.indexOf(friendVillage)] : undefined), 'castles');
  if (!bossBeaten) pick(world[1], 'world');

  const sections: Section[] = [
    { id: 'next', title: 'Що чекає далі', icon: 'play', rows: next },
    { id: 'kit', title: 'Скринька', icon: 'kit', rows: kit },
    { id: 'buildings', title: 'Будівлі', icon: 'b-windmill', rows: buildings },
    { id: 'villages', title: 'Села', icon: 'folk-elves', rows: villages },
    { id: 'castles', title: 'Замки', icon: 'castle-elves', rows: castles },
    { id: 'tales', title: 'Казки', icon: 'album', rows: tales },
    { id: 'items', title: 'Речі', icon: 'apple', rows: items },
    { id: 'monsters', title: 'Монстри', icon: 'zombie', rows: monsters },
    { id: 'world', title: 'Маяки і Пожирач', icon: 'task-lighthouse', rows: world },
    { id: 'treasures', title: 'Скарби', icon: 'chest', rows: treasures },
    { id: 'friends', title: 'Друзі', icon: 'heart', rows: friends },
  ];
  return sections.filter((s) => s.rows.length > 0);
}
