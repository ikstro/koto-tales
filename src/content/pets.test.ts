import { describe, expect, it } from 'vitest';
import { ITEMS } from './items';
import { DOG_FOOD, dogFind, dogFoodFrom, feedDog, feedFish, freshPets, isHungry, PETS } from './pets';
import { PRODUCTS } from './recipes';

describe('Сірко', () => {
  it('eats only dog-safe food the game has, her pie first, the apple last', () => {
    expect([...DOG_FOOD]).toEqual(['babusia_pie', 'egg', 'carrot', 'apple']);
    for (const id of DOG_FOOD) expect(ITEMS[id], id).toBeTruthy();
    expect(dogFoodFrom({ apple: 2, egg: 1 })).toBe('egg');
    expect(dogFoodFrom({ apple: 1, babusia_pie: 1 })).toBe('babusia_pie');
    expect(dogFoodFrom({ apple: 0, mushroom_brown: 3, cherry: 2 })).toBeNull();
    expect(dogFoodFrom({})).toBeNull();
  });

  it('is hungry from the morning until fed that day', () => {
    const p = freshPets();
    expect(isHungry(p, 0)).toBe(true);
    p.fedDay = 3;
    expect(isHungry(p, 3)).toBe(false);
    expect(isHungry(p, 4)).toBe(true);
  });

  it('is fed once a day, taking one thing the party carries', () => {
    const p = freshPets();
    const inv = { carrot: 2, apple: 1 };
    expect(feedDog(p, inv, 5)).toBe('carrot');
    expect(inv.carrot).toBe(1);
    expect(p.fedDay).toBe(5);
    expect(feedDog(p, inv, 5)).toBeNull();
    expect(inv.carrot).toBe(1);
    expect(feedDog(p, inv, 6)).toBe('carrot');
    expect(feedDog(p, inv, 7)).toBe('apple');
    expect(feedDog(p, inv, 8)).toBeNull();
    expect(p.fedDay).toBe(7);
  });

  it('brings 3–5 coins a little more often than a kitchen product, the same for the same day', () => {
    let coins = 0;
    const N = 2000;
    for (let d = 0; d < N; d++) {
      const f = dogFind(1234, d);
      expect(dogFind(1234, d)).toEqual(f);
      if (f.kind === 'coins') {
        coins++;
        expect(f.n).toBeGreaterThanOrEqual(3);
        expect(f.n).toBeLessThanOrEqual(5);
      } else expect(PRODUCTS).toContain(f.item);
    }
    expect(coins / N).toBeGreaterThan(0.5);
    expect(coins / N).toBeLessThan(0.6);
  });
});

describe('the fish', () => {
  it('give coins for the first feeding of a day only', () => {
    const p = freshPets();
    expect(feedFish(p, 2)).toBe(PETS.fishCoins);
    expect(feedFish(p, 2)).toBe(0);
    expect(feedFish(p, 3)).toBe(PETS.fishCoins);
  });
});
