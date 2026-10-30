import * as THREE from 'three';

/**
 * A see-through tunnel from the camera to the hero: blocks above the hero's
 * shoulders on that line dissolve, so a tree crown or a tall tower never
 * hides the child's character. Shared by every skin's world materials.
 *
 * Tree crowns open a round window instead (a material that knows its leaves
 * passes a `LeafCut`): only leaf blocks that stand between the camera and the
 * hero and cover the hero's part of the screen go, whole blocks at a time with
 * a dotted rim; every other crown stays whole, so a forest stays a forest.
 *
 * The game sets `cutaway.from` (camera) and `cutaway.to` (hero chest) each
 * frame; `cutaway.on.value = 0` turns it off (start screen).
 */
export const cutaway = {
  from: new THREE.Vector3(),
  to: new THREE.Vector3(),
  on: { value: 0 },
};

const uniforms = {
  uCutFrom: { value: cutaway.from },
  uCutTo: { value: cutaway.to },
  uCutOn: cutaway.on,
};

const VERT_PARS = /* glsl */ `
varying vec3 vCutPos;
`;

const VERT_MAIN = /* glsl */ `
{
  vec4 cutP = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    cutP = instanceMatrix * cutP;
  #endif
  vCutPos = (modelMatrix * cutP).xyz;
}
`;

const FRAG_PARS = /* glsl */ `
uniform vec3 uCutFrom;
uniform vec3 uCutTo;
uniform float uCutOn;
varying vec3 vCutPos;
`;

/** The crown window's radius on screen, in blocks at the hero's distance, and its dotted rim. */
const LEAF_WINDOW = 3.6;
const LEAF_RIM = 0.9;

/** Which fragments are tree crowns and which block each belongs to (fragment GLSL), plus what that needs. */
export interface LeafCut {
  leaf: string;
  /** vec3, the centre of the leaf's block in world space. */
  cell: string;
  vertPars?: string;
  vertMain?: string;
  fragPars?: string;
}

/** Crown pieces of an instanced dressing: `aCut` = 1 marks them; their block is the one they stand on (along the piece's up). */
export const LEAF_PIECES: LeafCut = {
  leaf: 'vCutLeaf > 0.5',
  cell: 'vCutCell',
  vertPars: 'attribute float aCut;\nflat varying float vCutLeaf;\nflat varying vec3 vCutCell;\n',
  vertMain: /* glsl */ `
{
  mat4 cutM = modelMatrix;
  #ifdef USE_INSTANCING
    cutM = cutM * instanceMatrix;
  #endif
  vCutCell = floor(cutM[3].xyz - normalize(cutM[1].xyz) * 0.5) + 0.5;
  vCutLeaf = aCut;
}
`,
  fragPars: 'flat varying float vCutLeaf;\nflat varying vec3 vCutCell;\n',
};

const fragLeaf = (c: LeafCut) => /* glsl */ `
if (uCutOn > 0.5 && (${c.leaf})) {
  vec3 cell = ${c.cell};
  if (cell.y > uCutTo.y + 0.3) {
    vec3 ab = uCutFrom - uCutTo;
    float len = length(ab);
    vec3 rel = cell - uCutTo;
    // how far from the hero towards the camera, and how far off that line as seen on screen
    float s = dot(rel, ab) / len;
    if (s > -0.6) {
      float side = length(rel - ab * (s / len)) * len / max(len - s, 0.5);
      if (side < ${LEAF_WINDOW.toFixed(2)}) {
        float edge = (${LEAF_WINDOW.toFixed(2)} - side) / ${LEAF_RIM.toFixed(2)};
        float n = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
        if (edge > 1.0 || n < edge) discard;
      }
    }
  }
}
`;

const FRAG_MAIN = /* glsl */ `
if (uCutOn > 0.5 && vCutPos.y > uCutTo.y + 0.7) {
  vec3 ab = uCutFrom - uCutTo;
  float t = clamp(dot(vCutPos - uCutTo, ab) / dot(ab, ab), 0.0, 1.0);
  float d = length(vCutPos - (uCutTo + ab * t));
  // A cone: narrow at the hero, wider towards the camera.
  float r = mix(1.7, 3.6, t);
  if (d < r) {
    float edge = (r - d) / 0.7;
    float n = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
    if (edge > 1.0 || n < edge) discard;
  }
}
`;

/** Call inside a material's onBeforeCompile, after the skin's own patches. */
export function injectCutaway(shader: THREE.WebGLProgramParametersWithUniforms, leaves?: LeafCut): void {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + VERT_PARS + (leaves?.vertPars ?? ''))
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_MAIN + (leaves?.vertMain ?? ''));
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + FRAG_PARS + (leaves?.fragPars ?? ''))
    .replace('#include <clipping_planes_fragment>', (leaves ? fragLeaf(leaves) : '') + FRAG_MAIN + '#include <clipping_planes_fragment>');
}

const cutCopies = new Map<string, THREE.Material>();

/**
 * Tall models (lighthouses, the kit's buildings) dissolve on the camera–hero line too: their
 * shared standard materials are swapped for copies with the cutaway (one copy per material);
 * a model's own materials (`userData.own`: they blink or change colour) get it in place.
 */
export function cutawayModel(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const swap = (m: THREE.Material): THREE.Material => {
      if (!(m as THREE.MeshStandardMaterial).isMeshStandardMaterial && !(m as THREE.MeshBasicMaterial).isMeshBasicMaterial) return m;
      if (m.userData.own) {
        if (!m.userData.cut) {
          m.userData.cut = true;
          m.onBeforeCompile = (shader) => injectCutaway(shader);
          m.customProgramCacheKey = () => 'own-cut';
        }
        return m;
      }
      let c = cutCopies.get(m.uuid);
      if (!c) {
        c = m.clone();
        c.onBeforeCompile = (shader) => injectCutaway(shader);
        c.customProgramCacheKey = () => `${m.customProgramCacheKey()}-cut`;
        cutCopies.set(m.uuid, c);
      }
      return c;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  });
}
