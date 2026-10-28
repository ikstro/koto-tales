/**
 * Joint skeletons for the code-built rigs. Each function creates the named
 * pivots (origin = joint) in the standard hierarchy; character files then
 * hang boxes on them. Facing +Z, character's left = +X, feet at y = 0.
 */
import * as THREE from 'three';

const pivot = (name: string, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Group => {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  parent.add(g);
  return g;
};

export interface BipedDims {
  legH: number;
  hipX: number;
  bodyH: number;
  armX: number;
  shoulderY: number;
}

/** root > legL, legR, body > head, armL, armR (body pivot at the hips). */
export function bipedFrame(d: BipedDims) {
  const root = new THREE.Group();
  root.name = 'root';
  const legL = pivot('legL', d.hipX, d.legH, 0, root);
  const legR = pivot('legR', -d.hipX, d.legH, 0, root);
  const body = pivot('body', 0, d.legH, 0, root);
  const head = pivot('head', 0, d.bodyH, 0, body);
  const armL = pivot('armL', d.armX, d.shoulderY, 0, body);
  const armR = pivot('armR', -d.armX, d.shoulderY, 0, body);
  return { root, parts: { head, body, armL, armR, legL, legR } };
}

export interface QuadDims {
  legH: number;
  legX: number;
  /** z of the back hips (negative) and the front shoulders (positive). */
  backZ: number;
  frontZ: number;
  /** Head pivot relative to the body pivot. */
  head: [number, number, number];
  /** Tail pivot relative to the body pivot. */
  tail: [number, number, number];
  tailLen: number;
}

/** root > legBL, legBR, body (pivot at the back hips) > legFL, legFR, head, tail > tail2. */
export function quadFrame(d: QuadDims) {
  const root = new THREE.Group();
  root.name = 'root';
  const legBL = pivot('legBL', d.legX, d.legH, d.backZ, root);
  const legBR = pivot('legBR', -d.legX, d.legH, d.backZ, root);
  const body = pivot('body', 0, d.legH, d.backZ, root);
  const legFL = pivot('legFL', d.legX, 0, d.frontZ - d.backZ, body);
  const legFR = pivot('legFR', -d.legX, 0, d.frontZ - d.backZ, body);
  const head = pivot('head', ...d.head, body);
  const tail = pivot('tail', ...d.tail, body);
  const tail2 = pivot('tail2', 0, 0, -d.tailLen, tail);
  return { root, parts: { head, body, legFL, legFR, legBL, legBR, tail, tail2 } };
}

export interface SpiderDims {
  bodyY: number;
  head: [number, number, number];
  legX: number;
  /** z of the four leg pairs, front to back. */
  legZ: [number, number, number, number];
}

/** root > body > head, leg0..3 (left, front→back), leg4..7 (right, front→back). */
export function spiderFrame(d: SpiderDims) {
  const root = new THREE.Group();
  root.name = 'root';
  const body = pivot('body', 0, d.bodyY, 0, root);
  const head = pivot('head', ...d.head, body);
  const parts: Record<string, THREE.Object3D> = { body, head };
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? 1 : -1;
    parts[`leg${i}`] = pivot(`leg${i}`, side * d.legX, 0, d.legZ[i % 4], body);
  }
  return { root, parts };
}
