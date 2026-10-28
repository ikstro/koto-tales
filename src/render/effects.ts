/**
 * Pooled visual effects: poof, sparkle, coin burst, ring, lightning.
 *
 * Particles are cubes in two InstancedMeshes (solid shaded, additive glow),
 * so any number of effects costs two draw calls. Lightning uses three pooled
 * bolts. One flash PointLight lives in the scene permanently at intensity 0,
 * so a strike never changes the light count (no shader recompiles).
 */
import * as THREE from 'three';

const SOLID_MAX = 320;
const GLOW_MAX = 260;
const BOLTS = 3;
const BOLT_SEGS = 16;
const BOLT_LIFE = 0.32;

class Pool {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  readonly pos: Float32Array;
  readonly vel: Float32Array;
  readonly col: Float32Array;
  /** life, max life, size0, size1, gravity, drag, twinkle, floorY */
  readonly p: Float32Array;
  private static readonly P = 8;

  constructor(
    readonly max: number,
    material: THREE.Material,
  ) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.p = new Float32Array(max * Pool.P);
  }

  spawn(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    color: THREE.Color,
    life: number,
    size0: number,
    size1: number,
    gravity = 0,
    drag = 0,
    twinkle = 0,
    floorY = -1e9,
  ): void {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.col.set([color.r, color.g, color.b], i * 3);
    this.p.set([0, life, size0, size1, gravity, drag, twinkle, floorY], i * Pool.P);
  }

  private kill(i: number): void {
    const last = --this.n;
    if (i === last) return;
    this.pos.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.vel.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.col.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.p.copyWithin(i * Pool.P, last * Pool.P, last * Pool.P + Pool.P);
  }

  update(dt: number, m: THREE.Matrix4, q: THREE.Quaternion, e: THREE.Euler, v: THREE.Vector3, s: THREE.Vector3, c: THREE.Color, time: number): void {
    const P = Pool.P;
    for (let i = this.n - 1; i >= 0; i--) {
      const o = i * P;
      this.p[o] += dt;
      if (this.p[o] >= this.p[o + 1]) this.kill(i);
    }
    for (let i = 0; i < this.n; i++) {
      const o = i * P;
      const k = i * 3;
      const drag = Math.exp(-this.p[o + 5] * dt);
      this.vel[k] *= drag;
      this.vel[k + 2] *= drag;
      this.vel[k + 1] = this.vel[k + 1] * drag + this.p[o + 4] * dt;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.pos[k + 1] < this.p[o + 7] && this.vel[k + 1] < 0) {
        this.pos[k + 1] = this.p[o + 7];
        this.vel[k + 1] *= -0.45;
        this.vel[k] *= 0.6;
        this.vel[k + 2] *= 0.6;
      }
      const t = this.p[o] / this.p[o + 1];
      let size = this.p[o + 2] + (this.p[o + 3] - this.p[o + 2]) * t;
      if (this.p[o + 6] > 0) size *= 0.55 + 0.45 * Math.abs(Math.sin(time * 14 + i * 1.7));
      v.set(this.pos[k], this.pos[k + 1], this.pos[k + 2]);
      s.setScalar(Math.max(0.0001, size));
      q.setFromEuler(e.set(t * 4 + i, t * 5 + i * 0.7, 0));
      this.mesh.setMatrixAt(i, m.compose(v, q, s));
      this.mesh.setColorAt(i, c.setRGB(this.col[k], this.col[k + 1], this.col[k + 2]));
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear(): void {
    this.n = 0;
    this.mesh.count = 0;
  }
}

interface Bolt {
  group: THREE.Group;
  core: THREE.InstancedMesh;
  glow: THREE.InstancedMesh;
  coreMat: THREE.MeshBasicMaterial;
  glowMat: THREE.MeshBasicMaterial;
  from: THREE.Vector3;
  to: THREE.Vector3;
  life: number;
  rejag: number;
}

export class Effects {
  readonly root = new THREE.Group();
  private solid: Pool;
  private glow: Pool;
  private bolts: Bolt[] = [];
  private flash: THREE.PointLight;
  private flashLeft = 0;
  private time = 0;
  private readonly tmp = {
    m: new THREE.Matrix4(),
    q: new THREE.Quaternion(),
    e: new THREE.Euler(),
    v: new THREE.Vector3(),
    s: new THREE.Vector3(),
    c: new THREE.Color(),
  };

