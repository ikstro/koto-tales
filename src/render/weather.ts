/**
 * What the weather looks like (rules in content/weather.ts, run by systems/weather.ts):
 *   - rain and snow are one draw of small quads in a box that follows the camera. Every
 *     particle's place is worked out in the vertex shader from its seed and the time, so a frame
 *     only sets a few uniforms; each stays where it is in the world and wraps round the box.
 *     Rain turns to snow particle by particle (`aSeed.w` against the share of snow);
 *   - the rainbow is an arc of six bands drawn straight onto the screen, its top by the upper
 *     edge. The camera looks down and never turns, so no sky is ever in view and the arc would
 *     have nowhere to stand: it hangs over the far side of the land, as a real one keeps its
 *     place in front of whoever watches it.
 * No light of its own. Both exist from the start, hidden, so the shader gate and the other
 * quality look are done with them long before the first drop.
 */
import * as THREE from 'three';
import { MAX_PARTICLES } from '../content/weather';

/**
 * The box: the camera hangs 13 blocks over the ground it sees and that ground lies 3–20 blocks
 * ahead of it, 29 across at the far edge. The box reaches a little past all of that.
 */
const BOX = new THREE.Vector3(33, 10, 24);
const BELOW_CAMERA = 9.5;
const AHEAD_OF_CAMERA = 12;
/** The time wraps here: one jump in an hour, too small to see among the drops. */
const TIME_WRAP = 4096;

