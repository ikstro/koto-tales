/** A palm-sized blue toy whistle, with a dark mouth and a hollow gold loop for a ribbon. */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import { Kit, type PartBuilder } from './parts/kit';

const BLUE = '#2f7fd6';
const CYAN = '#86d9ef';
const GOLD = '#ffd23a';
const DARK = '#234861';
const CREAM = '#ffe3a3';

/** The item's existing PartBuilder registry can call this without a second model wrapper. */
export function windWhistleParts(p: PartBuilder): void {
  p.box([0.28, 0.26, 0.28], [0, 0.13, -0.025], BLUE)
    .box([0.22, 0.06, 0.24], [0, 0.265, -0.025], CYAN)
    .box([0.18, 0.095, 0.21], [0, 0.14, 0.19], BLUE)
    .box([0.12, 0.035, 0.008], [0, 0.15, 0.3], DARK)
    .box([0.1, 0.008, 0.055], [0, 0.299, 0.025], DARK)
    .box([0.15, 0.035, 0.025], [0, 0.314, -0.02], CREAM)
    .box([0.055, 0.12, 0.07], [0, 0.23, -0.185], GOLD);
  // A real opening in the eyelet keeps it from reading as a second blue nozzle.
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) * Math.PI) / 4;
    p.box([0.085, 0.035, 0.035], [Math.cos(a) * 0.1, 0.34 + Math.sin(a) * 0.1, -0.19], GOLD, [0, 0, a + Math.PI / 2]);
  }
}

export function buildWindWhistle(skin: Skin): THREE.Group {
  const root = new THREE.Group();
  root.name = 'item:wind_whistle';
  const kit = new Kit('item:wind_whistle', skin);
  const part = kit.part('item', root);
  windWhistleParts(part);
  part.done();
  return root;
}
