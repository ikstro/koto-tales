/**
 * The piano path: a flat toy keyboard laid on the ground, eight wide cream keys side by side on a
 * charcoal plate with a mustard strip along the front and the back, black keys as low dark slabs on
 * the back half, and a small coloured stud at the front of each key that says which note is its own.
 * Heroes walk on it: a key under someone's feet sinks a little and lights up in its own warm colour,
 * then fades. Nothing stands higher than 0.1. Origin at the floor centre of the 8×2 footprint, front
 * towards +Z; key `i` covers x from −4 + i to −3 + i; the glow is additive, never a light.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CHARCOAL, MUSTARD, glowMaterial } from './buildingParts';
import { Kit } from './parts/kit';
import { HP, finishShadows, fx } from './villages';

const KEY_WHITE = '#fff4dc';
const KEY_BLACK = '#2a2523';

const KEYS = 8;
const LEFT = -KEYS / 2;
const KEY_W = 0.94;
const KEY_D = 1.84;
const KEY_H = 0.05;
/** The plate's top, a key's middle at rest, how far a key goes down. */
const PLATE = 0.03;
const KEY_Y = PLATE + KEY_H / 2;
const SINK = 0.04;
const STUD_Z = 0.68;
/** The keys a black slab stands after, as on a real keyboard (none after the third and the seventh). */
const BLACK_AFTER = [0, 1, 3, 4, 5];
/** The scale from the left: coral up through mustard, then the pinks. */
const NOTES = ['#ff5a3c', '#ff7f32', '#ffa52e', '#ffcf2e', '#ffb86a', '#ff8f7a', '#ff6f8e', '#f2558a'].map((c) => new THREE.Color(c));
const C_WHITE = new THREE.Color(KEY_WHITE);
const C_NONE = new THREE.Color(0, 0, 0);

const keyX = (i: number): number => LEFT + i + 0.5;

export function createPianopath(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'pianopath';
  const kit = new Kit('pianopath', skin);
  const p = kit.part('plate', root);
  p.box([KEYS, PLATE, 2], [0, PLATE / 2, 0], CHARCOAL);
  for (const s of [-1, 1]) p.box([KEYS, 0.055, 0.06], [0, 0.0275, s * 0.965], MUSTARD);
  for (const i of BLACK_AFTER) p.box([0.5, 0.07, 0.92], [LEFT + i + 1, PLATE + 0.035, -0.46], KEY_BLACK);
  p.done();

  // the keys, their studs and their glow: three instanced draws for all eight
  const plastic = skin.partMaterial(0xffffff);
  const keys = new THREE.InstancedMesh(new THREE.BoxGeometry(KEY_W, KEY_H, KEY_D), plastic, KEYS);
  const studs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.17, 0.17, 0.016, 18), plastic, KEYS);
  const glowMat = glowMaterial(0xffffff);
  glowMat.polygonOffset = true;
  glowMat.polygonOffsetFactor = -2;
  const glow = fx(new THREE.InstancedMesh(new THREE.PlaneGeometry(KEY_W - 0.04, KEY_D - 0.04).rotateX(-HP), glowMat, KEYS));
  glow.visible = false;
  root.add(keys, studs, glow);

  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  /** How far each key is down, 0..1. */
  const down = new Float32Array(KEYS);
  const place = (i: number): void => {
    const y = KEY_Y - SINK * down[i];
    keys.setMatrixAt(i, m4.makeTranslation(keyX(i), y, 0));
    studs.setMatrixAt(i, m4.makeTranslation(keyX(i), y + KEY_H / 2 + 0.008, STUD_Z));
    glow.setMatrixAt(i, m4.makeTranslation(keyX(i), y + KEY_H / 2 + 0.002, 0));
    keys.setColorAt(i, col.copy(C_WHITE).lerp(NOTES[i], down[i]));
    glow.setColorAt(i, col.copy(C_NONE).lerp(NOTES[i], down[i]));
  };
  for (let i = 0; i < KEYS; i++) {
    place(i);
    studs.setColorAt(i, NOTES[i]);
  }
  finishShadows(root);

  const local = new THREE.Vector3();
  return {
    root,
    update(dt, k) {
      // which keys have feet on them
      let under = 0;
      if (k.feet && k.feet.length) {
        root.updateWorldMatrix(true, false);
        for (const f of k.feet) {
          root.worldToLocal(local.copy(f));
          const i = Math.floor(local.x - LEFT);
          if (i >= 0 && i < KEYS && Math.abs(local.z) < 1 && Math.abs(local.y) < 0.7) under |= 1 << i;
        }
      }
      let moved = false;
      let lit = false;
      for (let i = 0; i < KEYS; i++) {
        const on = (under >> i) & 1;
        const was = down[i];
        // goes down at once, comes back and fades slowly
        let v = was + (on - was) * Math.min(1, dt * (on ? 30 : 6));
        if (v < 0.005) v = 0;
        if (v !== was) {
          down[i] = v;
          place(i);
          moved = true;
        }
        if (v > 0) lit = true;
      }
      glow.visible = lit;
      // the plastic shows the colour by day; the glow carries it through the night
      glowMat.opacity = 0.1 + 0.75 * k.night;
      if (!moved) return;
      keys.instanceMatrix.needsUpdate = true;
      keys.instanceColor!.needsUpdate = true;
      studs.instanceMatrix.needsUpdate = true;
      glow.instanceMatrix.needsUpdate = true;
      glow.instanceColor!.needsUpdate = true;
    },
  };
}
