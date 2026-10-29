import type * as THREE from 'three';

type Gate = (scene: THREE.Scene, camera: THREE.Camera) => void;

/**
 * Keeps a frame from stalling on a shader that is built the first time it is drawn
 * (a village coming into view, a new building, the boss). Each new top-level object in
 * the scene whose materials were never drawn is compiled in the background (three's
 * compileAsync: with KHR_parallel_shader_compile the driver links on its own thread);
 * when that needed a new shader program, the object stays hidden until the program is
 * ready — a split second late, never a frozen frame. Objects whose programs already
 * exist (most: the parts share a handful of materials) show at once.
 *
 * Call it right before the scene is drawn, with the render target the scene draws into
 * already set: the program depends on it.
 */
export function createShaderGate(renderer: THREE.WebGLRenderer): Gate {
  const seen = new WeakSet<THREE.Object3D>();
  const programs = () => renderer.info.programs?.length ?? 0;

  const neverDrawn = (root: THREE.Object3D): boolean => {
    let fresh = false;
    root.traverse((o) => {
      if (fresh) return;
      const mat = (o as THREE.Mesh).material;
      if (!mat) return;
      for (const m of Array.isArray(mat) ? mat : [mat]) {
        if (!(renderer.properties.get(m) as { currentProgram?: object }).currentProgram) fresh = true;
      }
    });
    return fresh;
  };

  /** Hidden by layers, which the game itself never touches (it does toggle `visible`). */
  const hide = (root: THREE.Object3D): [THREE.Object3D, number][] => {
    const masks: [THREE.Object3D, number][] = [];
    root.traverse((o) => {
      masks.push([o, o.layers.mask]);
      o.layers.disableAll();
    });
    return masks;
  };

  return (scene, camera) => {
    for (const c of scene.children) {
      if (seen.has(c)) continue;
      seen.add(c);
      if (!neverDrawn(c)) continue;
      const before = programs();
      const ready = renderer.compileAsync(c, camera, scene);
      if (programs() === before) continue;
      const masks = hide(c);
      void ready.then(() => {
        for (const [o, mask] of masks) o.layers.mask = mask;
      });
    }
  };
}
