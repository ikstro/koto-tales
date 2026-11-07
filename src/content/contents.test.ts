import { describe, expect, it } from 'vitest';
import { freshSave } from '../systems/save';
import { contentsOf, plural, wayFrom, type Places, type Row, type Section } from './contents';
import { BUILDINGS, KIT_ORDER } from './buildings';
import { TALES } from './tales';

const PLACES: Places = {
  home: [0, 0],
  villages: [
    { race: 'elves', x: 100, z: -100 },
    { race: 'gnomes', x: -150, z: 120 },
  ],
  castles: [{ race: 'elves', x: 260, z: -250 }],
  boss: null,
};

const row = (s: Section[], key: string): Row => {
  for (const sec of s) for (const r of sec.rows) if (r.key === key) return r;
  throw new Error(`no row ${key}`);
};

describe('contents: everything in the game, for the parents', () => {
  it('Ukrainian plurals after a number', () => {
    const w = ['рибку', 'рибки', 'рибок'] as const;
    expect([1, 2, 5, 11, 21, 24, 112].map((n) => plural(n, w))).toEqual(['рибку', 'рибки', 'рибок', 'рибок', 'рибку', 'рибки', 'рибок']);
  });

  it('the way from home: the side of the world and the distance', () => {
    expect(wayFrom([0, 0], 100, -100)).toBe('на північному сході, ~140 блоків від дому');
    expect(wayFrom([10, 10], 10, 200)).toBe('на півдні, ~190 блоків від дому');
  });

  it('a fresh story: the tent is there, the portal is next, the villages are still to find', () => {
    const s = contentsOf(freshSave(), PLACES);
    expect(s[0].id).toBe('next');
    expect(row(s, 'b-tent').state).toBe('have');
    expect(row(s, 'b-lantern').state).toBe('have');
    expect(row(s, 'reward-portal').state).toBe('now');
    expect(row(s, 'reward-portal').status).toMatch(/^Наступна нагорода: переможи 5 монстрів \(0 з 5\)/);
    expect(row(s, 'b-windmill').state).toBe('later');
    expect(row(s, 'b-garland').status).toMatch(/приз ельфів/);
    expect(row(s, 'b-treehouse').status).toMatch(/Замок на дереві/);
    const elves = row(s, 'v-elves');
    expect(elves.state).toBe('later');
    expect(elves.status).toBe('Як знайти: на північному сході, ~140 блоків від дому');
    expect(elves.about).toMatch(/Дарують: «Гірлянда»/);
    expect(row(s, 'c-elves').status).toMatch(/ще далі за селом ельфів/);
    expect(row(s, 'm-zombie').state).toBe('later');
    // what she brings from a trip says so
    expect(row(s, 'b-bikegen').status).toBe('Як отримати: бабуся привезе з подорожі');
    // what is waiting: the box's next reward first, each row jumping to its own part
    expect(s[0].rows[0].jump).toBe('kit');
    expect(s[0].rows.map((r) => r.jump)).toContain('villages');
  });

  it('the box moves on: the windmill had, the lamps next', () => {
    const save = freshSave();
    save.progress = { level: 2, kind: 'places', start: 0, got: ['portal', 'doghouse', 'windmill'] };
    save.kit.windmill = 1;
    save.kit.pole = 4;
    save.explored = save.explored.slice(0, 0).concat(['1,1', '2,2', '3,3']);
    const s = contentsOf(save, PLACES);
    expect(row(s, 'b-windmill').status).toBe('Є ×1');
    expect(row(s, 'reward-portal').state).toBe('have');
    expect(row(s, 'reward-lamps').state).toBe('now');
    expect(row(s, 'reward-lamps').status).toMatch(/відкрий на карті 8 нових місць \(3 з 8\)/);
  });

  it('a tale under way, one done (its retelling), one waiting for a building', () => {
    const save = freshSave();
    save.tales = { cur: 'treasure', step: 1, got: 0, done: ['fish'], after: 0 };
    const s = contentsOf(save, PLACES);
    expect(row(s, 't-fish').state).toBe('have');
    expect(row(s, 't-treasure').status).toBe('Зараз: крок 2 з 2 — знайди скриню');
    expect(row(s, 't-light').status).toMatch(/^Чекає: потрібна будівля «Вітряк» або/);
    expect(row(s, 't-treasure').line).toBe('tale_treasure_open');
  });

  it('both giants are always listed, each with its own wins', () => {
    const fresh = contentsOf(freshSave(), { ...PLACES, boss: [100, 100] });
    expect(row(fresh, 'boss-eater').state).toBe('now');
    expect(row(fresh, 'boss-eater').status).toBe('Де: на південному сході, ~140 блоків від дому');
    expect(row(fresh, 'boss-nessie').state).toBe('later');
    expect(row(fresh, 'boss-nessie').status).toBe('Як: може прийти замість Пожирача, коли того переможуть');
    expect(row(fresh, 'next-boss-eater').jump).toBe('world');

    // the land-eater beaten once, then the lake monster came
    const save = freshSave();
    save.boss = { ...save.boss, kind: 'nessie', levels: { eater: 1, nessie: 2 }, defeatedDay: null };
    const s = contentsOf(save, PLACES);
    expect(row(s, 'boss-eater').state).toBe('have');
    expect(row(s, 'boss-eater').status).toBe('Переможено: 1. Як: може прийти замість Шелохмаського чудовиська, коли того переможуть');
    expect(row(s, 'boss-nessie').state).toBe('now');
    expect(row(s, 'boss-nessie').line).toBe('guide_nessie');
  });

  it('every building, tale and thing has its parents’ line', () => {
    for (const id of KIT_ORDER) expect(BUILDINGS[id].about.length).toBeGreaterThan(10);
    for (const t of TALES) expect(t.name.length).toBeGreaterThan(3);
    for (const sec of contentsOf(freshSave(), PLACES)) for (const r of sec.rows) expect(r.about, r.key).not.toMatch(/undefined|TODO/);
  });
});

describe('contents: the book of recipes', () => {
  it('lists every dish once, and never among the things', () => {
    const list = contentsOf(freshSave(), PLACES);
    const recipes = list.find((s) => s.id === 'recipes')!;
    expect(recipes.rows.length).toBe(17);
    expect(recipes.rows.every((r) => r.state === 'later' && r.line)).toBe(true);
    expect(list.find((s) => s.id === 'items')!.rows.some((r) => r.key === 'i-borscht')).toBe(false);
  });
  it('a dish cooked is had, with what is left in the box', () => {
    const save = { ...freshSave(), recipes: ['borscht'], inv: { borscht: 3 } };
    const dish = row(contentsOf(save, PLACES), 'r-borscht');
    expect(dish.state).toBe('have');
    expect(dish.status).toContain('3');
  });
});
