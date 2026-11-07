/**
 * Будка: Сірко's kennel — a warm wooden house with a coral roof like the big
 * house, a dark doorway in a cream rim, a little paw print above it and his
 * coral bowl in front of the door (DESIGN.md «Home»): empty, breathing while he
 * is hungry and the party is near, or with the food he was given while he eats.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { DogFood } from '../content/pets';
import { CORAL, CORAL_DARK, CREAM, INK, MUSTARD, WOOD, WOOD_DARK } from './buildingParts';
import type { BuildingModel } from './buildings';
import { Kit } from './parts/kit';

export interface DoghouseModel extends BuildingModel {
  /** The bowl, in front of the doorway: its world position is where food drops and he eats. */
  bowl: THREE.Object3D;
  /** What lies in the bowl (null: empty) and how much of it is eaten, 0..1. */
  setBowl(food: DogFood | null, eaten?: number): void;
  /** The bowl breathes gently: he is hungry and the party is near. */
  setHungry(on: boolean): void;
}

/** The bowl's place in the model's own space (in front of the door, a little to the side). */
export const BOWL_AT = new THREE.Vector3(0.26, 0, 0.66);

export function createDoghouse(skin: Skin): DoghouseModel {
  const root = new THREE.Group();
  root.name = 'doghouse';
  const kit = new Kit('doghouse', skin);
  const p = kit.part('doghouse', root);
  // a base plate and wooden walls with plank lines and corner studs
  p.box([0.94, 0.06, 0.94], [0, 0.03, 0], WOOD_DARK);
  p.box([0.84, 0.52, 0.84], [0, 0.32, -0.02], WOOD);
  for (const y of [0.16, 0.36]) p.box([0.86, 0.02, 0.86], [0, y, -0.02], WOOD_DARK);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box([0.07, 0.56, 0.07], [sx * 0.42, 0.3, -0.02 + sz * 0.42], WOOD_DARK);
  // the dark doorway in a cream rim
  p.box([0.4, 0.36, 0.06], [0, 0.26, 0.36], INK);
  p.box([0.48, 0.05, 0.05], [0, 0.07, 0.38], CREAM);
  p.box([0.05, 0.42, 0.05], [-0.235, 0.26, 0.38], CREAM);
  p.box([0.05, 0.42, 0.05], [0.235, 0.26, 0.38], CREAM);
  // the paw print above the doorway: three toes and a pad, nothing to read
  p.box([0.11, 0.02, 0.11], [0, 0.48, 0.395], CREAM);
  for (const dx of [-0.08, 0, 0.08]) p.box([0.05, 0.02, 0.05], [dx, 0.545, 0.395], CREAM);
  // the coral roof: two slopes and a ridge cap, like the big house
  const slope = Math.atan2(0.3, 0.5);
  const L = Math.hypot(0.5, 0.3);
  p.box([L + 0.12, 0.08, 1.0], [-0.24, 0.72, -0.02], CORAL, [0, 0, slope]);
  p.box([L + 0.12, 0.08, 1.0], [0.24, 0.72, -0.02], CORAL, [0, 0, -slope]);
  p.box([0.18, 0.12, 1.04], [0, 0.86, -0.02], CORAL_DARK);
  p.done();

  // his bowl: a coral dish with a cream rim, dark inside while empty
  const bowl = new THREE.Group();
  bowl.name = 'bowl';
  bowl.position.copy(BOWL_AT);
  root.add(bowl);
  kit
    .part('bowl', bowl)
    .box([0.28, 0.05, 0.28], [0, 0.025, 0], CORAL_DARK)
    .box([0.26, 0.05, 0.26], [0, 0.07, 0], CORAL)
    .box([0.28, 0.02, 0.04], [0, 0.1, 0.12], CREAM)
    .box([0.28, 0.02, 0.04], [0, 0.1, -0.12], CREAM)
    .box([0.04, 0.02, 0.2], [0.12, 0.1, 0], CREAM)
    .box([0.04, 0.02, 0.2], [-0.12, 0.1, 0], CREAM)
    .box([0.18, 0.02, 0.18], [0, 0.092, 0], INK)
    .done();

  // what can lie in it, each a little toy built up front and hidden
  const foods = {} as Record<DogFood, THREE.Group>;
  const food = (id: DogFood, boxes: [[number, number, number], [number, number, number], string][]) => {
    const g = new THREE.Group();
    const b = kit.part(`food_${id}`, g);
    for (const [s, at, c] of boxes) b.box(s, at, c);
    b.done();
    g.position.y = 0.1;
    g.visible = false;
    bowl.add(g);
    foods[id] = g;
  };
  food('babusia_pie', [
    [[0.17, 0.06, 0.11], [0, 0.03, 0], MUSTARD],
    [[0.13, 0.025, 0.07], [0, 0.07, 0], '#f5c45a'],
    [[0.02, 0.012, 0.05], [-0.03, 0.088, 0], '#b77d1e'],
    [[0.02, 0.012, 0.05], [0.03, 0.088, 0], '#b77d1e'],
  ]);
  food('egg', [
    [[0.16, 0.02, 0.15], [0, 0.01, 0], '#fff7ea'],
    [[0.07, 0.035, 0.07], [0.01, 0.03, -0.01], '#ffc21a'],
  ]);
  food('carrot', [
    [[0.05, 0.05, 0.15], [0, 0.03, 0.01], '#f08a24'],
    [[0.035, 0.035, 0.04], [0, 0.03, 0.1], '#f5a04a'],
    [[0.04, 0.06, 0.04], [0, 0.05, -0.08], '#3fa142'],
  ]);
  food('apple', [
    [[0.1, 0.09, 0.1], [0, 0.045, 0], '#e53935'],
    [[0.02, 0.04, 0.02], [0, 0.11, 0], WOOD_DARK],
    [[0.04, 0.015, 0.025], [0.025, 0.12, 0], '#3fa142'],
  ]);

  let shown: DogFood | null = null;
  let hungry = false;
  let breathe = 0;
  let t = 0;
  return {
    root,
    bowl,
    setBowl(id, eaten = 0) {
      if (shown !== id) {
        if (shown) foods[shown].visible = false;
        shown = id;
      }
      if (!id) return;
      const g = foods[id];
      const s = 1 - 0.85 * Math.min(1, Math.max(0, eaten));
      g.visible = eaten < 1;
      g.scale.set(s, s, s);
    },
    setHungry(on) {
      hungry = on;
    },
    update(dt) {
      t += dt;
      breathe += ((hungry ? 1 : 0) - breathe) * (1 - Math.exp(-dt * 4));
      const s = 1 + breathe * 0.1 * (0.5 + 0.5 * Math.sin(t * 3.2));
      bowl.scale.set(s, 1 + breathe * 0.04 * Math.sin(t * 3.2), s);
    },
  };
}
