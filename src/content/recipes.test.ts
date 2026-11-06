import { describe, expect, it } from 'vitest';
import { ITEMS, ITEM_ORDER, type ItemCard } from './items';
import lines from './lines.json';
import { canCook, COOK, DISHES, missing, pantryOf, PRODUCTS, RECIPES, RECIPE_ORDER, recipesOf, stirActOf, type RecipeCard } from './recipes';

const all = Object.values(RECIPES) as RecipeCard[];

describe('recipes', () => {
  it('six dishes for each hostess, each dish its own', () => {
    expect(recipesOf('yulia').length).toBe(6);
    expect(recipesOf('olia').length).toBe(6);
    expect(DISHES.size).toBe(all.length);
    expect(RECIPE_ORDER.length).toBe(12);
  });
  it('a dish is an item with a power, never lying around, and in the box', () => {
    for (const r of all) {
      const dish = ITEMS[r.dish] as ItemCard;
      expect(dish.weight, r.id).toBe(0);
      expect(typeof dish.use, r.id).toBe('object');
      expect(ITEM_ORDER, r.id).toContain(r.dish);
    }
  });
  it('the four powers come round evenly', () => {
    const kinds = all.map((r) => ((ITEMS[r.dish] as ItemCard).use as { kind: string }).kind);
    for (const k of ['fast', 'peace', 'freeze', 'light']) expect(kinds.filter((x) => x === k).length, k).toBe(3);
  });
  it('every product can be found or is given, and none is a dish', () => {
    for (const r of all) for (const n of r.needs) expect(PRODUCTS, r.id).toContain(n);
    for (const p of PRODUCTS) {
      expect(DISHES.has(p)).toBe(false);
      expect((ITEMS[p] as ItemCard).weight, p).toBeGreaterThan(0);
    }
  });
  it('the toadstool is never cooked', () => {
    for (const r of all) expect(r.needs).not.toContain('mushroom_red');
  });
  it('every recipe tells itself in its hostess’s voice', () => {
    const say = lines as Record<string, { speaker: string }>;
    for (const r of all) expect(say[r.line]?.speaker, r.id).toBe(r.host === 'olia' ? 'olia' : 'babusia');
  });
  it('no cakes', () => {
    for (const r of all) expect(r.name.toLowerCase()).not.toMatch(/торт/);
  });
});

describe('what the pantry has', () => {
  const twice = RECIPES.varenyky;
  const mixed = RECIPES.compote;
  it('two of one product need two', () => {
    expect(canCook(twice, { cherry: 1 })).toBe(false);
    expect(canCook(twice, { cherry: 2 })).toBe(true);
    expect(missing(twice, { cherry: 1 })).toEqual(['cherry']);
  });
  it('names what is short, each once', () => {
    expect(missing(mixed, {})).toEqual(['apple', 'cherry']);
    expect(missing(mixed, { apple: 3 })).toEqual(['cherry']);
    expect(missing(mixed, { apple: 1, cherry: 1 })).toEqual([]);
  });
});

describe('the morning product', () => {
  it('each day gives one thing the hostess cooks with', () => {
    for (const host of ['yulia', 'olia'] as const) {
      const used = new Set(recipesOf(host).flatMap((r) => r.needs));
      for (let day = 0; day < 30; day++) expect(used.has(pantryOf(host, day)), `${host} ${day}`).toBe(true);
    }
  });
  it('over a week every product of hers comes round', () => {
    for (const host of ['yulia', 'olia'] as const) {
      const given = new Set(Array.from({ length: 7 }, (_, d) => pantryOf(host, d)));
      for (const r of recipesOf(host)) for (const n of r.needs) if (host === 'yulia' || n !== 'cherry') expect(given.has(n), `${host} ${n}`).toBe(true);
    }
  });
});

describe('the spoon', () => {
  it('goes round the party, six taps', () => {
    expect(COOK.stirs).toBe(6);
    const acts = Array.from({ length: COOK.stirs }, (_, i) => stirActOf(i));
    for (const hero of ['lyosha', 'solomiia', 'david', 'pupsia']) expect(acts).toContain(hero);
  });
});
