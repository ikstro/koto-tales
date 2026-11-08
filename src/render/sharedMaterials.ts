import * as THREE from 'three';

/**
 * The skin's plastic materials are shared by colour across every model. three builds one shader
 * program for plain meshes and another for instanced ones (many copies in one draw: the ball pit,
 * flags, sparks), and a material drawn both ways makes the renderer pick its program again on every
 * switch, hundreds of times a frame. So an instanced mesh gets a twin of a shared material, used by
 * instanced meshes only. Materials a model made for itself are never twinned: it may change them.
 */
const shared = new WeakSet<THREE.Material>();
const twins = new WeakMap<THREE.Material, THREE.Material>();

/** A material cached and handed to many models (the skin's part materials and their cutaway copies). */
export function markShared<M extends THREE.Material>(m: M): M {
  shared.add(m);
  return m;
}

export function isShared(m: THREE.Material): boolean {
  return shared.has(m);
}

function twinOf(m: THREE.Material): THREE.Material {
  let t = twins.get(m);
  if (!t) {
    t = m.clone();
    // clone() leaves out the shader patches (the cutaway, the skin's own)
    t.onBeforeCompile = m.onBeforeCompile;
    t.customProgramCacheKey = m.customProgramCacheKey;
    t.name = m.name ? `${m.name} (instanced)` : 'instanced';
    twins.set(m, t);
  }
  return t;
}

/** Every instanced mesh under `root` that draws with a shared material gets that material's instanced twin. */
export function splitInstanced(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.InstancedMesh;
    if (!mesh.isInstancedMesh) return;
    const mat = mesh.material;
    if (Array.isArray(mat)) {
      if (mat.some(isShared)) mesh.material = mat.map((m) => (isShared(m) ? twinOf(m) : m));
    } else if (mat && isShared(mat)) mesh.material = twinOf(mat);
  });
}

/**
 * three draws every shadow with one depth material and re-picks its program whenever the next
 * caster differs in a way that changes the shader (instanced or not, a texture, which side faces
 * the sun): a few dozen times a frame. Each kind of caster gets a depth material of its own.
 */
const depths = new Map<string, THREE.MeshDepthMaterial>();

function depthFor(mesh: THREE.Mesh, m: THREE.Material): THREE.MeshDepthMaterial {
  const sm = m as THREE.MeshStandardMaterial;
  const key = `${(mesh as THREE.InstancedMesh).isInstancedMesh ? 1 : 0}|${(mesh as THREE.SkinnedMesh).isSkinnedMesh ? 1 : 0}|${sm.map ? 1 : 0}|${sm.alphaMap ? 1 : 0}|${m.alphaTest > 0 ? 1 : 0}|${m.shadowSide ?? -1}|${m.side}`;
  let d = depths.get(key);
  if (!d) {
    d = new THREE.MeshDepthMaterial();
    depths.set(key, d);
  }
  return d;
}

/** Every mesh under `root` with one material and no depth material of its own gets the one for its kind. */
export function splitDepth(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || mesh.customDepthMaterial || Array.isArray(mesh.material) || !mesh.material) return;
    mesh.customDepthMaterial = depthFor(mesh, mesh.material);
  });
}

