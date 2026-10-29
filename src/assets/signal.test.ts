import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../content/buildings';
import { TestSkin } from '../debug/testSkin';
import { createBuilding, type PowerView } from './buildings';
import { SHOW_LENGTH, showColour, showLevel } from './buildingParts';

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

describe('signal buildings', () => {
  const skin = new TestSkin();
  for (const id of ['wifi', 'transmitter', 'radar'] as const) {
    it(`${id}: builds within budget and animates`, () => {
      const b = createBuilding(skin, id);
      expect(b.root.name).toBe(id);
      expect(b.socket).toBeDefined();
      const tris = triangles(b.root);
      const calls = drawCalls(b.root);
      console.log(`${id}: ${tris} triangles, ${calls} draw calls`);
      expect(tris).toBeLessThanOrEqual(3000);
      expect(calls).toBeLessThanOrEqual(6);
      for (let i = 0; i < 30; i++) b.update(1 / 30, { beat: i / 15, playing: false, night: 0.7, power: ON, show: i * 0.5 });
      b.update(1 / 30, { beat: 0, playing: false, night: 0, power: LOW });
      b.update(1 / 30, { beat: 0, playing: false, night: 0 });
    });
  }

  it('the cards carry their uses', () => {
    expect(BUILDINGS.wifi.signal).toEqual({ zone: 12 });
    expect(BUILDINGS.transmitter.jump).toBe(true);
    expect(BUILDINGS.transmitter.solid).toEqual([]);
    expect(BUILDINGS.radar.scan).toEqual({ radius: 48 });
    expect(BUILDINGS.radar.power?.take).toBe(2);
  });

  it('the show reacts on the lights and speakers', () => {
    for (const id of ['lamp', 'garland', 'discoball', 'boombox', 'bigspeaker'] as const) {
      const b = createBuilding(skin, id);
      b.root.position.set(5, 0, 3);
      for (let i = 0; i <= 24; i++) b.update(0.5, { beat: i, playing: i % 2 === 0, night: 0.8, power: ON, show: i < 22 ? i : undefined });
    }
    expect(showLevel(undefined)).toBe(0);
    expect(showLevel(SHOW_LENGTH)).toBe(0);
    expect(showLevel(5)).toBe(1);
    const a = showColour(0, 0, new THREE.Color());
    const b = showColour(1.2, 0, new THREE.Color());
    expect(a.equals(b)).toBe(false);
  });
});