const FALL_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform vec3 uCentre;
uniform vec3 uBox;
uniform float uTime;
uniform float uSnow;
uniform float uAlpha;
varying vec2 vQ;
varying float vA;
varying float vSnow;
void main() {
  vQ = position.xy;
  float r = fract(aSeed.w * 7.31);
  vSnow = step(aSeed.w, uSnow);
  // rain leans a little with the wind and comes down fast; snow takes its time and sways
  vec3 dir = normalize(mix(vec3(0.1, -1.0, 0.04), vec3(0.05, -1.0, 0.02), vSnow));
  vec3 p = aSeed.xyz * uBox + dir * uTime * mix(13.0 + 5.0 * r, 1.3 + 0.8 * r, vSnow);
  p.xz += vSnow * 0.6 * vec2(sin(uTime * 0.9 + r * 40.0), cos(uTime * 0.7 + r * 25.0));
  vec3 f = fract((p - uCentre) / uBox);
  p = uCentre + (f - 0.5) * uBox;
  vec4 mv;
  if (vSnow > 0.5) {
    mv = viewMatrix * vec4(p, 1.0);
    mv.xy += position.xy * (0.05 + 0.06 * r);
  } else {
    // a thin streak along its fall, turned to face the camera
    vec3 side = normalize(cross(dir, cameraPosition - p));
    mv = viewMatrix * vec4(p + dir * position.y * (0.3 + 0.16 * r) + side * position.x * 0.016, 1.0);
  }
  // nothing pops in at the top of the box or big right in front of the lens
  vA = uAlpha * smoothstep(0.0, 0.08, f.y) * smoothstep(1.0, 0.92, f.y) * smoothstep(5.0, 9.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

const FALL_FRAG = /* glsl */ `
uniform vec3 uRainColor;
uniform vec3 uSnowColor;
varying vec2 vQ;
varying float vA;
varying float vSnow;
void main() {
  float flake = 1.0 - smoothstep(0.5, 1.0, length(vQ));
  float streak = (1.0 - smoothstep(0.1, 1.0, abs(vQ.x))) * (1.0 - smoothstep(0.2, 1.0, abs(vQ.y)));
  gl_FragColor = vec4(mix(uRainColor, uSnowColor, vSnow), mix(streak * 0.7, flake, vSnow) * vA);
  #include <colorspace_fragment>
}
`;

/** The six bands, outer to inner, in the palette's plastic. */
const BANDS = ['#e8463a', '#f0902f', '#ffd23a', '#3fa142', '#2f7fd6', '#8a5cc8'].map((h) => new THREE.Color(h));
const glsl = (c: THREE.Color) => `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;

const BOW_VERT = /* glsl */ `
uniform float uAspect;
varying vec2 vB;
void main() {
  vB = position.xy;
  // in half-heights of the screen: as wide as the screen, but never taller than it
  float R = min(1.04 * uAspect, 1.6);
  // its top by the upper edge; on a portrait screen just under the top row of pieces
  float top = mix(0.6, 0.9, smoothstep(0.6, 1.2, uAspect));
  float a = position.x * 1.45;
  vec2 p = vec2(0.0, top - R) + vec2(sin(a), cos(a)) * R * (1.0 - position.y * 0.17);
  gl_Position = vec4(p.x / uAspect, p.y, 0.0, 1.0);
}
`;

const BOW_FRAG = /* glsl */ `
const vec3 BANDS[6] = vec3[6](${BANDS.map(glsl).join(', ')});
uniform float uAlpha;
varying vec2 vB;
void main() {
  float b = vB.y * 6.0;
  int i = min(int(b), 5);
  vec3 c = mix(BANDS[i], BANDS[min(i + 1, 5)], smoothstep(0.72, 1.0, fract(b)));
  float a = uAlpha * smoothstep(0.0, 0.05, vB.y) * smoothstep(1.0, 0.95, vB.y) * (1.0 - smoothstep(0.35, 0.8, abs(vB.x)));
  // light added over the land, and enough of it covered that the bands stay coloured on sand and snow
  gl_FragColor = vec4(c * a, a * 0.6);
  #include <colorspace_fragment>
}
`;

function fallGeometry(): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const seeds = new Float32Array(MAX_PARTICLES * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  g.instanceCount = 0;
  return g;
}

function bowGeometry(): THREE.BufferGeometry {
  const steps = 64;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * 2 - 1;
    pos.push(x, 0, 0, x, 1, 0);
    if (i < steps) idx.push(i * 2, i * 2 + 1, i * 2 + 3, i * 2, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

const RAIN_DAY = new THREE.Color('#e2ecf6');
const RAIN_NIGHT = new THREE.Color('#8c9ce0');
const SNOW_DAY = new THREE.Color('#ffffff');
const SNOW_NIGHT = new THREE.Color('#b4c0f2');

export interface WeatherLook {
  /**
   * One frame: `count` particles at most, `fall` their share in the air (0..1), `snow` the share
   * of them that are flakes, `bow` the strength of the arc, `daylight` 0..1, `shelter` 1 under a roof.
   */
  draw(dt: number, camera: THREE.PerspectiveCamera, count: number, fall: number, snow: number, bow: number, daylight: number, shelter: number): void;
}

export function createWeatherLook(scene: THREE.Scene): WeatherLook {
  const fallUniforms = {
    uCentre: { value: new THREE.Vector3() },
    uBox: { value: BOX },
    uTime: { value: 0 },
    uSnow: { value: 0 },
    uAlpha: { value: 0 },
    uRainColor: { value: RAIN_DAY.clone() },
    uSnowColor: { value: SNOW_DAY.clone() },
  };
  const bowUniforms = { uAspect: { value: 1 }, uAlpha: { value: 0 } };

  const geo = fallGeometry();
  const fall = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({ uniforms: fallUniforms, vertexShader: FALL_VERT, fragmentShader: FALL_FRAG, transparent: true, depthWrite: false }),
  );
  fall.name = 'weatherFall';
  fall.frustumCulled = false;
  fall.renderOrder = 5;
  fall.visible = false;

  const bow = new THREE.Mesh(
    bowGeometry(),
    new THREE.ShaderMaterial({
      uniforms: bowUniforms,
      vertexShader: BOW_VERT,
      fragmentShader: BOW_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    }),
  );
  bow.name = 'weatherBow';
  bow.frustumCulled = false;
  bow.renderOrder = 6;
  bow.visible = false;

  const root = new THREE.Group();
  root.name = 'weather';
  root.add(fall, bow);
  root.traverse((o) => (o.userData.toyNoShadow = true));
  scene.add(root);

  return {
    draw(dt, camera, count, share, snow, arc, daylight, shelter) {
      const u = fallUniforms;
      u.uTime.value = (u.uTime.value + dt) % TIME_WRAP;
      const strength = share * (1 - shelter);
      fall.visible = strength > 0.004;
      if (fall.visible) {
        u.uCentre.value.set(camera.position.x, camera.position.y - BELOW_CAMERA, camera.position.z - AHEAD_OF_CAMERA);
        u.uSnow.value = snow;
        // the first drops come few and faint
        u.uAlpha.value = Math.min(1, strength * 3);
        geo.instanceCount = Math.ceil(count * strength);
        u.uRainColor.value.lerpColors(RAIN_NIGHT, RAIN_DAY, daylight);
        u.uSnowColor.value.lerpColors(SNOW_NIGHT, SNOW_DAY, daylight);
      }
      bow.visible = arc > 0.004;
      if (bow.visible) {
        bowUniforms.uAspect.value = camera.aspect;
        // by moonlight only a faint one
        bowUniforms.uAlpha.value = arc * (0.22 + 0.33 * daylight);
      }
    },
  };
}
