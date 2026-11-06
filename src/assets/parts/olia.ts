/**
 * Оля, the second hostess, a kind scientist who knows every insect: a tall slim toy figure with
 * short neat chestnut hair parted softly on her left, big open eyes and a warm smile. A navy
 * sweater with the sleeves pushed up, a white-and-navy scarf knotted at the neck, blue jeans, dark
 * walking shoes, a plain black watch on the left wrist. On her chest hangs a round magnifying glass
 * on a thin cord, gold rim and pale blue glass: her sign. On her left shoulder sits a small
 * butterfly (`butterfly`) in mustard and coral; its wings `wingL`, `wingR` hinge along its body, so
 * opposite turns about Z flap them. Her arms bend at the elbow (`foreL`, `foreR`, straight at rest).
 * Hidden parts the game can show: a cup (`cup`) and a held magnifying glass (`glass`) in the right
 * hand, an open notebook (`notebook`) in the left and a pencil (`pencil`) in the right. Each is
 * built level for a hanging arm: turn it against the arm's bend to keep it so.
 */
import * as THREE from 'three';
import type { Rig, Skin } from '../../contracts';
import { POLE } from '../../content/babusia';
import { OLIA_FACE, faceAtlas, type FaceSpec } from '../faces';
import { bipedFrame } from './frames';
import { Kit, type PartBuilder, type V3 } from './kit';

export const face: FaceSpec = OLIA_FACE;

const SKIN = face.swatches[0];
const SWEATER = '#27406e';
const RIB = '#1d3157';
const SCARF = '#f7f3e8';
const SCARF_STRIPE = '#27406e';
const JEANS = '#4a7fc0';
const JEANS_SEAM = '#3a6aa6';
const SHOES = '#37302e';
const SOLES = '#8f7458';
const WATCH = '#121014';
const WATCH_DIAL = '#e9e6dc';
const GOLD = '#eab02b';
const GLASS = '#6fb8e6';
const GLINT = '#ffffff';
const HANDLE = '#6b4226';
const CORD = '#ffe3a3';
const WING_FORE = '#ffd23a';
const WING_HIND = '#e8583f';
const WING_SPOT = '#e0583f';
const BUG = '#4a2c14';
const CUP = '#f3ead6';
const CUP_SHADE = '#d9cdb2';
const TEA = '#c98a4a';
const PAGE = '#fbf6e8';
const COVER = '#2f918b';
const WRITING = '#8a7a66';
const PENCIL = '#eab02b';
const PENCIL_TIP = '#4a2c14';
const ERASER = '#ee6a82';

/** A round disc of thin rows in the plane through `c`, turned back by `tilt` from facing +Z. */
function disc(b: PartBuilder, c: V3, r: number, thick: number, paint: string, tilt: number): void {
  const rows = 9;
  const h = (r * 2) / rows;
  for (let i = 0; i < rows; i++) {
    const y = -r + (i + 0.5) * h;
    const w = 2 * Math.sqrt(r * r - y * y);
    b.box([w, h + 0.002, thick], [c[0], c[1] + y * Math.cos(tilt), c[2] - y * Math.sin(tilt)], paint, [-tilt, 0, 0]);
  }
}

/**
 * A magnifying glass in the plane through `c`, turned back by `tilt` from facing +Z: a gold rim,
 * pale blue glass with a glint, a short handle leaving the rim at angle `grip`.
 */
function magnifier(b: PartBuilder, c: V3, r: number, tilt: number, grip: number, handle: number): void {
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  const at = (a: number, rad: number, lift = 0): V3 => {
    const x = Math.cos(a) * rad;
    const y = Math.sin(a) * rad;
    return [c[0] + x, c[1] + y * cos + lift * sin, c[2] - y * sin + lift * cos];
  };
  disc(b, c, r + 0.036, 0.03, GOLD, tilt);
  disc(b, c, r, 0.04, GLASS, tilt);
  b.beam(at(2.2, r * 0.66, 0.022), at(1.5, r * 0.66, 0.022), 0.03, GLINT, 0.008);
  b.beam(at(grip, r + 0.02), at(grip, r + 0.06), 0.05, GOLD);
  b.beam(at(grip, r + 0.06), at(grip, r + 0.06 + handle), 0.052, HANDLE);
}

