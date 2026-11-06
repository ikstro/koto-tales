/**
 * The water slide: a teal tower at the back with a mustard platform, a ladder up its back and two
 * little coral flags; a smooth blue trough with cream lips winds down it in an S on teal posts, water
 * glinting down it, into a small rounded pool in front (cream rim, blue floor, see-through water,
 * rings spreading where the slide ends, a floating coral swim ring). Needs no power: the water
 * always runs. `seats` are four spots in the pool; while `k.busy` each makes the round, a quarter
 * of a lap apart: out of the pool and round the side, up the ladder, down the slide, a splash, back
 * to its spot; `userData.face` is the heading. Origin at the floor centre of the 3×5 footprint,
 * front towards +Z; no lights.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CORAL, CORAL_DARK, CREAM, MINT, MUSTARD, TAU, TEAL } from './buildingParts';
import { Build, HP, finishShadows, fx, mergeCached, place, tint } from './villages';

const PLATFORM_Y = 2.66;
const RAIL_Y = 3.14;
const LADDER_Z = -2.36;
/** The trough: the inner half-width and depth, its wall, the feet's line under the path. */
const TROUGH_R = 0.36;
const TROUGH_D = 0.26;
const WALL = 0.06;
/** The pool: centre, half sizes, corner, rim height, the water's level. */
const POOL_Z = 1.38;
const POOL_W = 1.45;
const POOL_D = 1.07;
const POOL_R = 0.5;
const RIM_H = 0.24;
const WATER_Y = 0.18;

/** The lip's line of the slide, from the platform to the pool. */
const PATH: readonly (readonly [number, number, number])[] = [
  [0, PLATFORM_Y + TROUGH_D, -1.5],
  [0.06, 2.78, -1.14],
  [0.62, 2.34, -0.9],
  [0.8, 1.86, -0.42],
  [0.25, 1.5, -0.12],
  [-0.5, 1.12, 0.02],
  [-0.74, 0.8, 0.4],
  [-0.44, 0.56, 0.8],
  [-0.15, 0.46, 1.1],
];
const RINGS = 56;
/** Glints running down the trough, drops in a splash, rings on the water. */
const GLINTS = 10;
const DROPS = 12;
const RIPPLES = 3;
/** Where a splash lands. */
const SPLASH: readonly [number, number, number] = [-0.08, WATER_Y, 1.62];

const TROUGH_OUT = '#2f7fd6';
const TROUGH_IN = '#6cc6ee';
const TROUGH_MID = '#d6f6ff';
const POOL_FLOOR = '#4fb8e0';
const WATER = '#a6ecff';
const FOAM = '#f0fbff';

/** Spots the seats rest at in the pool (feet just over its floor) and how high those seats stand. */
const SEAT_UP = 0.4;
const FEET_Y = 0.02;
const REST: readonly (readonly [number, number])[] = [
  [-0.82, 1.82],
  [0.1, 1.98],
  [0.86, 1.1],
  [-0.9, 1.0],
];

