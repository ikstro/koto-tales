/**
 * The lightning rod: a very thin copper rod four blocks tall on a small stone foot, a copper spring
 * winding round its upper half and narrowing towards a copper ball on the top. A little charcoal box
 * on the foot carries the power bulb and the wire. For a second after the hero's lightning lands
 * (`k.pulse`) the ball and the spring flash warm white in a soft halo. Origin at the floor centre of
 * the 1×1 footprint, front towards +Z; glows are own emissive or additive, never lights.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import type { BuildingModel } from './buildings';
import { CHARCOAL, MUSTARD, TAU, powerBulb, setGlow } from './buildingParts';
import { Build, STONE, STONE_D, STONE_L, finishShadows, pool } from './villages';

const COPPER = '#c87533';
const COPPER_DARK = '#9a5424';
const COPPER_LIGHT = '#e09a55';
const C_COPPER = new THREE.Color(COPPER_LIGHT);
const C_FLASH = new THREE.Color('#fff2c0');

const ROD_TOP = 3.72;
const BALL_Y = 3.84;
const COIL_FROM = 1.5;
const COIL_TO = 3.4;
const COIL_TURNS = 7;
/** How long the flash lasts (seconds). */
const FLASH = 1;

/** The spring round the rod: wide at the bottom, close to the rod at the top. */
class Coil extends THREE.Curve<THREE.Vector3> {
  constructor() {
    super();
  }

  override getPoint(t: number, out = new THREE.Vector3()): THREE.Vector3 {
    const a = t * COIL_TURNS * TAU;
    const r = 0.14 - 0.08 * t;
    return out.set(Math.sin(a) * r, COIL_FROM + (COIL_TO - COIL_FROM) * t, Math.cos(a) * r);
  }
}

export function createLightningrod(skin: Skin): BuildingModel {
  const root = new THREE.Group();
  root.name = 'lightningrod';
  const b = new Build(skin, 'lightningrod');
  root.add(b.root);

  // the stone foot, in two steps
  b.box([0.66, 0.16, 0.66], [0, 0.08, 0], STONE_D);
  b.box([0.5, 0.14, 0.5], [0, 0.23, 0], STONE);
  b.box([0.3, 0.06, 0.3], [0, 0.33, 0], STONE_L);

  // the box on the foot, the wire knob on it
  b.box([0.3, 0.3, 0.1], [0, 0.17, 0.37], CHARCOAL);
  b.box([0.34, 0.05, 0.12], [0, 0.34, 0.37], MUSTARD);

  // the rod with its collars
  b.cyl(0.034, ROD_TOP - 0.34, [0, (ROD_TOP + 0.34) / 2, 0], COPPER, { seg: 8 });
  b.cyl(0.075, 0.1, [0, 0.42, 0], COPPER_DARK, { seg: 10 });
  for (const y of [1.0, 1.42]) b.cyl(0.06, 0.05, [0, y, 0], COPPER_DARK, { seg: 10 });
  b.cyl(0.07, 0.07, [0, ROD_TOP - 0.02, 0], MUSTARD, { seg: 10 });

  // the spring and the ball: plain copper until the flash
  b.glowGeo('coil', COPPER_LIGHT, new THREE.TubeGeometry(new Coil(), 110, 0.022, 5), [0, 0, 0]);
  b.glowBall('ball', COPPER_LIGHT, 0.15, [0, BALL_Y, 0]);
  const mats = b.finish();
  setGlow(mats.coil, C_COPPER, 0);
  setGlow(mats.ball, C_COPPER, 0);

  // a soft round fade turned to the fixed camera (a flat disc: no hard rim, as a ball of light has)
  const glow = pool(0xfff0c0, 1.0, [0, BALL_Y, 0]);
  // sprites and pictures are framed by the bounding box: on the toy, not on its flash
  glow.mesh.geometry.boundingBox = new THREE.Box3(new THREE.Vector3(-0.1, 0, -0.1), new THREE.Vector3(0.1, 0, 0.1));
  glow.mesh.rotation.x = Math.PI / 6;
  root.add(glow.mesh);

  const bulb = powerBulb(skin, b.root, [0, 0.17, 0.42]);
  finishShadows(root);
  const col = new THREE.Color();
  let t = 0;
  let flashing = false;
  return {
    root,
    socket: new THREE.Vector3(0, 0.38, 0.37),
    tip: new THREE.Vector3(0, BALL_Y + 0.15, 0),
    update(dt, k) {
      t += dt;
      bulb.update(t, k.power);
      const p = k.pulse;
      if (p !== undefined && p < FLASH) {
        flashing = true;
        const f = (1 - p / FLASH) ** 2;
        col.copy(C_COPPER).lerp(C_FLASH, Math.min(1, f * 2));
        setGlow(mats.ball, col, 1.8 * f);
        setGlow(mats.coil, col, 1.1 * f);
        glow.mesh.visible = true;
        glow.mat.opacity = 0.9 * f;
        glow.mesh.scale.setScalar(1 + 0.5 * (1 - f));
      } else if (flashing) {
        flashing = false;
        setGlow(mats.ball, C_COPPER, 0);
        setGlow(mats.coil, C_COPPER, 0);
        glow.mesh.visible = false;
      }
    },
  };
}
