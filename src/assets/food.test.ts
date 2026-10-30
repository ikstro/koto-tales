import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../content/buildings';
import { TestSkin } from '../debug/testSkin';
import type { Rig } from '../contracts';
import { animate } from './animate';
import { createBuilding, type BuildingTick, type PowerView } from './buildings';
import { createSnack, holdSnack } from './food';

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

const ON: PowerView = { linked: true, on: true, low: false, charge: 0, sunYaw: 0, sunUp: 0.3 };
const LOW: PowerView = { ...ON, on: false, low: true };
const tick = (extra: Partial<BuildingTick> = {}): BuildingTick => ({ beat: 0, playing: false, night: 0.4, ...extra });

/** A seat's world position and facing (yaw of its local +Z) with the building standing at the origin. */
function seatWorld(seat: THREE.Object3D): { at: THREE.Vector3; yaw: number } {
  seat.updateWorldMatrix(true, false);
  const at = seat.getWorldPosition(new THREE.Vector3());
  const f = new THREE.Vector3(0, 0, 1).transformDirection(seat.matrixWorld);
  return { at, yaw: Math.atan2(f.x, f.z) };
}

describe('food and fun buildings', () => {
  const skin = new TestSkin();
  for (const id of ['picnic', 'icecream', 'swings', 'station'] as const) {
    it(`${id}: builds within budget and animates`, () => {
      const b = createBuilding(skin, id);
      expect(b.root.name).toBe(id);
      const tris = triangles(b.root);
      const calls = drawCalls(b.root);
      console.log(`${id}: ${tris} triangles, ${calls} draw calls`);
      expect(tris).toBeLessThanOrEqual(5000);
      expect(calls).toBeLessThanOrEqual(12);
      for (let i = 0; i < 30; i++) b.update(1 / 30, tick({ power: ON, eat: i * 0.1, swing: [Math.sin(i), -Math.sin(i)] }));
      b.update(1 / 30, tick({ power: LOW }));
      b.update(1 / 30, tick());
    });
  }

  it('seats sit inside the footprint, at their surfaces, facing the food', () => {
    const inside = (id: 'picnic' | 'icecream' | 'swings', at: THREE.Vector3) => {
      const [w, d] = BUILDINGS[id].size;
      expect(Math.abs(at.x)).toBeLessThanOrEqual(w / 2);
      expect(Math.abs(at.z)).toBeLessThanOrEqual(d / 2);
    };
    const picnic = createBuilding(skin, 'picnic');
    expect(picnic.seats).toHaveLength(4); // one per hero
    for (const s of picnic.seats!) {
      const { at, yaw } = seatWorld(s);
      inside('picnic', at);
      expect(at.y).toBeGreaterThanOrEqual(0);
      expect(at.y).toBeLessThan(0.1);
      // facing the basket in the middle
      const toward = Math.atan2(-at.x, 0.3 - at.z);
      expect(Math.abs(Math.atan2(Math.sin(yaw - toward), Math.cos(yaw - toward)))).toBeLessThan(0.5);
    }

    const kiosk = createBuilding(skin, 'icecream');
    expect(kiosk.seats).toHaveLength(4); // three stools and the cat's cushion
    const ys = kiosk.seats!.map((s) => {
      const { at, yaw } = seatWorld(s);
      inside('icecream', at);
      expect(at.z).toBeGreaterThan(0); // the front row
      expect(Math.abs(Math.abs(yaw) - Math.PI)).toBeLessThan(0.01); // facing the counter (-Z)
      return at.y;
    });
    expect(ys[0]).toBeGreaterThan(0.4); // stools
    expect(ys[1]).toBeGreaterThan(0.4);
    expect(ys[2]).toBeGreaterThan(0.4);
    expect(ys[3]).toBeLessThan(0.1); // the cat on the ground
    expect(kiosk.socket).toBeDefined();
  });

  it('swings: the seats move with k.swing, forward is +Z', () => {
    const b = createBuilding(skin, 'swings');
    expect(b.seats).toHaveLength(2);
    b.update(0, tick());
    const rest = b.seats!.map((s) => seatWorld(s).at);
    for (const at of rest) {
      expect(Math.abs(at.x)).toBeLessThan(1);
      expect(at.y).toBeGreaterThan(0.3);
      expect(at.y).toBeLessThan(0.7);
      expect(Math.abs(at.z)).toBeLessThan(0.01);
    }
    b.update(0, tick({ swing: [0.6, -0.4] }));
    const a = seatWorld(b.seats![0]).at;
    const c = seatWorld(b.seats![1]).at;
    expect(a.z).toBeGreaterThan(1);
    expect(a.y).toBeGreaterThan(rest[0].y + 0.3);
    expect(c.z).toBeLessThan(-0.6);
    expect(a.x).toBeCloseTo(rest[0].x, 5);
    b.update(0, tick({ swing: undefined }));
    expect(seatWorld(b.seats![0]).at.distanceTo(rest[0])).toBeLessThan(1e-6);
  });

  it('the station: socket on top, steam rises', () => {
    const b = createBuilding(skin, 'station');
    expect(b.socket).toBeDefined();
    expect(b.socket!.y).toBeGreaterThan(3);
    expect(Math.abs(b.socket!.x)).toBeLessThan(1.5);
    expect(Math.abs(b.socket!.z)).toBeLessThan(1.5);
    expect(BUILDINGS.station.power?.arcs).toBe(true);
    let lights = 0;
    b.root.traverse((o) => {
      if ((o as THREE.Light).isLight) lights++;
    });
    expect(lights).toBe(0);
  });

  it('the big speaker turns gold at level 3, in place', () => {
    const b = createBuilding(skin, 'bigspeaker');
    const mats = () => {
      const s = new Set<THREE.Material>();
      b.root.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        if (m) s.add(m as THREE.Material);
      });
      return s;
    };
    b.update(0.1, tick({ power: ON }));
    const before = mats();
    const colours = [...before].map((m) => (m as THREE.MeshLambertMaterial).color?.getHexString());
    b.update(0.1, tick({ power: ON, level: 3 }));
    const after = mats();
    expect([...after]).toEqual([...before]);
    const now = [...after].map((m) => (m as THREE.MeshLambertMaterial).color?.getHexString());
    expect(now).not.toEqual(colours);
    b.update(0.1, tick({ power: ON, level: 1 }));
    expect([...mats()].map((m) => (m as THREE.MeshLambertMaterial).color?.getHexString())).toEqual(colours);
  });
});

