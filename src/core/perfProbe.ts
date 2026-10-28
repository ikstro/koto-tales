import type * as THREE from 'three';

/**
 * For automated checks (`__koto.probe()`): counts the draw calls of the next
 * frame by what they draw (the scene's top-level object name, up to ':')
 * and by pass (shadow map or colour), by wrapping `renderBufferDirect` once.
 */
export function probeDrawCalls(renderer: THREE.WebGLRenderer, scene: THREE.Scene, renders: () => number): Promise<Record<string, number>> {
  return new Promise((resolve) => {
    const r = renderer as THREE.WebGLRenderer & { renderBufferDirect: (...a: unknown[]) => void };
    const orig = r.renderBufferDirect;
    const counts: Record<string, number> = {};
    const label = (o: THREE.Object3D): string => {
      let top = o;
      while (top.parent && top.parent !== scene) top = top.parent;
      if (!top.parent) return 'post';
      const n = top.name || top.type;
      return n.startsWith('model:') ? n : n.split(':')[0];
    };
    const patched = function (this: unknown, ...a: unknown[]) {
      const obj = a[4] as THREE.Object3D;
      const mat = a[3] as THREE.Material;
      const pass = (mat as THREE.MeshDepthMaterial).isMeshDepthMaterial || (mat as THREE.MeshDistanceMaterial).isMeshDistanceMaterial ? 'shadow' : 'color';
      const k = `${pass}/${label(obj)}`;
      counts[k] = (counts[k] ?? 0) + 1;
      return orig.apply(this, a);
    };
    // exactly one drawn frame: install right after a frame was drawn, remove after the next one
    let seen = renders();
    let on = false;
    const tick = () => {
      const now = renders();
      if (now !== seen) {
        seen = now;
        if (on) {
          r.renderBufferDirect = orig;
          resolve(Object.fromEntries(Object.entries(counts).sort((x, y) => y[1] - x[1])));
          return;
        }
        r.renderBufferDirect = patched;
        on = true;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
