import * as THREE from 'three';
import type { Skin } from '../contracts';
import { Kit } from './parts/kit';

/**
 * A log to sit on by the home campfire (DESIGN.md «Home»): a short toy log lying on two little
 * chocks, bark with darker ridges, light end grain with a ring, a stub with a leaf on top. Its
 * front (+Z) faces the fire. Three seats along it for the children (or a guest), and a spot on the
 * ground at its end for Пупся (the last seat, as at every food place).
 */

const BARK = '#7b5232';
const BARK_D = '#5f3f25';
const GRAIN = '#e3bf86';
const RING = '#c08d55';
const LEAF = '#3fa142';

const LEN = 1.9;
/** The seat surface: hips sit here. */
export const LOG_SEAT_Y = 0.46;

export interface CampfireLog {
  root: THREE.Group;
  /** Three seats along the log, left to right, then Пупся's spot on the ground at its end. */
  seats: THREE.Object3D[];
}

function seatAt(parent: THREE.Object3D, x: number, y: number, z: number): THREE.Object3D {
  const s = new THREE.Object3D();
  s.name = 'seat';
  s.position.set(x, y, z);
  parent.add(s);
  return s;
}

export function createCampfireLog(skin: Skin, flip = false): CampfireLog {
  const root = new THREE.Group();
  root.name = 'campfire-log';
  const p = new Kit(flip ? 'campfire-log-f' : 'campfire-log', skin).part('log', root);
  const y = 0.25;
  // a rough round section: two crossed boxes and four bevels
  p.box([LEN, 0.34, 0.46], [0, y, 0], BARK);
  p.box([LEN, 0.42, 0.36], [0, y, 0], BARK);
  for (const [sy, sz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const) {
    p.box([LEN - 0.02, 0.1, 0.1], [0, y + sy * 0.16, sz * 0.16], BARK, [Math.PI / 4, 0, 0]);
  }
  // darker bark ridges along the top and the front
  for (const [dy, dz, w] of [
    [0.212, -0.08, 1.2],
    [0.212, 0.1, 0.8],
    [0.05, 0.232, 1.4],
    [-0.06, 0.232, 0.9],
  ] as const) {
    p.box([w, 0.03, 0.03], [(flip ? -1 : 1) * (LEN - w) * 0.25, y + dy, dz], BARK_D);
  }
  // end grain: light wood with a ring and a heart
  for (const s of [-1, 1]) {
    const x = s * (LEN / 2 + 0.005);
    p.box([0.02, 0.36, 0.38], [x, y, 0], GRAIN);
    p.box([0.026, 0.24, 0.26], [x, y, 0], RING);
    p.box([0.032, 0.17, 0.19], [x, y, 0], GRAIN);
    p.box([0.038, 0.06, 0.06], [x, y, 0], RING);
  }
  // two chocks so it does not roll
  for (const s of [-1, 1]) p.box([0.16, 0.08, 0.5], [s * 0.62, 0.04, 0], BARK_D);
  // a stub with a leaf, at the back where nobody sits on it
  const sx = (flip ? 1 : -1) * 0.78;
  p.box([0.1, 0.16, 0.1], [sx, y + 0.24, -0.12], BARK, [0.3, 0, 0]);
  p.box([0.16, 0.03, 0.09], [sx + 0.08, y + 0.33, -0.17], LEAF, [0.2, 0.5, 0.3]);
  p.done();
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  root.userData.casts = true;
  const end = (flip ? -1 : 1) * (LEN / 2 + 0.42);
  const seats = [seatAt(root, -0.6, LOG_SEAT_Y, 0.02), seatAt(root, 0, LOG_SEAT_Y, 0.02), seatAt(root, 0.6, LOG_SEAT_Y, 0.02), seatAt(root, end, 0, 0.2)];
  return { root, seats };
}
