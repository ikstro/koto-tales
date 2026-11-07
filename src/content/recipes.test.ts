import { describe, expect, it } from 'vitest';
import { ITEMS, ITEM_ORDER, type ItemCard } from './items';
import lines from './lines.json';
import {
  bookOf,
  canCook,
  COOK,
  DISHES,
  emptyLine,
  factLine,
  hintFor,
  hintLine,
  matchRecipe,
  missing,
  missLine,
  mixKey,
  nameLine,
  OWN,
  OWN_DISHES,
  OWN_PAGE,
  pantryOf,
  PRODUCTS,
  RECIPES,
  RECIPE_ORDER,
  recipesOf,
  stirActOf,
  surpriseOf,
  type RecipeCard,
} from './recipes';

const all = Object.values(RECIPES) as RecipeCard[];

describe('recipes', () => {
  it('eight dishes of each hostess, each dish its own', () => {
    expect(recipesOf('yulia').length).toBe(8);
    expect(recipesOf('olia').length).toBe(8);
    expect(new Set(all.map((r) => r.dish)).size).toBe(all.length);
    expect(DISHES.size).toBe(all.length + OWN_DISHES.length);
    expect(RECIPE_ORDER.length).toBe(16);
  });
  it('two or three products each, and no two recipes the same mix', () => {
    for (const r of all) {
      expect(r.needs.length, r.id).toBeGreaterThanOrEqual(2);
      expect(r.needs.length, r.id).toBeLessThanOrEqual(COOK.most);
    }
    expect(new Set(all.map((r) => mixKey(r.needs))).size).toBe(all.length);
  });
  it('both hostesses keep the whole book, hers first', () => {
    for (const host of ['yulia', 'olia'] as const) {
      const book = bookOf(host);
      expect(book.length).toBe(16);
      expect(book[0].host).toBe(host);
    }
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
    for (const k of ['fast', 'peace', 'freeze', 'light']) expect(kinds.filter((x) => x === k).length, k).toBe(4);
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

describe('mixing in the pantry', () => {
  it('a recipe matches whatever the order', () => {
    expect(matchRecipe(['egg', 'potato', 'potato'])?.id).toBe('deruny');
    expect(matchRecipe(['potato', 'egg', 'potato'])?.id).toBe('deruny');
    expect(matchRecipe(['honey', 'apple', 'cherry'])?.id).toBe('uzvar');
    for (const r of all) expect(matchRecipe([...r.needs].reverse())?.id).toBe(r.id);
  });
  it('anything else is an own dish', () => {
    expect(matchRecipe(['potato'])).toBeNull();
    expect(matchRecipe(['potato', 'potato'])).toBeNull();
    expect(matchRecipe(['potato', 'potato', 'potato'])).toBeNull();
  });
  it('every product gives a power', () => {
    for (const p of PRODUCTS) expect((ITEMS[p] as ItemCard).gives, p).toBeTruthy();
  });
  it('the power most products give wins', () => {
    expect(surpriseOf(['potato'])).toBe(OWN.freeze);
    expect(surpriseOf(['cherry', 'honey', 'potato'])).toBe(OWN.fast);
    expect(surpriseOf(['carrot', 'potato', 'egg'])).toBe(OWN.light);
    expect(surpriseOf(['mushroom_brown', 'apple'])).toBe(OWN.peace);
  });
  it('a tie goes to the first product dropped', () => {
    expect(surpriseOf(['potato', 'cherry'])).toBe(OWN.freeze);
    expect(surpriseOf(['cherry', 'potato'])).toBe(OWN.fast);
    expect(surpriseOf(['apple', 'carrot', 'potato'])).toBe(OWN.peace);
  });
  it('an own dish is weaker than a book dish of the same power', () => {
    for (const r of all) {
      const book = (ITEMS[r.dish] as ItemCard).use as { kind: string; for?: number; reach?: number };
      const own = (ITEMS[OWN[book.kind as keyof typeof OWN]] as ItemCard).use as { for?: number; reach?: number };
      expect(own.for ?? 0, r.id).toBeLessThan(book.for ?? 20);
      if (book.reach) expect(own.reach ?? 0, r.id).toBeLessThanOrEqual(book.reach);
    }
    for (const id of OWN_DISHES) {
      expect((ITEMS[id] as ItemCard).weight).toBe(0);
      expect(ITEM_ORDER).toContain(id);
    }
  });
  it('the hint is the nearest recipe', () => {
    expect(hintFor(['potato', 'potato']).id).toBe('deruny');
    expect(hintFor(['potato']).id).toBe('borscht');
    expect(hintFor(['cherry']).id).toBe('varenyky');
    expect(hintFor(['carrot', 'apple']).id).toBe('carrot_salad');
  });
});

describe('what the hostesses say', () => {
  const say = lines as Record<string, { speaker: string }>;
  it('each names every product and tells a fact about it', () => {
    for (const host of ['yulia', 'olia'] as const) {
      const who = host === 'olia' ? 'olia' : 'babusia';
      for (const p of PRODUCTS) {
        expect(say[nameLine(host, p)]?.speaker, `${host} ${p}`).toBe(who);
        expect(say[factLine(host, p)]?.speaker, `${host} ${p}`).toBe(who);
      }
      expect(say[emptyLine(host)]?.speaker).toBe(who);
    }
  });
  it('Пупся says what is short and hints at every recipe', () => {
    for (const p of PRODUCTS) expect(say[missLine(p)]?.speaker, p).toBe('pupsia');
    for (const r of all) expect(say[hintLine(r)]?.speaker, r.id).toBe('pupsia');
    expect(say[OWN_PAGE.line]).toBeTruthy();
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