export function build(skin: Skin): Rig {
  const kit = new Kit('olia', skin, faceAtlas('olia'));
  const { root, parts } = bipedFrame({ legH: 0.67, hipX: 0.1, bodyH: 0.57, armX: 0.29, shoulderY: 0.46 });

  for (const leg of [parts.legL, parts.legR]) {
    kit
      .part(leg.name, leg)
      .box([0.17, 0.59, 0.19], [0, -0.28, 0], JEANS)
      .box([0.175, 0.04, 0.195], [0, -0.55, 0], JEANS_SEAM)
      .box([0.18, 0.08, 0.27], [0, -0.605, 0.03], SHOES)
      .box([0.185, 0.03, 0.275], [0, -0.655, 0.03], SOLES)
      .done();
  }

  const chest = kit
    .part('body', parts.body)
    .box([0.42, 0.46, 0.25], [0, 0.27, 0], SWEATER)
    .box([0.44, 0.07, 0.27], [0, 0.035, 0], RIB)
    // the scarf: a thick wrap that stands out past the chin, so it shows from above
    .box([0.46, 0.1, 0.5], [0, 0.545, 0.02], SCARF)
    .box([0.47, 0.03, 0.51], [0, 0.545, 0.02], SCARF_STRIPE)
    // its knot, proud of the wrap, and two tails falling over the chest on her right
    .box([0.14, 0.09, 0.09], [-0.1, 0.5, 0.29], SCARF)
    .box([0.145, 0.025, 0.095], [-0.1, 0.5, 0.29], SCARF_STRIPE)
    .box([0.1, 0.25, 0.03], [-0.145, 0.365, 0.215], SCARF, [0.38, 0, -0.1])
    .box([0.105, 0.03, 0.034], [-0.157, 0.29, 0.187], SCARF_STRIPE, [0.38, 0, -0.1])
    .box([0.085, 0.17, 0.03], [-0.055, 0.405, 0.23], SCARF, [0.38, 0, 0.1])
    // the cord from under the scarf down to the glass
    .beam([0.02, 0.47, 0.19], [0.08, 0.35, 0.17], 0.018, CORD)
    .beam([0.16, 0.47, 0.19], [0.08, 0.35, 0.17], 0.018, CORD);
  chest.done();
  // its own piece: while she holds the glass in her hand it is not on her chest
  const pendant = new THREE.Group();
  pendant.name = 'pendant';
  parts.body.add(pendant);
  const worn = kit.part('pendant', pendant);
  magnifier(worn, [0.08, 0.235, 0.19], 0.092, 0.5, -Math.PI / 2 - 0.3, 0.08);
  worn.done();

  const hair = { s: 1 };
  const shade = { s: 2 };
  const light = { s: 4 };
  kit
    .part('head', parts.head)
    .box([0.5, 0.46, 0.44], [0, 0.23, 0], { s: 0, face: true })
    .box([0.05, 0.1, 0.09], [0.265, 0.24, 0.02], { s: 3 })
    .box([0.05, 0.1, 0.09], [-0.265, 0.24, 0.02], { s: 3 })
    // a smooth neat cap: each step up has its corners cut, so from above the crown is round
    .box([0.54, 0.04, 0.49], [0, 0.45, -0.005], hair)
    .box([0.52, 0.05, 0.38], [0, 0.495, -0.01], hair)
    .box([0.4, 0.05, 0.47], [0, 0.495, -0.01], hair)
    .box([0.42, 0.04, 0.3], [0, 0.54, -0.01], hair)
    .box([0.3, 0.04, 0.39], [0, 0.54, -0.01], hair)
    // the back and the sides, cut short above the collar
    .box([0.54, 0.36, 0.06], [0, 0.28, -0.24], hair)
    .box([0.06, 0.16, 0.46], [0.27, 0.4, -0.01], hair)
    .box([0.06, 0.16, 0.46], [-0.27, 0.4, -0.01], hair)
    .box([0.07, 0.2, 0.17], [0.27, 0.24, -0.135], hair)
    .box([0.07, 0.2, 0.17], [-0.27, 0.24, -0.135], hair)
    // the soft parting on her left, stepping from the crown down to the hairline
    .box([0.024, 0.006, 0.35], [0.09, 0.561, 0.01], shade)
    .box([0.024, 0.006, 0.05], [0.09, 0.521, 0.205], shade)
    .box([0.024, 0.006, 0.03], [0.09, 0.471, 0.24], shade)
    .box([0.024, 0.04, 0.006], [0.09, 0.455, 0.256], shade)
    // lighter strands combed away from the parting: seen from above the crown reads as hair
    .box([0.24, 0.006, 0.03], [-0.05, 0.561, 0.09], light, [0, 0.12, 0])
    .box([0.24, 0.006, 0.03], [-0.05, 0.561, -0.03], light, [0, -0.06, 0])
    .box([0.2, 0.006, 0.03], [-0.04, 0.561, -0.13], light, [0, -0.16, 0])
    .box([0.1, 0.006, 0.03], [0.15, 0.561, 0.05], light, [0, -0.1, 0])
    .box([0.1, 0.006, 0.03], [0.15, 0.561, -0.08], light, [0, 0.1, 0])
    // the fringe falls from the parting: long and low to her right, short and high to her left
    .box([0.42, 0.085, 0.04], [-0.09, 0.43, 0.235], hair, [0, 0, 0.19])
    .box([0.18, 0.05, 0.04], [0.185, 0.44, 0.235], hair, [0, 0, -0.2])
    .done();

  // the arm: the upper part here, the forearm with the pushed-up cuff, wrist and hand on its own
  // joint; the two overlap at the elbow so a bent arm shows no gap
  const forearm = (arm: THREE.Object3D, name: string): THREE.Group => {
    kit.part(arm.name, arm).box([0.15, 0.25, 0.17], [0, -0.085, 0], SWEATER).done();
    const fore = new THREE.Group();
    fore.name = name;
    fore.position.set(0, -POLE.upper, 0);
    arm.add(fore);
    const b = kit
      .part(name, fore)
      .box([0.15, 0.14, 0.17], [0, -0.02, 0], SWEATER)
      .box([0.155, 0.04, 0.175], [0, -0.09, 0], RIB)
      .box([0.115, 0.1, 0.13], [0, -0.15, 0], SKIN)
      .box([0.125, 0.12, 0.14], [0, -POLE.fore - 0.015, 0], SKIN);
    if (arm === parts.armL) addWatch(b);
    b.done();
    return fore;
  };
  const foreL = forearm(parts.armL, 'foreL');
  const foreR = forearm(parts.armR, 'foreR');

  const { butterfly, wingL, wingR } = addButterfly(kit, parts.body);
  const cup = addCup(kit, foreR);
  const glass = addGlass(kit, foreR);
  const notebook = addNotebook(kit, foreL);
  const pencil = addPencil(kit, foreR);

  return {
    type: 'biped',
    root,
    parts: { ...parts, foreL, foreR, butterfly, wingL, wingR, cup, glass, notebook, pencil },
    height: 1.8,
    eyes: kit.eyes,
  };
}

