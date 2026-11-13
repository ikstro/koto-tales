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

/** Whole visible volume, including a tall toy's top; holes between its parts are tappable too. */
export function tappedInBox(ctx: Ctx, box: THREE.Box3): boolean {
  if(!ctx.input.taps.length) return false;
  const rect=ctx.renderer.domElement.getBoundingClientRect();
  let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
  for(let i=0;i<8;i++) {
    v.set(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z).project(ctx.camera);
    if(v.z>1 || v.z< -1) continue;
    const x=rect.left+(v.x*0.5+0.5)*rect.width, y=rect.top+(-v.y*0.5+0.5)*rect.height;
    left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
  if(!Number.isFinite(left)) return false;
  const cx=(left+right)/2,cy=(top+bottom)/2,rx=Math.max(MIN_PX,(right-left)/2),ry=Math.max(MIN_PX,(bottom-top)/2);
  for(const t of ctx.input.taps) if(Math.abs(t.x-cx)<=rx && Math.abs(t.y-cy)<=ry) return ctx.input.takeTap(t.x,t.y,1);
  return false;
}