const curve = new THREE.CatmullRomCurve3(PATH.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
const UP = new THREE.Vector3(0, 1, 0);

/** Sweeps the trough's cross-section along the path: inside, both lips and the outside as strips. */
let troughGeo: THREE.BufferGeometry | null = null;
function trough(): THREE.BufferGeometry {
  if (troughGeo) return troughGeo;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const P = new THREE.Vector3();
  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const U = new THREE.Vector3();
  const c = new THREE.Color();
  const arc = (r: number, d: number, from: number, to: number, n: number): [number, number][] => {
    const out: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const a = from + ((to - from) * i) / n;
      out.push([Math.cos(a) * r, Math.sin(a) * d]);
    }
    return out;
  };
  const R = TROUGH_R + WALL;
  const strip = (profile: [number, number][], paint: (f: number) => THREE.Color): void => {
    const base = pos.length / 3;
    const m = profile.length;
    for (let i = 0; i <= RINGS; i++) {
      const u = i / RINGS;
      curve.getPointAt(u, P);
      curve.getTangentAt(u, T);
      N.crossVectors(UP, T).normalize();
      U.crossVectors(T, N).normalize();
      profile.forEach(([a, b], j) => {
        pos.push(P.x + N.x * a + U.x * b, P.y + N.y * a + U.y * b, P.z + N.z * a + U.z * b);
        const k = paint(j / (m - 1));
        col.push(k.r, k.g, k.b);
      });
      if (i === RINGS) break;
      for (let j = 0; j < m - 1; j++) {
        const a = base + i * m + j;
        idx.push(a, a + m, a + m + 1, a, a + m + 1, a + 1);
      }
    }
  };
  const flat = (hex: string) => () => c.set(hex);
  const inside = new THREE.Color(TROUGH_IN);
  const middle = new THREE.Color(TROUGH_MID);
  strip(arc(TROUGH_R, TROUGH_D, Math.PI, TAU, 10), (f) => c.copy(inside).lerp(middle, Math.max(0, 1 - Math.abs(f - 0.5) * 3.2)));
  strip(
    [
      [TROUGH_R, 0],
      [TROUGH_R + WALL / 2, 0.03],
      [R, 0],
    ],
    flat(CREAM),
  );
  strip(arc(R, TROUGH_D + WALL, 0, -Math.PI, 10), flat(TROUGH_OUT));
  strip(
    [
      [-R, 0],
      [-TROUGH_R - WALL / 2, 0.03],
      [-TROUGH_R, 0],
    ],
    flat(CREAM),
  );
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return (troughGeo = g);
}

/** The bottom of the trough at `u` of the way down (where feet go) and its heading. */
function bottom(u: number, out: THREE.Vector3): number {
  curve.getPointAt(u, out);
  out.y -= TROUGH_D;
  const t = curve.getTangentAt(u);
  return Math.atan2(t.x, t.z);
}

interface Way {
  x: number;
  y: number;
  z: number;
  yaw: number;
  t: number;
}

/** The round a rider makes, feet line, in seconds: out of the pool, round the side, the ladder, the slide, the splash. */
function makeRound(): { ways: Way[]; lap: number; splash: number } {
  const ways: Way[] = [];
  let t = 0;
  const go = (x: number, y: number, z: number, dt: number, yaw = NaN): void => {
    t += dt;
    ways.push({ x, y, z, yaw, t });
  };
  go(1.2, FEET_Y, 0.9, 0);
  go(1.42, 0, 0.1, 0.8);
  go(1.42, 0, -2.3, 2.0);
  go(0.5, 0, -2.6, 0.7);
  go(0, 0, -2.6, 0.4, Math.PI);
  go(0, PLATFORM_Y, -2.6, 2.3, Math.PI);
  go(0, PLATFORM_Y, -2.15, 0.35, 0);
  go(0, PLATFORM_Y, -1.75, 0.3, 0);
  const p = new THREE.Vector3();
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const yaw = bottom(i / n, p);
    // it starts slow and gets going
    go(p.x, p.y, p.z, i ? (2.3 * (1.5 - i / n)) / n : 0.25, yaw);
  }
  go(SPLASH[0], FEET_Y, SPLASH[2], 0.4, 0);
  const splash = t;
  go(SPLASH[0], FEET_Y, SPLASH[2], 0.7, 0);
  // headings of the walking stretches: towards the next spot
  for (let i = 0; i < ways.length; i++) {
    if (!Number.isNaN(ways[i].yaw)) continue;
    const a = ways[i];
    const b = ways[Math.min(ways.length - 1, i + 1)];
    ways[i].yaw = Math.atan2(b.x - a.x, b.z - a.z);
  }
  return { ways, lap: t, splash };
}

/** The shortest way round from yaw a to yaw b, `f` of it. */
function turnTo(a: number, b: number, f: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * f;
}

const round = makeRound();