/** A plain black watch on the bare left wrist, a small pale dial on the outer side. */
function addWatch(b: PartBuilder): void {
  const y = -0.145;
  b.box([0.135, 0.06, 0.15], [0, y, 0], WATCH)
    .box([0.016, 0.085, 0.095], [0.07, y, 0], WATCH)
    .box([0.01, 0.055, 0.065], [0.078, y, 0], WATCH_DIAL);
}

/**
 * The butterfly on her left shoulder, looking forward and a little out, wings half open. Its own frame:
 * the body along Z, `wingL` to +X, `wingR` to -X, each hinged on the body.
 */
function addButterfly(kit: Kit, body: THREE.Object3D): Record<'butterfly' | 'wingL' | 'wingR', THREE.Group> {
  const butterfly = new THREE.Group();
  butterfly.name = 'butterfly';
  butterfly.position.set(0.335, 0.535, 0.05);
  butterfly.rotation.y = 0.5;
  body.add(butterfly);
  kit
    .part('butterfly', butterfly)
    .box([0.032, 0.035, 0.17], [0, 0, 0], BUG)
    .beam([0.012, 0.01, 0.08], [0.05, 0.05, 0.14], 0.012, BUG)
    .beam([-0.012, 0.01, 0.08], [-0.05, 0.05, 0.14], 0.012, BUG)
    .done();
  const wing = (name: string, side: number): THREE.Group => {
    const w = new THREE.Group();
    w.name = name;
    w.rotation.z = side * 0.35;
    butterfly.add(w);
    kit
      .part(name, w)
      .box([0.13, 0.02, 0.12], [side * 0.08, 0, 0.04], WING_FORE, [0, side * 0.32, 0])
      .box([0.1, 0.02, 0.09], [side * 0.062, 0, -0.055], WING_HIND, [0, -side * 0.32, 0])
      .box([0.045, 0.008, 0.045], [side * 0.095, 0.012, 0.045], WING_SPOT, [0, side * 0.32, 0])
      .done();
    return w;
  };
  return { butterfly, wingL: wing('wingL', 1), wingR: wing('wingR', -1) };
}

