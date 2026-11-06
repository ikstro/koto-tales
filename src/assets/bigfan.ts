/**
 * The big fan: a drum fan in a fork on a long charcoal foot. A fat coral rim with a cream lip, a
 * cream grille of rings and spokes, a dark back, fat blue blades and a teal hub; three little
 * ribbons tied to the grille hang limp. Fed: the blades spin up, the ribbons stream out and flutter,
 * and thin pale gust streaks fly out in front as far as the wind reaches. Origin at the floor
 * centre of the 2×1 footprint, front towards +Z; no lights.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CHARCOAL, CORAL, CREAM, MINT, MUSTARD, SOLAR_BLUE_LIGHT, STEEL_DARK, TAU, TEAL, glowMaterial, powerBulb } from './buildingParts';
import { Build, HP, finishShadows, fx } from './villages';

const BACK = '#23403f';
const BLUE_TIP = '#7fc0ff';

/** The hub's height and the rim's radii. */
const HUB_Y = 1.12;
const R_OUT = 0.88;
const R_IN = 0.81;
const GRILLE_Z = 0.23;
const BLADES = 5;
const SPIN = 15;

const GUSTS = 16;
/** How far the streaks fly: the card's `blast.reach`. */
const REACH = 8;

/** A round ring in the XY plane. */
function ring(outer: number, inner: number): THREE.Shape {
  const s = new THREE.Shape();
  s.absarc(0, 0, outer, 0, TAU, false);
  const h = new THREE.Path();
  h.absarc(0, 0, inner, 0, TAU, true);
  s.holes.push(h);
  return s;
}

const extrude = (s: THREE.Shape, depth: number): THREE.BufferGeometry => new THREE.ExtrudeGeometry(s, { depth, curveSegments: 28, bevelEnabled: false });

/** One blade pointing up from the hub: a fat paddle, turned a little on its long axis. */
function blade(top: number, bottom: number, half: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-half * 0.4, bottom);
  s.quadraticCurveTo(-half * 1.2, (top + bottom) * 0.6, -half * 0.7, top - 0.05);
  s.quadraticCurveTo(0, top + 0.05, half * 0.7, top - 0.05);
  s.quadraticCurveTo(half * 1.2, (top + bottom) * 0.6, half * 0.4, bottom);
  s.lineTo(-half * 0.4, bottom);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.03, curveSegments: 6, bevelEnabled: false });
  g.translate(0, 0, -0.015);
  g.rotateY(0.38);
  return g;
}