describe('snacks', () => {
  const skin = new TestSkin();

  function biped(): Rig {
    const root = new THREE.Group();
    const mk = (name: string, parent: THREE.Object3D, x: number, y: number) => {
      const g = new THREE.Group();
      g.name = name;
      g.position.set(x, y, 0);
      parent.add(g);
      return g;
    };
    const legL = mk('legL', root, 0.1, 0.5);
    const legR = mk('legR', root, -0.1, 0.5);
    const body = mk('body', root, 0, 0.5);
    body.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.3).translate(0, 0.25, 0)));
    const head = mk('head', body, 0, 0.5);
    const armL = mk('armL', body, 0.3, 0.4);
    const armR = mk('armR', body, -0.3, 0.4);
    armR.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, 0.16).translate(0, -0.21, 0)));
    return { type: 'biped', root, parts: { head, body, armL, armR, legL, legR }, height: 1.5 };
  }

  function quad(): Rig {
    const root = new THREE.Group();
    const body = new THREE.Group();
    body.name = 'body';
    body.position.set(0, 0.3, -0.25);
    root.add(body);
    return { type: 'quadruped', root, parts: { body }, height: 1 };
  }

  it('every kind builds', () => {
    for (const kind of ['apple', 'icecream', 'fish'] as const) {
      const s = createSnack(kind, skin);
      const box = new THREE.Box3().setFromObject(s);
      expect(box.min.y).toBeGreaterThanOrEqual(-1e-6);
      expect(box.max.y).toBeLessThan(0.4);
    }
  });

  it('a biped holds it in the right hand; it comes to the face while eating', () => {
    const m = animate(biped());
    m.update(0, 0);
    const snack = holdSnack(m, 'apple', skin);
    let p: THREE.Object3D | null = snack;
    while (p && p.name !== 'armR') p = p.parent;
    expect(p?.name).toBe('armR');
    m.play('eat');
    let best = Infinity;
    for (let i = 0; i < 240; i++) {
      m.update(1 / 60, 0);
      m.root.updateMatrixWorld(true);
      const at = snack.getWorldPosition(new THREE.Vector3());
      const head = m.root.getObjectByName('head')!.getWorldPosition(new THREE.Vector3());
      best = Math.min(best, at.distanceTo(head));
    }
    expect(best).toBeLessThan(0.4);
    snack.removeFromParent();
    expect(m.root.getObjectByName('snack')).toBeUndefined();
  });

  it('a quadruped gets it on the ground in front', () => {
    const m = animate(quad());
    const snack = holdSnack(m, 'fish', skin);
    expect(snack.parent).toBe(m.root);
    expect(snack.position.y).toBe(0);
    expect(snack.position.z).toBeGreaterThan(0.4);
  });
});
