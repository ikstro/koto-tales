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
