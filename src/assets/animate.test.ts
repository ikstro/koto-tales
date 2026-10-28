import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Rig } from '../contracts';
import { ACTION_TIME, animate } from './animate';

function bipedRig(): Rig {
  const root = new THREE.Group();
  const mk = (name: string, parent: THREE.Object3D, x = 0, y = 0) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, 0);
    parent.add(g);
    return g;
  };
  const legL = mk('legL', root, 0.1, 0.5);
  const legR = mk('legR', root, -0.1, 0.5);
  const body = mk('body', root, 0, 0.5);
  body.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.3)));
  const head = mk('head', body, 0, 0.5);
  const armL = mk('armL', body, 0.3, 0.4);
  const armR = mk('armR', body, -0.3, 0.4);
  armR.rotation.x = -1.3; // a zombie-like rest pose must be kept
  const tool = mk('tool', armL, 0, -0.4);
  const open = new THREE.MeshBasicMaterial();
  const closed = new THREE.MeshBasicMaterial();
  const eyeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), open);
  head.add(eyeMesh);
  return {
    type: 'biped',
    root,
    parts: { head, body, armL, armR, legL, legR, tool },
    height: 1.5,
    eyes: { mesh: eyeMesh, open, closed },
  };
}

const run = (m: { update(dt: number, s: number): void }, seconds: number, speed = 0) => {
  for (let t = 0; t < seconds; t += 1 / 60) m.update(1 / 60, speed);
};

describe('animate', () => {
  it('dt = 0 snaps straight to the pose', () => {
    const rig = bipedRig();
    const m = animate(rig);
    m.update(0, 0);
    expect(rig.parts.armR.rotation.x).toBeCloseTo(-1.3, 1);
    m.play('sleep');
    m.update(0, 0);
    expect(rig.root.rotation.x).toBeCloseTo(-Math.PI / 2, 5);
    expect(rig.eyes!.mesh.material).toBe(rig.eyes!.closed);
  });

  it('sleep holds until another action', () => {
    const rig = bipedRig();
    const m = animate(rig);
    m.update(0, 0);
    m.play('sleep');
    run(m, 10);
    expect(rig.root.rotation.x).toBeCloseTo(-Math.PI / 2, 2);
    expect(rig.eyes!.mesh.material).toBe(rig.eyes!.closed);
    m.play('idle');
    run(m, 3);
    expect(Math.abs(rig.root.rotation.x)).toBeLessThan(0.01);
  });

  it('one-shot actions return to idle by themselves', () => {
    for (const action of ['attack', 'cast', 'hurt', 'happy'] as const) {
      const rig = bipedRig();
      const m = animate(rig);
      m.update(0, 0);
      const rest = rig.parts.armL.rotation.x;
      m.play(action);
      run(m, ACTION_TIME[action] * 0.4);
      if (action === 'attack') expect(rig.parts.tool.visible).toBe(true);
      run(m, ACTION_TIME[action] + 1.5);
      expect(rig.root.visible).toBe(true);
      expect(rig.parts.tool.visible).toBe(false);
      expect(rig.root.position.length()).toBeLessThan(0.01);
      expect(Math.abs(rig.parts.armL.rotation.x - rest)).toBeLessThan(0.1);
      expect(Math.abs(rig.parts.armR.rotation.x + 1.3)).toBeLessThan(0.1);
    }
  });

  it('walk swings the legs with speed', () => {
    const rig = bipedRig();
    const m = animate(rig);
    m.update(0, 0);
    let maxSwing = 0;
    for (let i = 0; i < 120; i++) {
      m.update(1 / 60, 3);
      maxSwing = Math.max(maxSwing, Math.abs(rig.parts.legL.rotation.x));
    }
    expect(maxSwing).toBeGreaterThan(0.4);
  });
});
