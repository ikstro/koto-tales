import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CASTLE_KEPT, CASTLE_REACH } from '../content/castles';
import { TestSkin } from '../debug/testSkin';
import { RACES } from '../world/villages';
import { createCastle, createCastleItem, BALCONY, type CastleModel } from './castles';

/**
 * Where a hero can get to, by the physics' rules (src/actors/physics.ts): a body 1.45 tall needs two
 * free cells; it hops one block by itself when there are two free cells above the step and its own
 * jump (peak ≈ 1.35) has a third free cell overhead; it may drop down anywhere.
 */
function reach(c: CastleModel, gateShut: boolean, from: [number, number, number]): Set<string> {
  const solid = new Set(c.solid.map((p) => p.join(',')));
  if (gateShut) for (const p of c.gate) solid.add(p.join(','));
  const S = (x: number, y: number, z: number): boolean => y < 0 || solid.has(`${x},${y},${z}`);
  const stand = (x: number, y: number, z: number): boolean => !S(x, y, z) && !S(x, y + 1, z) && S(x, y - 1, z);
  const seen = new Set<string>();
  const q: [number, number, number][] = [from];
  seen.add(from.join(','));
  while (q.length) {
    const [x, y, z] = q.pop()!;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      if (Math.abs(nx) > 18 || nz < -22 || nz > 22) continue;
      let to: [number, number, number] | null = null;
      if (stand(nx, y, nz)) to = [nx, y, nz];
      else if (S(nx, y, nz) && stand(nx, y + 1, nz) && !S(x, y + 2, z)) to = [nx, y + 1, nz];
      else if (!S(nx, y, nz) && !S(nx, y + 1, nz)) {
        let yy = y - 1;
        while (yy >= 0 && !stand(nx, yy, nz)) yy--;
        if (yy >= 0) to = [nx, yy, nz];
      }
      if (!to) continue;
      const key = to.join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      q.push(to);
    }
  }
  return seen;
}

function triangles(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry;
    const tris = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    n += tris * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
  });
  return n;
}

function drawCalls(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) n++;
  });
  return n;
}

describe('castles', () => {
  const skin = new TestSkin();
  for (const race of RACES) {
    describe(race, () => {
      const c = createCastle(skin, race);
      const plaza: [number, number, number] = [0, 0, 8];

      it('keeps to its site and leaves the plaza free', () => {
        for (const [x, y, z] of [...c.solid, ...c.gate]) {
          expect(Math.abs(x)).toBeLessThanOrEqual(11);
          expect(z).toBeGreaterThanOrEqual(-14);
          expect(z).toBeLessThanOrEqual(4);
          expect(y).toBeGreaterThanOrEqual(0);
        }
        const solid = new Set(c.solid.map((p) => p.join(',')));
        for (const p of c.gate) expect(solid.has(p.join(','))).toBe(false);
      });

      it('a building set beside the castle can reach its socket', () => {
        const { side, front } = CASTLE_KEPT;
        // the nearest cell outside the kept ground, beside or in front
        const d = Math.min(side + 1 - Math.abs(c.socket.x), Math.hypot(Math.max(0, Math.abs(c.socket.x) - side), front + 1 - c.socket.z));
        expect(d).toBeLessThanOrEqual(CASTLE_REACH - 2);
      });

      it('climbs from the plaza to the top through the open gate', () => {
        const got = reach(c, false, plaza);
        const top = c.top;
        expect(got.has(`${top.x},${top.y},${top.z}`)).toBe(true);
      });

      it('lets nobody up while the gate is shut', () => {
        const got = [...reach(c, true, plaza)].map((s) => s.split(',').map(Number));
        expect(Math.max(...got.map(([, y]) => y))).toBeLessThanOrEqual(1);
      });

      it('has a balcony at ly 8 with 3×3 free round the chest', () => {
        const solid = new Set(c.solid.map((p) => p.join(',')));
        const { x, y, z } = c.chest;
        expect(y).toBe(BALCONY + 1);
        for (let dx = -1; dx <= 1; dx++)
          for (let dz = -1; dz <= 1; dz++) {
            expect(solid.has(`${x + dx},${BALCONY},${z + dz}`)).toBe(true);
            expect(solid.has(`${x + dx},${BALCONY + 1},${z + dz}`)).toBe(false);
            expect(solid.has(`${x + dx},${BALCONY + 2},${z + dz}`)).toBe(false);
          }
        const got = reach(c, false, plaza);
        expect(got.has(`${x},${y},${z}`)).toBe(true);
      });

      it('stays within its budget and animates', () => {
        const tris = triangles(c.root);
        const calls = drawCalls(c.root);
        console.log(`${race}: ${tris} triangles, ${calls} draw calls, ${c.solid.length} solid cells`);
        expect(tris).toBeLessThanOrEqual(60000);
        expect(calls).toBeLessThanOrEqual(40);
        for (const alive of [0, 0.5, 1]) c.update(1 / 30, { night: 0.7, alive, open: alive, on: true, low: false, beat: 0 });
        c.update(1 / 30, { night: 0, alive: 1, open: 1, on: true, low: true, beat: 1 });
      });
    });
  }

  it('makes the castle items', () => {
    for (const race of RACES) {
      const it2 = createCastleItem(skin, race);
      it2.update(0.1, { night: 0.5, on: false, low: false, beat: 0 });
      expect(it2.root.children.length).toBeGreaterThan(0);
    }
  });
});
