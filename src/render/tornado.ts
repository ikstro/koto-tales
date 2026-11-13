/**
 * Open toy-plastic curls with sparks or blue lightning: two draws per vortex, no textures,
 * real lights or shadow passes. Seeds are fixed; the GPU animates them from one time uniform.
 * The gaps keep the party visible through the funnel. Created before play for shader preparation.
 */
import * as THREE from 'three';
import { cutaway } from './skins/cutaway';

export type TornadoKind = 'fire' | 'blue';

export interface TornadoLook {
  /** Feet at the origin. Position this group in world space; scale is owned by draw(). */
  readonly root: THREE.Group;
  /** Absolute active-game time in seconds. Pausing the caller pauses every curl and spark. */
  draw(seconds: number, low: boolean, strength?: number): void;
  dispose(): void;
}

const SCALE = 0.8;
const BODY_COUNT = 96;
const ACCENT_COUNT = 32;

const BODY_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
varying float vShade;
varying float vHeat;
varying vec3 vWindWorld;
void main() {
  float h = aSeed.x;
  float angle = h * 19.0 + aSeed.y * 6.2831853 - uTime * 2.2;
  float r = 0.24 + 1.9 * h * h;
  vec3 p = position * vec3(0.66 + h * 0.68, 0.18 + 0.10 * h, 0.18);
  vec2 tangent = vec2(-sin(angle), cos(angle));
  vec2 outward = vec2(cos(angle), sin(angle));
  p.xz = tangent * p.x + outward * (p.z + r);
  p.y += h * 5.4;
  p.xz += vec2(sin(uTime * 0.7 + h * 3.0), cos(uTime * 0.5 + h * 2.0)) * h * 0.15;
  vShade = 0.69 + 0.22 * normal.y + 0.11 * normal.z;
  vHeat = aSeed.z;
  vWindWorld = (modelMatrix * vec4(p, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const BODY_FRAG = /* glsl */ `
uniform vec3 uDark;
uniform vec3 uLight;
uniform vec3 uCutFrom;
uniform vec3 uCutTo;
uniform float uCutOn;
varying float vShade;
varying float vHeat;
varying vec3 vWindWorld;
void main() {
  // The active hero stays visible even inside the fire: the same camera/hero line as the world.
  if (uCutOn > 0.5) {
    vec3 ray = uCutTo - uCutFrom;
    float t = dot(vWindWorld - uCutFrom, ray) / max(dot(ray, ray), 0.001);
    if (t > 0.0 && t < 1.0 && distance(vWindWorld, uCutFrom + ray * t) < 0.65) discard;
  }
  gl_FragColor = vec4(mix(uDark, uLight, vHeat) * vShade, 1.0);
  #include <colorspace_fragment>
}
`;

const ACCENT_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform float uKind;
varying vec2 vQ;
varying float vA;
void main() {
  vQ = position.xy;
  float h = fract(aSeed.x + uTime * 0.16 * (1.0 - uKind));
  float turn = aSeed.y * 6.2831853 - uTime * 2.2;
  float r = 0.38 + 1.9 * h * h;
  float angle = turn + h * 19.0;
  vec3 p;
  if (uKind > 0.5) {
    // Eight touching segments make a bolt. Low quality keeps two complete bolts.
    float segment = floor(aSeed.x * 8.0 + 0.01);
    float yy = (segment + (position.y + 0.5)) / 8.0;
    float at = turn + yy * 19.0;
    float rr = 0.38 + 1.9 * yy * yy;
    float zig0 = mod(segment, 2.0) * 0.22;
    float zig1 = mod(segment + 1.0, 2.0) * 0.22;
    at += mix(zig0, zig1, position.y + 0.5);
    p = vec3(cos(at) * rr, yy * 5.4, sin(at) * rr);
    p.xz += vec2(-sin(at), cos(at)) * position.x * 0.22;
    vA = 0.6 + 0.3 * sin(uTime * 6.0 + aSeed.y * 15.0);
  } else {
    p = vec3(cos(angle) * r, h * 5.4, sin(angle) * r);
    p += vec3(position.x * 0.15, position.y * 0.5, 0.0);
    vA = sin(h * 3.14159265) * 0.9;
  }
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const ACCENT_FRAG = /* glsl */ `
uniform vec3 uGlow;
varying vec2 vQ;
varying float vA;
void main() {
  float core = exp(-abs(vQ.x) * 8.0);
  gl_FragColor = vec4(mix(uGlow, vec3(1.0), core * 0.5), core * vA);
  #include <colorspace_fragment>
}
`;

function bodyGeometry(): THREE.InstancedBufferGeometry {
  const box = new THREE.BoxGeometry(1, 1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.setIndex(box.index!.clone());
  g.setAttribute('position', box.getAttribute('position').clone());
  g.setAttribute('normal', box.getAttribute('normal').clone());
  const seeds = new Float32Array(BODY_COUNT * 4);
  // Interleaved heights preserve the complete silhouette at half the instance count.
  for (let i = 0; i < BODY_COUNT; i++) seeds.set([((i * 17) % BODY_COUNT) / BODY_COUNT, (i % 4) / 4, ((i * 37) % 97) / 97, 0], i * 4);
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  g.instanceCount = BODY_COUNT;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2.7, 0), 4.2);
  g.boundingBox = new THREE.Box3(new THREE.Vector3(-2.5, -0.2, -2.5), new THREE.Vector3(2.5, 5.6, 2.5));
  box.dispose();
  return g;
}

function accentGeometry(kind: TornadoKind): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const seeds = new Float32Array(ACCENT_COUNT * 4);
  for (let i = 0; i < ACCENT_COUNT; i++) {
    const seed = kind === 'blue' ? [(i % 8) / 8, Math.floor(i / 8) / 4, 0, 0] : [((i * 13) % ACCENT_COUNT) / ACCENT_COUNT, i / ACCENT_COUNT, 0, 0];
    seeds.set(seed, i * 4);
  }
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  g.instanceCount = ACCENT_COUNT;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2.7, 0), 4.2);
  g.boundingBox = new THREE.Box3(new THREE.Vector3(-2.5, -0.2, -2.5), new THREE.Vector3(2.5, 5.6, 2.5));
  return g;
}

