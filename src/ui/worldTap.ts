import * as THREE from 'three';
import type { Ctx } from '../core/ctx';

/**
 * A tap on a thing in the world itself, not on a HUD piece (the kitchen table, DESIGN.md «Home»):
 * Input keeps this frame's short taps on the screen; a thing asks whether one landed on it, seen
 * from the camera, and takes it so nothing else gets the same tap.
 */

/** Never smaller on screen than a finger (px). */
const MIN_PX = 44;

const v = new THREE.Vector3();
const side = new THREE.Vector3();

/** Whether this frame's tap landed within `reach` blocks of `p` on screen (it is taken). */
export function tappedAt(ctx: Ctx, p: THREE.Vector3, reach: number): boolean {
  if (!ctx.input.taps.length) return false;
  const cam = ctx.camera;
  const rect = ctx.renderer.domElement.getBoundingClientRect();
  v.copy(p).project(cam);
  if (v.z > 1) return false; // behind the camera
  const x = rect.left + (v.x * 0.5 + 0.5) * rect.width;
  const y = rect.top + (-v.y * 0.5 + 0.5) * rect.height;
  // how big `reach` looks there: a point that far to the side of it, seen from the camera
  side.setFromMatrixColumn(cam.matrixWorld, 0).multiplyScalar(reach).add(p).project(cam);
  const r = Math.hypot((side.x - v.x) * 0.5 * rect.width, (side.y - v.y) * 0.5 * rect.height);
  return ctx.input.takeTap(x, y, Math.max(MIN_PX, r));
}
