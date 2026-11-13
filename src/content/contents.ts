import type { Biome } from '../contracts';
import type { BossKind } from '../systems/bossLogic';
import type { SaveData } from '../systems/save';
import { RACES, type Race } from '../world/villages';
import { ARTIFACTS, ARTIFACT_ORDER } from './artifacts';
import { centreOf, PRESENTS } from './babusia';
import { BUILDINGS, KIT_ORDER, type BuildingId } from './buildings';
import { CASTLE_CARDS, CASTLE_GOALS, castleOpen, castleTask, type CastleCard } from './castles';
import { CHESS, CHESS_PRIZE, LESSONS, LESSON_TEXT, bigLeft, freshChess, lessonAsk, lessonGoals, lessonPicture, nextLesson } from './chess';
import { COMPANIONS } from './companions';
import { ITEMS, ITEM_ORDER, type ItemCard, type ItemId } from './items';
import { LINES, type LineId } from './lines';
import { MONSTERS, MONSTER_ORDER, type MonsterCard } from './monsters';
import { REWARDS, TASKS, nextReward, taskCount, taskFor, type TaskKind } from './progress';
import { DISHES, OWN_PAGE, RECIPES, RECIPE_ORDER, type RecipeCard } from './recipes';
import { TALES, TALE_ITEMS, entryOf, stepGoal, talesLeft, type TaleCard, type TaleStep } from './tales';
import { RACE_CARDS, TASK_NEEDS, VILLAGE_GOALS, isFriend, villageTask, type RaceCard, type VillageTask } from './villages';
import { latestReleases } from './whatsNew';

/**
 * «Зміст гри» (DESIGN.md «Contents»): everything the game has, for the parents, each thing marked
 * as had, under way or still ahead with how to get it. Built from the cards and the save only, so
 * a new card shows up here by itself. Ukrainian text (its `about` lines live on the cards).
 */

export type SectionId = 'new' | 'next' | 'babusia' | 'kit' | 'buildings' | 'villages' | 'castles' | 'chess' | 'tales' | 'recipes' | 'items' | 'monsters' | 'world' | 'treasures' | 'friends' | 'voices';

/**
 * Who made the voices (the owner's call, 2026-11-10). The Apache-2.0 studio recordings require their authors
 * to be named; the rest is said out of courtesy. Sources in tools/voice/VOICES.md.
 */
export const VOICE_CREDITS: readonly Row[] = [
  {
    key: 'voices-engines',
    pic: { sprite: 'sound-on' },
    title: 'Чим озвучено',
    about: 'Оповідача і Пупсю озвучує Azure Speech від Microsoft. Усіх інших героїв — HolosTTS (patriotyk, ліцензія MIT), що працює на нашому комп’ютері й ставить наголоси так, як ми їх записали.',
    state: 'have',
    status: 'Azure Speech, HolosTTS',
  },
  {
    key: 'voices-studio',
    pic: { sprite: 'hero-david' },
    title: 'Голос дикторки Тетяни',
    about: 'Давид і бабуся Оля говорять голосом, зробленим із відкритих записів дикторки Тетяни (набір speech-uk/opentts-tetiana).',
    state: 'have',
    status: 'Ліцензія Apache 2.0',
  },
  {
    key: 'voices-common',
    pic: { sprite: 'hero-lyosha' },
    title: 'Голоси добровольців',
    about: 'Голоси Льоші, бабусі Юлі, рас, правителів, Сірка й ведучого новин зроблені із записів добровольців Mozilla Common Voice, які подарували свої голоси всім.',
    state: 'have',
    status: 'Суспільне надбання (CC0)',
  },
  {
    key: 'voices-own',
    pic: { sprite: 'hero-solomiia' },
    title: 'Соломія',
    about: 'Соломію озвучила Наташа.',
    state: 'have',
    status: 'Дякуємо!',
  },
];

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
  /** The chess kingdom's centre, when the world has one. */
  chess?: { x: number; z: number } | null;
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
    case 'cook':
      return 'приготуй страву в бабусі';
    case 'place':
      return `постав «${BUILDINGS[s.building!].name}»${s.at === 'home' ? ' біля дому' : ''}`;
    case 'visit':
      return s.at === 'home' ? 'повернись додому' : s.at === 'babusia' ? 'прийди до бабусі' : `дійди до села ${RACE_OF[s.at as Race]}`;
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