  constructor(scene: THREE.Scene) {
    this.root.name = 'effects';
    this.solid = new Pool(SOLID_MAX, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x3a3a3a }));
    this.glow = new Pool(
      GLOW_MAX,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.glow.mesh.renderOrder = 10;
    this.root.add(this.solid.mesh, this.glow.mesh);

    const unit = new THREE.BoxGeometry(1, 1, 1);
    unit.translate(0, 0, 0.5);
    for (let i = 0; i < BOLTS; i++) {
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const glowMat = new THREE.MeshBasicMaterial({ color: 0x6fb8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const core = new THREE.InstancedMesh(unit, coreMat, BOLT_SEGS);
      const glow = new THREE.InstancedMesh(unit, glowMat, BOLT_SEGS);
      core.frustumCulled = glow.frustumCulled = false;
      core.renderOrder = glow.renderOrder = 11;
      const group = new THREE.Group();
      group.visible = false;
      group.add(glow, core);
      this.root.add(group);
      this.bolts.push({ group, core, glow, coreMat, glowMat, from: new THREE.Vector3(), to: new THREE.Vector3(), life: 0, rejag: 0 });
    }

    this.flash = new THREE.PointLight(0xcfe6ff, 0, 16, 1.2);
    this.root.add(this.flash);
    scene.add(this.root);
  }

  /** A puff of cubes around `at` (its centre), e.g. a defeated monster or a broken block. */
  poof(at: THREE.Vector3, color: THREE.ColorRepresentation = 0xffffff, count = 18): void {
    const base = new THREE.Color(color);
    const white = new THREE.Color(0xffffff);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.4 + Math.random() * 1.8;
      c.copy(base).lerp(white, Math.random() * 0.5);
      this.solid.spawn(
        at.x + Math.cos(a) * 0.15,
        at.y + (Math.random() - 0.5) * 0.6,
        at.z + Math.sin(a) * 0.15,
        Math.cos(a) * sp,
        0.8 + Math.random() * 1.6,
        Math.sin(a) * sp,
        c,
        0.5 + Math.random() * 0.3,
        0.16 + Math.random() * 0.1,
        0,
        1.2,
        3.5,
      );
    }
    for (let i = 0; i < Math.ceil(count / 3); i++) this.sparkleOne(at, base, 0.5, -0.3);
  }

  /** Twinkling bits rising, e.g. on a pickup. */
  sparkle(at: THREE.Vector3, color: THREE.ColorRepresentation = 0xfff176): void {
    const c = new THREE.Color(color);
    for (let i = 0; i < 12; i++) this.sparkleOne(at, c, 0.45);
  }

  private sparkleOne(at: THREE.Vector3, c: THREE.Color, r: number, y0 = -0.2): void {
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * r;
    this.glow.spawn(
      at.x + Math.cos(a) * d,
      at.y + y0 + Math.random() * 0.6,
      at.z + Math.sin(a) * d,
      Math.cos(a) * 0.3,
      0.6 + Math.random() * 0.8,
      Math.sin(a) * 0.3,
      c,
      0.6 + Math.random() * 0.5,
      0.09,
      0.02,
      0,
      1,
      1,
    );
  }

  /** Gold cubes fountain up from t and bounce on loorY (default: 0.6 below t). */
  coinBurst(at: THREE.Vector3, count = 10, floorY = at.y - 0.6): void {
    const gold = new THREE.Color(0xffc928);
    const light = new THREE.Color(0xfff1a8);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const sp = 0.9 + Math.random() * 0.8;
      this.solid.spawn(at.x, at.y, at.z, Math.cos(a) * sp, 3.6 + Math.random() * 1.6, Math.sin(a) * sp, i % 3 ? gold : light, 0.9 + Math.random() * 0.2, 0.13, 0.04, -13, 0.4, 0, floorY + 0.06);
    }
    for (let i = 0; i < 5; i++) this.sparkleOne(at, light, 0.35);
  }

  /** A flat ring of glowing cubes expanding outward, e.g. a hero ability or landing. */
  ring(at: THREE.Vector3, color: THREE.ColorRepresentation = 0x80d8ff, radius = 1.8): void {
    const c = new THREE.Color(color);
    const n = 30;
    const life = 0.45;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const sp = (radius - 0.3) / life;
      this.glow.spawn(at.x + Math.cos(a) * 0.3, at.y + 0.12, at.z + Math.sin(a) * 0.3, Math.cos(a) * sp, 0.4, Math.sin(a) * sp, c, life, 0.14, 0.04);
    }
  }

  /** A jagged bolt from `from` to `to` with a flash of light. */
  lightning(from: THREE.Vector3, to: THREE.Vector3): void {
    const b = this.bolts.reduce((best, x) => (x.life < best.life ? x : best), this.bolts[0]);
    b.from.copy(from);
    b.to.copy(to);
    b.life = BOLT_LIFE;
    b.rejag = 0;
    b.group.visible = true;
    this.jag(b);
    this.flash.position.copy(to).add(new THREE.Vector3(0, 1.5, 0));
    this.flashLeft = BOLT_LIFE;
    this.ring(to, 0xa8d8ff, 1.4);
    for (let i = 0; i < 8; i++) this.sparkleOne(to, new THREE.Color(0xe1f5fe), 0.4);
  }

  private jag(b: Bolt): void {
    const { m, q, v, s } = this.tmp;
    const dir = b.to.clone().sub(b.from);
    const len = dir.length();
    const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    const side2 = new THREE.Vector3().crossVectors(dir, side).normalize();
    const main = 11;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= main; i++) {
      const t = i / main;
      const p = b.from.clone().lerp(b.to, t);
      if (i > 0 && i < main) {
        const amp = Math.min(0.5, len * 0.06) * Math.sin(Math.PI * t) + 0.08;
        p.addScaledVector(side, (Math.random() * 2 - 1) * amp).addScaledVector(side2, (Math.random() * 2 - 1) * amp);
      }
      pts.push(p);
    }
    const segs: [THREE.Vector3, THREE.Vector3, number][] = [];
    for (let i = 0; i < main; i++) segs.push([pts[i], pts[i + 1], 1]);
    // one short branch
    const bi = 3 + Math.floor(Math.random() * 4);
    let a = pts[bi];
    for (let i = 0; i < 3 && segs.length < BOLT_SEGS; i++) {
      const nb = a
        .clone()
        .addScaledVector(dir, 0.07)
        .addScaledVector(side, (0.25 + Math.random() * 0.2) * (bi % 2 ? 1 : -1))
        .addScaledVector(side2, (Math.random() - 0.5) * 0.3);
      segs.push([a, nb, 0.6]);
      a = nb;
    }
    const fwd = new THREE.Vector3(0, 0, 1);
    segs.forEach(([p0, p1, w], i) => {
      const d = p1.clone().sub(p0);
      const l = d.length();
      q.setFromUnitVectors(fwd, d.normalize());
      v.copy(p0);
      b.core.setMatrixAt(i, m.compose(v, q, s.set(0.06 * w, 0.06 * w, l)));
      b.glow.setMatrixAt(i, m.compose(v, q, s.set(0.22 * w, 0.22 * w, l)));
    });
    b.core.count = b.glow.count = segs.length;
    b.core.instanceMatrix.needsUpdate = true;
    b.glow.instanceMatrix.needsUpdate = true;
  }

  update(dt: number): void {
    this.time += dt;
    const { m, q, e, v, s, c } = this.tmp;
    this.solid.update(dt, m, q, e, v, s, c, this.time);
    this.glow.update(dt, m, q, e, v, s, c, this.time);
    for (const b of this.bolts) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.rejag += dt;
      if (b.life <= 0) {
        b.group.visible = false;
        continue;
      }
      if (b.rejag > 0.07) {
        b.rejag = 0;
        this.jag(b);
      }
      const k = b.life / BOLT_LIFE;
      b.coreMat.opacity = Math.min(1, k * 1.6);
      b.glowMat.opacity = 0.75 * k;
    }
    if (this.flashLeft > 0) {
      this.flashLeft = Math.max(0, this.flashLeft - dt);
      const k = this.flashLeft / BOLT_LIFE;
      this.flash.intensity = 40 * k * k * (0.7 + 0.3 * Math.random());
    } else this.flash.intensity = 0;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.solid.clear();
    this.glow.clear();
    const geos = new Set<THREE.BufferGeometry>();
    const mats = new Set<THREE.Material>();
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      geos.add(mesh.geometry);
      mats.add(mesh.material as THREE.Material);
    });
    geos.forEach((g) => g.dispose());
    mats.forEach((mt) => mt.dispose());
  }
}
