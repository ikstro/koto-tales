/** Small held things shared by several rigs. */
import * as THREE from 'three';
import type { Kit } from './kit';

/**
 * A bow held in the hand at the end of an arm that hangs along -Y.
 * Its limbs run along the arm's local ±Z, so it stands upright when the arm
 * is raised forward. Returned as the rig's `tool` part (hidden unless attacking).
 */
export function addBow(kit: Kit, arm: THREE.Object3D, handY: number): THREE.Group {
  const tool = new THREE.Group();
  tool.name = 'tool';
  tool.position.set(0, handY, 0);
  arm.add(tool);
  const wood = '#9a5a2a';
  kit
    .part('tool', tool)
    .box([0.05, 0.05, 0.12], [0, -0.02, 0], wood)
    .beam([0, -0.02, 0.06], [0, 0.05, 0.22], 0.04, wood)
    .beam([0, 0.05, 0.22], [0, 0.13, 0.32], 0.035, wood)
    .beam([0, -0.02, -0.06], [0, 0.05, -0.22], 0.04, wood)
    .beam([0, 0.05, -0.22], [0, 0.13, -0.32], 0.035, wood)
    .box([0.012, 0.012, 0.64], [0, 0.13, 0], wood)
    .done();
  tool.visible = false;
  return tool;
}

/**
 * Соломія's magic wand: a thin white stick out of the hand (along -Y, so it points
 * forward when the arm is raised) with a glowing pink star on the tip. The rig's `tool`.
 */
export function addWand(kit: Kit, arm: THREE.Object3D, handY: number): THREE.Group {
  const tool = new THREE.Group();
  tool.name = 'tool';
  tool.position.set(0, handY, 0);
  arm.add(tool);
  kit
    .part('tool', tool)
    .beam([0, 0.02, 0], [0, -0.3, 0.02], 0.035, '#f7f7f4')
    .box([0.13, 0.13, 0.05], [0, -0.35, 0.02], { c: '#ff8fb1', glow: true })
    .box([0.13, 0.13, 0.05], [0, -0.35, 0.02], { c: '#ff8fb1', glow: true }, [0, 0, Math.PI / 4])
    .box([0.06, 0.06, 0.07], [0, -0.35, 0.02], { c: '#fff1c9', glow: true })
    .done();
  tool.visible = false;
  return tool;
}

/**
 * Давид's throwing axe in the hand while he throws (the rig's `tool`): a wooden handle
 * along -Y and a grey head with a bright edge.
 */
export function addAxe(kit: Kit, arm: THREE.Object3D, handY: number): THREE.Group {
  const tool = new THREE.Group();
  tool.name = 'tool';
  tool.position.set(0, handY, 0);
  arm.add(tool);
  kit
    .part('tool', tool)
    .box([0.05, 0.36, 0.05], [0, -0.1, 0], '#9a5a2a')
    .box([0.04, 0.14, 0.18], [0, -0.24, 0.08], '#9aa4ad')
    .box([0.045, 0.16, 0.05], [0, -0.24, 0.18], '#dfe6ea')
    .done();
  tool.visible = false;
  return tool;
}