/** A thin streak one unit long along Z, its tail fading to nothing. */
function streakGeo(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(0.04, 0.022, 1);
  const pos = g.getAttribute('position');
  const c = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = pos.getZ(i) > 0 ? 1 : 0;
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

let streak: THREE.BufferGeometry | null = null;

/** Where each streak leaves the fan, spread over the disc; fixed, so nothing is drawn at random. */
const GUST = Array.from({ length: GUSTS }, (_, i) => {
  const a = i * 2.39996;
  const r = 0.22 + 0.55 * Math.sqrt(((i * 0.618) % 1 + 0.05) / 1.05);
  return { x: Math.cos(a) * r, y: Math.sin(a) * r, life: 0.8 + 0.4 * ((i * 0.37) % 1), phase: (i * 0.73) % 1 };
});

export function createBigfan(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'bigfan';
  const b = new Build(skin, 'bigfan');
  root.add(b.root);

  // the foot and the fork that holds the drum
  b.box([1.96, 0.12, 0.86], [0, 0.06, 0], CHARCOAL);
  b.box([1.8, 0.08, 0.66], [0, 0.16, 0], TEAL);
  for (const s of [-1, 1]) {
    b.box([0.08, HUB_Y - 0.1, 0.22], [s * 0.94, (HUB_Y + 0.2) / 2, 0], TEAL);
    b.cyl(0.1, 0.06, [s * 0.95, HUB_Y, 0], MUSTARD, { rot: [0, 0, HP], seg: 14 });
    b.cyl(0.04, 0.1, [s * 0.89, HUB_Y, 0], STEEL_DARK, { rot: [0, 0, HP], seg: 8 });
  }

  // the junction box with the bulb, on the foot in front
  b.box([0.28, 0.22, 0.14], [0.72, 0.31, 0.33], CHARCOAL);
  b.box([0.3, 0.04, 0.16], [0.72, 0.44, 0.33], MUSTARD);

  // the drum: rim, lip, dark back, the motor behind it
  b.geo(extrude(ring(R_OUT, R_IN), 0.42), [0, HUB_Y, -0.2], CORAL);
  b.geo(extrude(ring(R_OUT + 0.012, R_IN - 0.012), 0.04), [0, HUB_Y, 0.2], CREAM);
  b.cyl(R_IN, 0.04, [0, HUB_Y, -0.16], BACK, { rot: [HP, 0, 0], seg: 28 });
  b.cyl(0.3, 0.2, [0, HUB_Y, -0.28], STEEL_DARK, { rot: [HP, 0, 0], seg: 16 });
  b.cyl(0.2, 0.06, [0, HUB_Y, -0.4], CORAL, { rot: [HP, 0, 0], seg: 14 });

  // the grille: rings and spokes, a badge in the middle
  for (const r of [0.3, 0.55]) b.geo(new THREE.TorusGeometry(r, 0.02, 6, 30), [0, HUB_Y, GRILLE_Z], CREAM);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.PI / 8;
    const c = Math.cos(a);
    const s = Math.sin(a);
    b.beam([c * 0.14, HUB_Y + s * 0.14, GRILLE_Z], [c * R_IN, HUB_Y + s * R_IN, GRILLE_Z], 0.034, CREAM);
  }
  b.cyl(0.15, 0.05, [0, HUB_Y, GRILLE_Z], TEAL, { rot: [HP, 0, 0], seg: 18 });
  b.cyl(0.07, 0.07, [0, HUB_Y, GRILLE_Z], CREAM, { rot: [HP, 0, 0], seg: 12 });

  // the blades turn on their own
  const rotor = new Build(skin, 'bigfan-rotor');
  rotor.root.position.set(0, HUB_Y, 0.03);
  for (let i = 0; i < BLADES; i++) {
    const a = (i / BLADES) * TAU;
    rotor.geo(blade(0.56, 0.08, 0.22).rotateZ(a), [0, 0, 0], SOLAR_BLUE_LIGHT);
    rotor.geo(blade(0.76, 0.56, 0.2).rotateZ(a), [0, 0, 0], i === 0 ? MUSTARD : BLUE_TIP);
  }
  rotor.cyl(0.14, 0.14, [0, 0, 0], STEEL_DARK, { rot: [HP, 0, 0], seg: 14 });
  rotor.finish();
  b.root.add(rotor.root);

  // three ribbons tied to the grille
  const ribbons = (
    [
      [-0.42, 0.34, CORAL],
      [0, 0.6, MUSTARD],
      [0.42, 0.34, MINT],
    ] as const
  ).map(([x, y, colour], i) => {
    const g = new THREE.Group();
    g.position.set(x, HUB_Y + y, GRILLE_Z + 0.02);
    b.root.add(g);
    const r = b.part(`ribbon${i}`, g);
    r.box([0.08, 0.05, 0.05], [0, 0, 0], CREAM);
    r.box([0.07, 0.24, 0.014], [0, -0.14, 0], colour);
    r.box([0.06, 0.24, 0.014], [0, -0.38, 0], colour);
    return g;
  });
  b.finish();

  // the wind: thin streaks, one instanced additive draw
  const gustMat = glowMaterial(0xeaf8ff, true);
  const gusts = new THREE.InstancedMesh((streak ??= streakGeo()), gustMat, GUSTS);
  gusts.frustumCulled = false;
  gusts.visible = false;
  // frames and sprites fit the fan, not the wind
  gusts.boundingBox = new THREE.Box3(new THREE.Vector3(-0.8, 0.3, 0.3), new THREE.Vector3(0.8, 1.9, 0.5));
  const white = new THREE.Color(1, 1, 1);
  for (let i = 0; i < GUSTS; i++) gusts.setColorAt(i, white);
  root.add(fx(gusts));

  const bulb = powerBulb(skin, b.root, [0.72, 0.31, 0.4]);
  finishShadows(root);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const col = new THREE.Color();
  let t = 0;
  let speed = 0;
  let wind = 0;
  return {
    root,
    socket: new THREE.Vector3(0.72, 0.46, 0.33),
    update(dt, k) {
      t += dt;
      const pw = k.power;
      bulb.update(t, pw);
      const live = !!pw?.on;
      speed += ((live ? SPIN : 0) - speed) * Math.min(1, dt * 1.6);
      rotor.root.rotation.z -= speed * dt;
      wind += ((live ? 1 : 0) - wind) * Math.min(1, dt * 2);

      for (let i = 0; i < ribbons.length; i++) {
        const r = ribbons[i];
        r.rotation.x = -wind * (1.25 + 0.16 * Math.sin(t * 17 + i * 2.1));
        r.rotation.z = wind * 0.14 * Math.sin(t * 11 + i * 1.3);
      }

      gusts.visible = wind > 0.03;
      if (!gusts.visible) return;
      gustMat.opacity = (0.34 + 0.3 * k.night) * wind;
      for (let i = 0; i < GUSTS; i++) {
        const g = GUST[i];
        const u = (t / g.life + g.phase) % 1;
        // they leave the drum, widen a little and sink towards the ground as they go
        const spread = 1 + u * 0.5;
        pos.set(g.x * spread, HUB_Y + g.y * spread - u * 0.45, 0.35 + u * (REACH - 0.6));
        scl.set(1, 1, 0.5 + u * 1.1);
        gusts.setMatrixAt(i, m4.compose(pos, q, scl));
        gusts.setColorAt(i, col.setScalar(Math.sin(u * Math.PI)));
      }
      gusts.instanceMatrix.needsUpdate = true;
      gusts.instanceColor!.needsUpdate = true;
    },
  };
}
