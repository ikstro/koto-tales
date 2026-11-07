/**
 * A sea of soft cream cloud puffs under Бабуся's flying house (the night move cutscene).
 * One instanced draw of camera-facing quads in a box that follows the camera, like the weather's
 * drops (render/weather.ts): every puff's place, size and lumpy outline come from its seed in the
 * shaders, so a frame only sets a few uniforms. The puffs drift along −Z (towards the camera) and
 * wrap round the box, swaying a little sideways. The colour is the map's cloud puffs' cream
 * (tools/hud/bake.html `cloudPiece`), turning to a cool pale blue-grey by night.
 * No light of its own. The mesh is always visible (with no instances while unseen), so the shader
 * gate keeps its program built long before the house lifts off.
 */
import * as THREE from 'three';

const COUNT = 240;
/** The box: x × thickness × z, centred where the view's middle meets the layer, a little towards the far side (it spans more). */
const BOX = new THREE.Vector3(96, 4, 72);
const FARTHER = 6;
/** Looking nearly level (never in the game): the box sits this far ahead of the camera. */
const AHEAD_OF_CAMERA = 30;
/** The time wraps here: one jump in an hour, too small to see in a slow sway. */
const TIME_WRAP = 4096;

const VERT = /* glsl */ `
attribute vec4 aSeed;
uniform vec3 uCentre;
uniform vec3 uBox;
uniform float uTime;
uniform float uScroll;
uniform vec2 uShift;
uniform float uAlpha;
varying vec2 vQ;
varying float vA;
varying vec4 vS;
void main() {
  vQ = position.xy;
  vS = aSeed;
  float r = aSeed.w;
  vec3 p = aSeed.xyz * uBox;
  p.z += uScroll;
  p.xz += uShift;
  // a slow sway sideways, each puff on its own beat
  p.x += 0.9 * sin(uTime * 0.13 + r * 41.0) + 0.4 * sin(uTime * 0.31 + r * 17.0);
  vec3 f = fract((p - uCentre) / uBox);
  p = uCentre + (f - 0.5) * uBox;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  // 4–7 blocks across
  mv.xy += position.xy * (2.0 + 1.5 * fract(r * 13.7));
  // nothing pops in at the box's ends or sits big right in front of the lens
  float edge = smoothstep(0.0, 0.12, f.x) * smoothstep(1.0, 0.88, f.x) * smoothstep(0.0, 0.14, f.z) * smoothstep(1.0, 0.86, f.z);
  vA = uAlpha * edge * smoothstep(3.0, 7.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
varying vec2 vQ;
varying float vA;
varying vec4 vS;
float lobe(vec2 q, float a, float off, float rad) {
  vec2 c = off * vec2(cos(a), sin(a));
  return length(q - c) / rad;
}
void main() {
  // three overlapping round lobes from the seed: a soft, slightly lumpy puff, no texture
  float s = vS.w * 6.2832;
  float d = lobe(vQ, s, 0.0, 0.62 + 0.08 * vS.x);
  d = min(d, lobe(vQ, s + 2.1, 0.32, 0.58 + 0.08 * vS.y));
  d = min(d, lobe(vQ, s + 4.0 + vS.z, 0.3, 0.52 + 0.1 * vS.z));
  float a = 1.0 - smoothstep(0.55, 1.0, d);
  if (a * vA < 0.003) discard;
  // lit from above: the upper half a touch brighter, the belly shaded
  float lit = mix(0.84, 1.05, smoothstep(-0.75, 0.55, vQ.y));
  // a little different per puff
  vec3 c = uColor * lit * (0.96 + 0.07 * fract(vS.w * 29.3));
  gl_FragColor = vec4(c, a * vA);
  #include <colorspace_fragment>
}
`;

/** The map's cloud puffs (tools/hud/bake.html `cloudPiece`). */
const DAY = new THREE.Color('#fbf1dc');
/** By moonlight: a cool pale blue-grey. */
const NIGHT = new THREE.Color('#a3aec4');

export interface CloudSea {
  /** The layer's world height, its strength 0..1 (the caller ramps it) and the drift speed in blocks/s. */
  set(o: { y?: number; alpha?: number; drift?: number }): void;
  /** The world moved under the layer by (dx, dz): the puffs stay where they are on screen. */
  shift(dx: number, dz: number): void;
  /** One frame; `daylight` 0..1. Cheap while the alpha is 0. */
  draw(dt: number, camera: THREE.PerspectiveCamera, daylight: number): void;
}

function geometry(): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const seeds = new Float32Array(COUNT * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  g.instanceCount = 0;
  return g;
}

export function createCloudSea(scene: THREE.Scene): CloudSea {
  const uniforms = {
    uCentre: { value: new THREE.Vector3() },
    uBox: { value: BOX },
    uTime: { value: 0 },
    uScroll: { value: 0 },
    uShift: { value: new THREE.Vector2() },
    uAlpha: { value: 0 },
    uColor: { value: DAY.clone() },
  };
  const geo = geometry();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false }),
  );
  mesh.name = 'cloudSea';
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.userData.toyNoShadow = true;
  // always visible: renderer.compile (render/shaderGate.ts) only builds what is visible
  mesh.visible = true;
  scene.add(mesh);

  let y = 0;
  let alpha = 0;
  let drift = 0;
  const dir = new THREE.Vector3();

  return {
    set(o) {
      if (o.y !== undefined) y = o.y;
      if (o.alpha !== undefined) alpha = Math.max(0, Math.min(1, o.alpha));
      if (o.drift !== undefined) drift = o.drift;
    },
    shift(dx, dz) {
      const v = uniforms.uShift.value;
      // kept small: only the place within the box matters
      v.set((v.x + dx) % BOX.x, (v.y + dz) % BOX.z);
    },
    draw(dt, camera, daylight) {
      if (alpha <= 0.004) {
        geo.instanceCount = 0;
        return;
      }
      const u = uniforms;
      u.uTime.value = (u.uTime.value + dt) % TIME_WRAP;
      // towards the camera; wrapped by the box length, which the shader wraps anyway
      u.uScroll.value = (u.uScroll.value + drift * dt) % BOX.z;
      const c = camera.position;
      camera.getWorldDirection(dir);
      if (dir.y < -0.1 && c.y > y) {
        const k = (y - c.y) / dir.y;
        u.uCentre.value.set(c.x + dir.x * k, y, c.z + dir.z * k - FARTHER);
      } else u.uCentre.value.set(c.x, y, c.z - AHEAD_OF_CAMERA);
      u.uAlpha.value = alpha;
      u.uColor.value.lerpColors(NIGHT, DAY, Math.max(0, Math.min(1, daylight)));
      geo.instanceCount = COUNT;
    },
  };
}