/** A hidden group at the fist, as the cup and the others hang from the forearm. */
function inHand(fore: THREE.Object3D, name: string): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(0, -POLE.fore, 0);
  g.visible = false;
  fore.add(g);
  return g;
}

/** A cream mug in the right hand: rim up while the arm hangs, its handle in the fist. */
function addCup(kit: Kit, fore: THREE.Object3D): THREE.Group {
  const cup = inHand(fore, 'cup');
  kit
    .part('cup', cup)
    .box([0.11, 0.05, 0.11], [0, -0.02, 0.13], CUP_SHADE)
    .box([0.145, 0.08, 0.145], [0, 0.04, 0.13], CUP)
    .box([0.115, 0.012, 0.115], [0, 0.077, 0.13], TEA)
    .box([0.03, 0.05, 0.06], [0, 0.03, 0.04], CUP)
    .done();
  return cup;
}

/** The magnifying glass held in the right hand: the handle in the fist, the glass flat in front of it. */
function addGlass(kit: Kit, fore: THREE.Object3D): THREE.Group {
  const glass = inHand(fore, 'glass');
  const b = kit.part('glass', glass);
  magnifier(b, [0, 0, 0.25], 0.1, Math.PI / 2, Math.PI / 2, 0.1);
  b.done();
  return glass;
}

/** A small open notebook in the left hand, pages up, leaning in towards her middle. */
function addNotebook(kit: Kit, fore: THREE.Object3D): THREE.Group {
  const notebook = inHand(fore, 'notebook');
  const b = kit.part('notebook', notebook);
  const x = -0.12;
  const z = 0.15;
  b.box([0.3, 0.018, 0.2], [x, -0.015, z], COVER);
  for (const side of [1, -1]) {
    b.box([0.135, 0.022, 0.18], [x + side * 0.07, 0.008, z], PAGE, [0, 0, -side * 0.1]);
    for (const row of [-0.05, -0.01, 0.03]) {
      b.box([0.09, 0.004, 0.012], [x + side * 0.07, 0.022, z + row], WRITING, [0, 0, -side * 0.1]);
    }
  }
  b.done();
  return notebook;
}

/** A mustard pencil in the right hand, its point leaning in towards the notebook. */
function addPencil(kit: Kit, fore: THREE.Object3D): THREE.Group {
  const pencil = inHand(fore, 'pencil');
  const top: V3 = [-0.03, 0.1, -0.02];
  const low: V3 = [0.06, -0.06, 0.09];
  const tip: V3 = [0.075, -0.09, 0.11];
  kit
    .part('pencil', pencil)
    .beam([-0.04, 0.125, -0.035], top, 0.04, ERASER)
    .beam(top, low, 0.035, PENCIL)
    .beam(low, tip, 0.022, PENCIL_TIP)
    .done();
  return pencil;
}
