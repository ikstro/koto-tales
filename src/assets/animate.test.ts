import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

function quadRig(): Rig {
  const root = new THREE.Group();
  const mk = (name: string, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };
  const legBL = mk('legBL', root, 0.1, 0.3, -0.25);
  const legBR = mk('legBR', root, -0.1, 0.3, -0.25);
  const body = mk('body', root, 0, 0.3, -0.25);
  const legFL = mk('legFL', body, 0.1, 0, 0.5);
  const legFR = mk('legFR', body, -0.1, 0, 0.5);
  const head = mk('head', body, 0, 0.25, 0.6);
  const tail = mk('tail', body, 0, 0.2, -0.05);
  tail.rotation.x = 0.85;
  const tail2 = mk('tail2', tail, 0, 0, -0.3);
  const open = new THREE.MeshBasicMaterial();
  const closed = new THREE.MeshBasicMaterial();
  const eyeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), open);
  head.add(eyeMesh);
  return {
    type: 'quadruped',
    root,
    parts: { head, body, legFL, legFR, legBL, legBR, tail, tail2 },
    height: 1,
    eyes: { mesh: eyeMesh, open, closed },
  };
}

const run = (m: { update(dt: number, s: number): void }, seconds: number, speed = 0) => {
  for (let t = 0; t < seconds; t += 1 / 60) m.update(1 / 60, speed);
};

describe('animate', () => {
  afterEach(() => vi.restoreAllMocks());
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
    for (const action of ['attack', 'cast', 'hurt', 'happy', 'wake', 'cheer'] as const) {
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

  it('wake gets up from sleep, stretches the arms high and shuts the eyes only for the yawn', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // first random blink only after ~5 s
    const rig = bipedRig();
    const m = animate(rig);
    m.update(0, 0);
    m.play('sleep');
    run(m, 1.2);
    m.play('wake');
    const eyesAt = (t: number) => {
      run(m, t);
      return rig.eyes!.mesh.material === rig.eyes!.closed;
    };
    expect(eyesAt(0.4)).toBe(false); // awake and opening the eyes (t = 0.4)
    run(m, 0.55); // t ≈ 0.95: stretch held, mid-yawn
    expect(Math.abs(rig.root.rotation.x)).toBeLessThan(0.05); // upright, no longer lying
    expect(rig.parts.armL.rotation.x).toBeLessThan(-2.3); // arms reached up
    expect(rig.eyes!.mesh.material).toBe(rig.eyes!.closed);
    expect(eyesAt(0.45)).toBe(false); // t ≈ 1.4: yawn over
  });

  it('cheer hops (root rises) with the arms up', () => {
    const rig = bipedRig();
    const m = animate(rig);
    m.update(0, 0);
    m.play('cheer');
    let maxY = 0;
    let minArm = 0;
    for (let t = 0; t < ACTION_TIME.cheer; t += 1 / 60) {
      m.update(1 / 60, 0);
      maxY = Math.max(maxY, rig.root.position.y);
      minArm = Math.min(minArm, rig.parts.armL.rotation.x);
    }
    expect(maxY).toBeGreaterThan(0.15);
    expect(minArm).toBeLessThan(-1.8);
  });

  it('quadruped: wake pitches into a stretch, cheer rears up, both settle back', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const rig = quadRig();
    const m = animate(rig);
    m.update(0, 0);
    const bodyRest = rig.parts.body.rotation.x;
    m.play('wake');
    run(m, 0.95);
    expect(rig.parts.body.rotation.x - bodyRest).toBeGreaterThan(0.2); // chest down
    expect(rig.parts.legFL.rotation.x).toBeLessThan(-0.6); // paws reach forward
    expect(rig.eyes!.mesh.material).toBe(rig.eyes!.closed);
    run(m, 1);
    m.play('cheer');
    run(m, 0.3);
    expect(rig.parts.body.rotation.x - bodyRest).toBeLessThan(-0.15); // front up
    expect(rig.root.position.y).toBeGreaterThan(0.1);
    run(m, 2);
    expect(Math.abs(rig.parts.body.rotation.x - bodyRest)).toBeLessThan(0.05);
    expect(rig.root.position.length()).toBeLessThan(0.02);
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
