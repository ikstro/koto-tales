import * as THREE from 'three';

/**
 * A see-through tunnel from the camera to the hero: blocks above the hero's
 * shoulders on that line dissolve, so a tree crown or a tall tower never
 * hides the child's character. Shared by every skin's world materials.
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
export function injectCutaway(shader: THREE.WebGLProgramParametersWithUniforms): void {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + VERT_PARS)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_MAIN);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
    .replace('#include <clipping_planes_fragment>', FRAG_MAIN + '#include <clipping_planes_fragment>');
}