/** Where the rider is `u` seconds into the round: writes `out`, returns the heading. */
function roundAt(u: number, out: THREE.Vector3): number {
  const w = round.ways;
  let i = 1;
  while (i < w.length - 1 && w[i].t < u) i++;
  const a = w[i - 1];
  const b = w[i];
  const f = b.t > a.t ? Math.min(1, Math.max(0, (u - a.t) / (b.t - a.t))) : 1;
  out.set(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f);
  // a spot's heading is the way out of it: keep it, and turn only as the next spot comes near
  return turnTo(a.yaw, b.yaw, Math.max(0, (f - 0.7) / 0.3));
}

function roundedRect<T extends THREE.Path>(s: T, w: number, d: number, r: number): T {
  s.moveTo(-w + r, -d);
  s.lineTo(w - r, -d);
  s.absarc(w - r, -d + r, r, -HP, 0, false);
  s.lineTo(w, d - r);
  s.absarc(w - r, d - r, r, 0, HP, false);
  s.lineTo(-w + r, d);
  s.absarc(-w + r, d - r, r, HP, Math.PI, false);
  s.lineTo(-w, -d + r);
  s.absarc(-w + r, -d + r, r, Math.PI, Math.PI + HP, false);
  return s;
}

export function createWaterslide(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'waterslide';
  const b = new Build(skin, 'waterslide');
  root.add(b.root);

  // the tower: four posts, the platform, rails open at the ladder and the slide
  const backZ = -2.24;
  const frontZ = -1.46;
  for (const sx of [-1, 1]) {
    for (const z of [backZ, frontZ]) {
      b.box([0.14, RAIL_Y, 0.14], [sx * 0.54, RAIL_Y / 2, z], TEAL);
      b.box([0.26, 0.08, 0.26], [sx * 0.54, 0.04, z], CORAL);
    }
    b.box([0.08, 0.08, 0.8], [sx * 0.54, RAIL_Y, (backZ + frontZ) / 2], MINT);
    b.box([0.07, 0.07, 0.8], [sx * 0.54, PLATFORM_Y + 0.26, (backZ + frontZ) / 2], MINT);
    b.box([0.06, 0.08, 0.8], [sx * 0.54, 1.34, (backZ + frontZ) / 2], MINT);
    b.box([0.28, 0.08, 0.08], [sx * 0.42, RAIL_Y, backZ], MINT);
    // the flags on the back posts
    b.box([0.05, 0.62, 0.05], [sx * 0.54, RAIL_Y + 0.3, backZ], CREAM);
    b.box([0.28, 0.17, 0.03], [sx * 0.54 + 0.16, RAIL_Y + 0.52, backZ], CORAL);
    b.box([0.13, 0.09, 0.03], [sx * 0.54 + 0.36, RAIL_Y + 0.52, backZ], CORAL);
  }
  b.box([1.24, 0.08, 0.78], [0, PLATFORM_Y - 0.04, backZ + 0.35], MUSTARD);
  b.box([1.28, 0.05, 0.82], [0, PLATFORM_Y - 0.1, backZ + 0.35], '#c98f1c');
  b.box([1.1, 0.06, 0.06], [0, 1.34, frontZ], MINT);

  // the ladder
  for (const sx of [-1, 1]) b.box([0.07, RAIL_Y + 0.06, 0.07], [sx * 0.27, (RAIL_Y + 0.06) / 2, LADDER_Z], MUSTARD);
  for (let y = 0.3; y < PLATFORM_Y + 0.1; y += 0.3) b.box([0.54, 0.05, 0.06], [0, y, LADDER_Z], CORAL);

  // posts under the slide
  const p = new THREE.Vector3();
  for (const u of [0.26, 0.47, 0.66]) {
    curve.getPointAt(u, p);
    const top = p.y - TROUGH_D - WALL - 0.14;
    b.box([0.13, top, 0.13], [p.x, top / 2, p.z], TEAL);
    b.box([0.24, 0.08, 0.24], [p.x, 0.04, p.z], CORAL);
    b.box([0.26, 0.05, 0.26], [p.x, top - 0.02, p.z], MINT);
  }

  // the pool's floor and rim
  const rim = roundedRect(new THREE.Shape(), POOL_W, POOL_D, POOL_R);
  rim.holes.push(roundedRect(new THREE.Path(), POOL_W - 0.15, POOL_D - 0.15, POOL_R - 0.1));
  const flatOn = { rot: [-HP, 0, 0] as const };
  const ext = (s: THREE.Shape, h: number): THREE.BufferGeometry => new THREE.ExtrudeGeometry(s, { depth: h, curveSegments: 6, bevelEnabled: false });
  b.geo(ext(rim, RIM_H), [0, 0, POOL_Z], CREAM, flatOn);
  const band = roundedRect(new THREE.Shape(), POOL_W + 0.005, POOL_D + 0.005, POOL_R);
  band.holes.push(roundedRect(new THREE.Path(), POOL_W - 0.05, POOL_D - 0.05, POOL_R - 0.04));
  b.geo(ext(band, 0.1), [0, 0, POOL_Z], CORAL_DARK, flatOn);
  b.geo(ext(roundedRect(new THREE.Shape(), POOL_W - 0.1, POOL_D - 0.1, POOL_R - 0.06), 0.02), [0, 0, POOL_Z], POOL_FLOOR, flatOn);
  b.finish();

  const plastic = b.kit.vertexColourMaterial(false);
  const slide = new THREE.Mesh(trough(), plastic);
  slide.castShadow = true;
  root.add(slide);

  // the water, see-through
  const waterMat = skin.partMaterial(WATER, { transparent: true });
  const water = fx(new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(new THREE.Shape(), POOL_W - 0.12, POOL_D - 0.12, POOL_R - 0.08), 6).rotateX(-HP), waterMat));
  water.position.set(0, WATER_Y, POOL_Z);
  root.add(water);

  // the swim ring, bobbing
  const ringGeo = mergeCached('waterslide/ring', [
    tint(new THREE.TorusGeometry(0.26, 0.1, 8, 18).rotateX(HP), CORAL),
    ...[0, 1, 2, 3].map((i) => {
      const a = (i * TAU) / 4;
      return tint(place(new THREE.BoxGeometry(0.14, 0.205, 0.205), [Math.sin(a) * 0.26, 0, Math.cos(a) * 0.26], { rot: [0, a + HP, 0] }), CREAM);
    }),
  ]);
  const swimRing = new THREE.Mesh(ringGeo, plastic);
  swimRing.position.set(0.7, WATER_Y + 0.03, 1.72);
  swimRing.castShadow = true;
  root.add(swimRing);

  // what moves: the glints in the trough, the rings on the water, the splash
  const glints = fx(new THREE.InstancedMesh(new THREE.BoxGeometry(0.045, 0.015, 0.34), skin.partMaterial(FOAM), GLINTS));
  glints.frustumCulled = false;
  const ripples = fx(new THREE.InstancedMesh(new THREE.TorusGeometry(1, 0.035, 6, 24).rotateX(HP), skin.partMaterial(FOAM, { transparent: true }), RIPPLES));
  ripples.frustumCulled = false;
  const drops = fx(new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 8, 6), skin.partMaterial(FOAM), DROPS));
  drops.frustumCulled = false;
  drops.visible = false;
  root.add(glints, ripples, drops);
  const glintWay = new Float32Array(RINGS * 4);
  for (let i = 0; i < RINGS; i++) {
    const yaw = bottom(i / (RINGS - 1), p);
    glintWay.set([p.x, p.y + 0.03, p.z, yaw], i * 4);
  }

  const seats = REST.map(([x, z]) => {
    const s = new THREE.Object3D();
    s.name = 'seat';
    s.position.set(x, FEET_Y + SEAT_UP, z);
    s.userData.face = 0;
    root.add(s);
    return s;
  });

  finishShadows(root);
  glints.castShadow = ripples.castShadow = drops.castShadow = false;

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const r = new THREE.Vector3();
  const size = new THREE.Vector3();
  const quarter = round.lap / 4;
  /** The leaving and coming back into each seat's own spot take this long. */
  const BLEND = 0.6;
  let t = 0;
  let clock = -1;
  let splashAge = 9;
  let was = false;
  const rest = (i: number): void => {
    const [x, z] = REST[i];
    seats[i].position.set(x, FEET_Y + SEAT_UP + 0.015 * Math.sin(t * 1.6 + i * 1.7), z);
    seats[i].userData.face = 0;
  };
  return {
    root,
    seats,
    update(dt, k) {
      t += dt;
      swimRing.position.y = WATER_Y + 0.03 + 0.02 * Math.sin(t * 1.4);
      swimRing.rotation.y = t * 0.12;
      swimRing.rotation.z = 0.05 * Math.sin(t * 1.1);

      for (let i = 0; i < GLINTS; i++) {
        const j = Math.floor(((t * 0.32 + i / GLINTS) % 1) * (RINGS - 1)) * 4;
        const yaw = glintWay[j + 3];
        const side = ((i % 3) - 1) * 0.13;
        q.setFromAxisAngle(UP, yaw);
        v.set(glintWay[j] + Math.cos(yaw) * side, glintWay[j + 1] + Math.abs(side) * 0.3, glintWay[j + 2] - Math.sin(yaw) * side);
        glints.setMatrixAt(i, m4.compose(v, q, size.set(1, 1, 1)));
      }
      glints.instanceMatrix.needsUpdate = true;

      q.identity();
      for (let i = 0; i < RIPPLES; i++) {
        const a = (t * 0.45 + i / RIPPLES) % 1;
        const rad = 0.16 + a * 0.62;
        v.set(-0.12, WATER_Y + 0.008, 1.32);
        ripples.setMatrixAt(i, m4.compose(v, q, size.set(rad, 1 - a * 0.7, rad)));
      }
      ripples.instanceMatrix.needsUpdate = true;

      // the riders, a quarter of a lap apart; each starts from its own spot in turn
      const busy = !!k.busy;
      if (busy && !was) clock = 0;
      was = busy;
      if (busy) {
        const before = clock;
        clock += dt;
        for (let i = 0; i < seats.length; i++) {
          const u0 = before - i * quarter;
          const u1 = clock - i * quarter;
          if (u1 < 0) {
            rest(i);
            continue;
          }
          const u = u1 % round.lap;
          if (u0 >= 0 && u0 % round.lap < round.splash && u >= round.splash) splashAge = 0;
          const yaw = roundAt(u, v);
          const [x, z] = REST[i];
          const f = u < BLEND ? 1 - u / BLEND : u > round.lap - BLEND ? (u - round.lap + BLEND) / BLEND : 0;
          r.set(x, FEET_Y, z);
          v.lerp(r, f);
          seats[i].position.set(v.x, v.y + SEAT_UP, v.z);
          seats[i].userData.face = turnTo(yaw, 0, f);
        }
      } else {
        for (let i = 0; i < seats.length; i++) rest(i);
      }

      splashAge += dt;
      drops.visible = splashAge < 0.7;
      if (drops.visible) {
        const a = splashAge;
        for (let i = 0; i < DROPS; i++) {
          const dir = (i * TAU) / DROPS + 0.4;
          const out = 0.34 + 0.5 * (i % 3) * 0.5;
          const up = 2.3 + (i % 4) * 0.5;
          v.set(SPLASH[0] + Math.sin(dir) * out * a * 2, WATER_Y + Math.max(0, up * a - 5 * a * a), SPLASH[2] + Math.cos(dir) * out * a * 2);
          drops.setMatrixAt(i, m4.compose(v, q, size.setScalar(1 - a)));
        }
        drops.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