/** How many of the latest releases «Що нового» lists. */
const CONTENTS_RELEASES = 2;

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
    const got = p.got.includes(r.id);
    const status = got ? 'Отримано' : i === nextIdx ? `Наступна нагорода: ${taskNow}` : `Нагорода скриньки №${i + 1}, після «${kit[kit.length - 1].title}»`;
    // a friend joins the party (the friends section shows it with the heart)
    if (r.companion) {
      const c = COMPANIONS[r.companion];
      kit.push({ key: `reward-${r.id}`, pic: { sprite: 'heart' }, title: c.name, about: c.about, state: got ? 'have' : i === nextIdx ? 'now' : 'later', status, line: r.line });
      return;
    }
    const b = r.items?.[0][0];
    const n = r.items?.[0][1] ?? 1;
    const title = r.ability === 'portal' ? 'Портал' : `${BUILDINGS[b!].name}${n > 1 ? ` ×${n}` : ''}${r.items && r.items.length > 1 ? ` і ${BUILDINGS[r.items[1][0]].name.toLowerCase()} ×${r.items[1][1]}` : ''}`;
    kit.push({
      key: `reward-${r.id}`,
      pic: { sprite: r.ability === 'portal' ? 'b-portal' : BUILDINGS[b!].sprite },
      title,
      about: r.ability === 'portal' ? 'Арка у дворі. Здалеку торкнись будиночка на карті — і ти вдома; через арку — назад.' : BUILDINGS[b!].about,
      state: got ? 'have' : i === nextIdx ? 'now' : 'later',
      status,
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
    const gift = TALES.find((t) => t.gifts?.some((g) => 'building' in g && g.building === id));
    if (gift) return { state: 'later', status: `Як отримати: подарунок бабусі за казку «${gift.name}»` };
    const cr = RACES.find((r) => CASTLE_CARDS[r].prize === id);
    if (cr) return { state: 'later', status: `Як отримати: у скрині на вершині замку «${CASTLE_CARDS[cr].name}»` };
    if (id === CHESS_PRIZE) return { state: 'later', status: 'Як отримати: у скрині на вершині вежі шахового королівства, після семи уроків короля' };
    if (PRESENTS.some((g) => 'building' in g && g.building === id)) return { state: 'later', status: 'Як отримати: бабуся привезе з подорожі' };
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

  // ─── the chess kingdom: the kingdom, the king's seven lessons, «Великі шахи» ───
  const cs = save.chess ?? freshChess();
  const lessonNow = cs.met ? (cs.cur ?? nextLesson(cs)) : null;
  const kingdom: Row = {
    key: 'chess-kingdom',
    pic: { sprite: 'castle-chess' },
    title: 'Шахове королівство',
    about: 'Королівство живих шахових фігур на великій дошці. Білий Король дає сім уроків — кожна фігура ходить по-своєму, — а після сьомого відчиняє вежу зі скринею.',
    state: cs.opened ? 'have' : cs.met ? 'now' : 'later',
    status: cs.opened
      ? `Скриню відкрито: «${BUILDINGS[CHESS_PRIZE].name}» у скриньці. Щодня король має задачку.`
      : cs.done.length >= LESSONS.length
        ? 'Усі уроки пройдено — піднімись сходами вежі до скрині'
        : cs.met
          ? `Уроків: ${cs.done.length} з ${LESSONS.length}${lessonNow ? ` · зараз: ${LESSON_TEXT[lessonNow].name}` : ''}`
          : `Як знайти: ${places.chess ? wayFrom(places.home, places.chess.x, places.chess.z) : 'далеко від дому'}`,
    line: cs.met ? 'chess_hello' : 'chess_seen',
  };
  const lessons: Row[] = LESSONS.map((l, i) => {
    const isDone = cs.done.includes(l);
    const now = cs.cur === l;
    return {
      key: `chess-${l}`,
      pic: { sprite: lessonPicture(l) },
      title: `Урок ${i + 1}: ${LESSON_TEXT[l].name}`,
      about: LESSON_TEXT[l].about,
      state: isDone ? 'have' : now ? 'now' : 'later',
      status: isDone ? 'Пройдено' : now ? `${cs.got} з ${lessonGoals(l)}` : lessonNow === l ? 'Наступний урок: король чекає біля дошки' : 'Як пройти: урок Білого Короля, по черзі',
      line: lessonAsk(l),
    };
  });
  const bigOwned = owned(CHESS_PRIZE);
  const bigRow: Row = {
    key: 'chess-big',
    pic: { sprite: BUILDINGS[CHESS_PRIZE].sprite },
    title: BUILDINGS[CHESS_PRIZE].name,
    about: BUILDINGS[CHESS_PRIZE].about,
    ...(bigOwned > 0
      ? { state: 'have' as const, status: `Є ×${bigOwned} · сьогодні задачок: ${CHESS.bigADay - bigLeft(cs, save.day)} з ${CHESS.bigADay}` }
      : howBuilding(CHESS_PRIZE)),
    line: BUILDINGS[CHESS_PRIZE].firstLine,
  };
  const chess: Row[] = [kingdom, ...lessons, bigRow];

  // ─── tales ───
  const left = talesLeft(save.tales.done, has);
  const from = (t: TaleCard) => (t.from === 'pupsia' ? 'Пупся' : t.from === 'babusia' ? 'Бабуся' : RACE_CARDS[t.from].name);
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
      status = `Ще попереду${nth === 0 ? ' (наступна)' : ''}: ${entry === 'wake' ? 'на початку гри' : entry === 'dream' ? 'Пупсі насниться після ночі сну' : t.from === 'babusia' ? 'прилетить лелека з листом від бабусі' : `прилетить літачок-лист від ${RACE_OF[t.from as Race]}`}`;
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
  const recipes: Row[] = RECIPE_ORDER.map((id) => {
    const r: RecipeCard = RECIPES[id];
    const got = save.recipes.includes(id);
    const n = save.inv[r.dish as ItemId] ?? 0;
    const names = [...new Set(r.needs)].map((p) => {
      const k = r.needs.filter((n) => n === p).length;
      return `${(ITEMS[p] as ItemCard).name.toLowerCase()}${k > 1 ? ` ×${k}` : ''}`;
    });
    const needs = names.length > 1 ? `${names.slice(0, -1).join(', ')} і ${names.at(-1)}` : names[0];
    return {
      key: `r-${id}`,
      pic: { portrait: 'item', id: r.dish },
      title: r.name,
      about: r.about,
      state: got ? 'have' : 'later',
      status: got ? (n ? `Уже готували, у скриньці ${n}` : 'Уже готували') : `Ще попереду: потрібно ${needs}`,
      line: r.line,
    };
  });
  const own = save.kitchen?.own.length ?? 0;
  recipes.push({
    key: 'r-own',
    pic: { portrait: 'item', id: OWN_PAGE.dish },
    title: OWN_PAGE.name,
    about: 'Будь-які один-три продукти без рецепта: юшка кольору продуктів із невеликою силою, яку дає більшість продуктів (вишні й мед — швидкий біг, картопля — монстри завмирають, морква та яйце — монстри не з’являються, гриб і яблуко — монстри танцюють).',
    state: own ? 'have' : 'later',
    status: own ? `Уже вигадали ${own}` : 'Ще попереду: покласти в каструлю продукти без рецепта',
    line: OWN_PAGE.line,
  });
  const items: Row[] = ITEM_ORDER.filter((id) => !DISHES.has(id)).map((id) => {
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

  // ─── lighthouses and the giant that is up ───
  const bossBeaten = taskCount(save, 'boss');
  // Both giants are always listed: the one up now, the other as what may come after a win.
  const giant = (kind: BossKind, g: { sprite: string; title: string; about: string; line: LineId; other: string; first: string }): Row => {
    const b = save.boss;
    // a giant's level goes up each time it comes; the land-eater comes first at 1, the lake monster's starts at 1 unseen
    const came = kind === 'eater' ? b.levels.eater : b.levels.nessie - 1;
    const up = b.kind === kind && b.defeatedDay === null && came > 0;
    const beaten = Math.max(0, came - (up ? 1 : 0));
    const won = beaten ? `Переможено: ${beaten}. ` : '';
    const status = up
      ? `${won}${places.boss ? `Де: ${wayFrom(places.home, places.boss[0], places.boss[1])}` : g.first}`
      : b.defeatedDay !== null
        ? `${won}Скоро хтось повернеться`
        : `${won}Як: може прийти замість ${g.other}, коли того переможуть`;
    return { key: `boss-${kind}`, pic: { sprite: g.sprite }, title: g.title, about: g.about, state: up ? 'now' : beaten ? 'have' : 'later', status, line: g.line };
  };
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
    giant('eater', {
      sprite: 'boss-face',
      title: 'Пожирач земель',
      about: 'Великий кам’яний монстр у своїй пустці. Постав біля нього три ліхтарі — броня трісне, тоді стріляй у відкриту пащу. Через 3 дні повертається сильнішим.',
      line: 'guide_boss',
      other: 'Шелохмаського чудовиська',
      first: 'З’явиться далеко від дому',
    }),
    giant('nessie', {
      sprite: 'nessie-face',
      title: 'Шелохмаське чудовисько',
      about: 'Озерний монстр у далекому озері. Поклади на берег три рибки — воно випливе, тоді стріляй у відкриту пащу. Повертається через 3 дні.',
      line: 'guide_nessie',
      other: 'Пожирача',
      first: 'Чекає у далекому озері',
    }),
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

  // ─── Бабуся ───
  const babusiaAt = save.babusia.at;
  const babusia: Row[] = [
    {
      key: 'babusia',
      pic: { sprite: 'map-babusia' },
      title: 'Бабуся Юля',
      about: 'Королева квітів і погоди. Біля її дому немає монстрів, там завжди є що поїсти й можна заночувати. Вона мандрує: дім часом переїжджає, а на старому місці лишається галявина. Стрілка на карті завжди веде до неї, а натискання на її значок переносить до неї.',
      state: babusiaAt ? 'have' : 'later',
      status: babusiaAt && save.babusia.host === 'olia' ? 'У мандрівці, скоро повернеться' : babusiaAt ? `Де вона зараз: ${wayFrom(places.home, ...centreOf(babusiaAt))}` : 'Приїде після першої казки: прилетить лелека з листом',
      line: 'babusia_hello_2',
    },
    {
      key: 'olia',
      pic: { sprite: 'map-olia' },
      title: 'Бабуся Оля',
      about: 'Учена, знає всіх комах і жучків, доглядає звірят. Вони з бабусею Юлею живуть в одному домі й міняються, коли дім переїжджає: речі, їжа й подарунки в них спільні.',
      state: save.babusia.host === 'olia' ? 'have' : 'later',
      status: babusiaAt && save.babusia.host === 'olia' ? `Де вона зараз: ${wayFrom(places.home, ...centreOf(babusiaAt))}` : save.tales.done.includes('olia_hi') ? 'У мандрівці, скоро повернеться' : 'Приїде, коли бабуся Юля вирушить у мандрівку',
      line: 'olia_hello_2',
    },
  ];

  // ─── what is waiting next: a few rows from the sections below ───
  const next: Row[] = [];
  const pick = (row: Row | undefined, jump: SectionId) => row && next.push({ ...row, key: `next-${row.key}`, jump });
  pick(kit.find((r) => r.state === 'now' && r.key.startsWith('reward-')) ?? kit[0], 'kit');
  pick(tales.find((r) => r.state === 'now') ?? tales.find((r) => r.status.includes('(наступна)')), 'tales');
  pick(villages.find((r) => r.state === 'now') ?? villages.find((r) => r.state === 'later'), 'villages');
  const friendVillage = RACES.find((r) => village(r) && isFriend(village(r)!) && !castle(r)?.freed);
  pick(castles.find((r) => r.state === 'now') ?? (friendVillage ? castles[RACES.indexOf(friendVillage)] : undefined), 'castles');
  pick(chess.find((r) => r.state === 'now' && r.key !== 'chess-big'), 'chess');
  if (!bossBeaten) pick(world.find((r) => r.key === `boss-${save.boss.kind}`), 'world');

  // ─── what came with the latest updates, newest first ───
  const fresh: Row[] = latestReleases(CONTENTS_RELEASES).flatMap((r) =>
    r.things.map((t): Row => {
      const unseen = r.id > (save.whatsNew ?? 0);
      return {
        key: `new-${t.id}`,
        pic: { sprite: t.pic },
        title: t.name,
        about: t.about,
        state: unseen ? 'now' : 'have',
        status: `Оновлення ${r.id}${unseen ? ' · ще не дивилися: подарунок угорі' : ''}` + (t.id.startsWith('tornado') ?
          (save.tales.done.includes('fish') ? ' · Вогняний постійно гуляє поза безпечними місцями; шукай його мітку на мапі. Чекати ходьби не потрібно.' :
            ' · Вогняний: спочатку заверши казку про рибку.') : ''),
        line: t.line,
      };
    }),
  );

  const sections: Section[] = [
    { id: 'new', title: 'Що нового', icon: 'gift', rows: fresh },
    { id: 'next', title: 'Що чекає далі', icon: 'play', rows: next },
    { id: 'babusia', title: 'Бабуся', icon: 'map-babusia', rows: babusia },
    { id: 'kit', title: 'Скринька', icon: 'kit', rows: kit },
    { id: 'buildings', title: 'Будівлі', icon: 'b-windmill', rows: buildings },
    { id: 'villages', title: 'Села', icon: 'folk-elves', rows: villages },
    { id: 'castles', title: 'Замки', icon: 'castle-elves', rows: castles },
    { id: 'chess', title: 'Шахове королівство', icon: 'castle-chess', rows: chess },
    { id: 'tales', title: 'Казки', icon: 'album', rows: tales },
    { id: 'recipes', title: 'Рецепти', icon: 'ask-pot', rows: recipes },
    { id: 'items', title: 'Речі', icon: 'apple', rows: items },
    { id: 'monsters', title: 'Монстри', icon: 'zombie', rows: monsters },
    { id: 'world', title: 'Маяки і велетні', icon: 'task-lighthouse', rows: world },
    { id: 'treasures', title: 'Скарби', icon: 'chest', rows: treasures },
    { id: 'friends', title: 'Друзі', icon: 'heart', rows: friends },
    { id: 'voices', title: 'Голоси', icon: 'sound-on', rows: [...VOICE_CREDITS] },
  ];
  return sections.filter((s) => s.rows.length > 0);
}