export function createTornadoLook(kind: TornadoKind): TornadoLook {
  const root = new THREE.Group();
  root.name = `tornado:${kind}`;
  root.scale.setScalar(SCALE);
  const time = { value: 0 };
  const body = bodyGeometry();
  const accent = accentGeometry(kind);
  const shellMat = new THREE.ShaderMaterial({
    name: 'tornadoPlastic',
    vertexShader: BODY_VERT,
    fragmentShader: BODY_FRAG,
    uniforms: {
      uTime: time,
      uDark: { value: new THREE.Color(kind === 'fire' ? '#e8463a' : '#2f7fd6') },
      uLight: { value: new THREE.Color(kind === 'fire' ? '#ffcc45' : '#b8efff') },
      uCutFrom: { value: cutaway.from },
      uCutTo: { value: cutaway.to },
      uCutOn: cutaway.on,
    },
  });
  const glowMat = new THREE.ShaderMaterial({
    name: 'tornadoAccents',
    vertexShader: ACCENT_VERT,
    fragmentShader: ACCENT_FRAG,
    uniforms: {
      uTime: time,
      uKind: { value: kind === 'blue' ? 1 : 0 },
      uGlow: { value: new THREE.Color(kind === 'blue' ? '#43bfff' : '#ff7722') },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  root.add(new THREE.Mesh(body, shellMat), new THREE.Mesh(accent, glowMat));
  root.traverse((o) => { o.userData.toyNoShadow = true; o.castShadow = false; o.receiveShadow = false; });
  return {
    root,
    draw(seconds, low, strength = 1) {
      time.value = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
      body.instanceCount = low ? BODY_COUNT / 2 : BODY_COUNT;
      accent.instanceCount = low ? (kind === 'blue' ? 16 : 12) : ACCENT_COUNT;
      root.scale.setScalar(SCALE * Math.max(0, Math.min(1, strength)));
    },
    dispose() {
      root.removeFromParent();
      body.dispose();
      accent.dispose();
      shellMat.dispose();
      glowMat.dispose();
    },
  };
}
