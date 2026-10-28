/**
 * Lantern blocks read as lanterns at the game camera's distance: the skin draws the block itself
 * (frame, warm glass, core — diorama.ts), this adds what a cube cannot show:
 *   - a cap with a little pyramid roof and a ring handle on top (one InstancedMesh);
 *   - a soft additive glow around it and a warm pool of light on the ground under it (one draw:
 *     two quads per lantern, billboarded / laid flat in the vertex shader). Brighter at night.
 * No light per lantern. Both draws exist on every quality level. Lanterns inside the boss's
 * wasteland pulse gently: they are the ones cracking its armour.
 *
 * Lanterns are only ever built (house, the child, the boss fight), so the list starts from the
 * world's edits and follows `block:placed` / `block:broken`.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { B } from '../world/blocks';

/** Lanterns drawn at most, nearest first, and how far from the focus. */
const MAX = 48;
const RANGE = 44;
const REFRESH = 0.25;

const keys = new Set<string>();
let caps: THREE.InstancedMesh | null = null;
let glowGeo: THREE.InstancedBufferGeometry | null = null;
let glow: THREE.Mesh | null = null;
let refreshT = 0;
let dirty = true;
const uniforms = { uTime: { value: 0 }, uNight: { value: 0 } };

/** Cap, pyramid roof, knob and ring handle, standing on the block's top (block bottom-centre = origin). */
function capGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, flat = false) => {
    const n = g.index ? g.toNonIndexed() : g;
    if (n !== g) g.dispose();
    if (flat) n.computeVertexNormals();
    n.rotateX(rx);
    n.rotateY(ry);
    n.translate(x, y, z);
    n.deleteAttribute('uv');
    parts.push(n);
  };
  add(new THREE.BoxGeometry(1.06, 0.1, 1.06), 0, 1.05, 0);
  add(new THREE.CylinderGeometry(0.13, 0.6, 0.28, 4, 1), 0, 1.24, 0, 0, Math.PI / 4, true);
  add(new THREE.CylinderGeometry(0.1, 0.12, 0.07, 10), 0, 1.41, 0);
  add(new THREE.TorusGeometry(0.17, 0.05, 8, 20), 0, 1.6, 0, -0.35);
  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return g;
}

const GLOW_VERT = /* glsl */ `
attribute vec3 aCenter;
attribute float aPulse;
uniform float uTime;
uniform float uNight;
varying vec2 vQ;
varying float vA;
varying float vGround;
void main() {
  vQ = position.xy;
  vGround = position.z;
  float p = aPulse * (0.5 + 0.5 * sin(uTime * 3.0 + aCenter.x * 1.3 + aCenter.z * 0.7));
  vec4 mv;
  if (position.z < 0.5) {
    // a halo facing the camera, a little in front of the block so the block does not cut it
    mv = modelViewMatrix * vec4(aCenter + vec3(0.0, 0.5, 0.0), 1.0);
    mv.xyz += normalize(-mv.xyz) * 0.85;
    mv.xy += position.xy * (1.3 + 0.35 * p);
    vA = mix(0.32, 0.9, uNight) * (1.0 + 0.7 * p);
  } else {
    // a warm pool of light on the ground around its foot
    mv = modelViewMatrix * vec4(aCenter + vec3(position.x, 0.0, position.y) * (2.4 + 0.5 * p) + vec3(0.0, 0.03, 0.0), 1.0);
    vA = mix(0.06, 0.62, uNight) * (1.0 + 0.6 * p);
  }
  gl_Position = projectionMatrix * mv;
}
`;

const GLOW_FRAG = /* glsl */ `
varying vec2 vQ;
varying float vA;
varying float vGround;
void main() {
  float d = length(vQ);
  float a = 1.0 - smoothstep(0.0, 1.0, d);
  a *= a;
  vec3 c = mix(vec3(1.0, 0.5, 0.14), vec3(1.0, 0.85, 0.5), a);
  gl_FragColor = vec4(c, a * vA);
}
`;

function glowGeometry(): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry();
  // two quads: z = 0 the camera-facing halo, z = 1 the pool on the ground
  const pos: number[] = [];
  const idx: number[] = [];
  for (const kind of [0, 1]) {
    const o = pos.length / 3;
    pos.push(-1, -1, kind, 1, -1, kind, 1, 1, kind, -1, 1, kind);
    // the ground quad is laid in x/z by the shader; both wind so they are seen from above / the front
    if (kind === 0) idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    else idx.push(o, o + 2, o + 1, o, o + 3, o + 2);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.setAttribute('aCenter', new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3));
  g.setAttribute('aPulse', new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1));
  g.instanceCount = 0;
  return g;
}

export function initLanterns(ctx: Ctx): void {
  for (const [k, id] of Object.entries(ctx.world.exportEdits())) if (id === B.LANTERN) keys.add(k);
  events.on('block:placed', ({ x, y, z, id }) => {
    if (id !== B.LANTERN) return;
    keys.add(`${x},${y},${z}`);
    dirty = true;
  });
  events.on('block:broken', ({ x, y, z }) => {
    if (keys.delete(`${x},${y},${z}`)) dirty = true;
  });

  const metal = new THREE.MeshStandardMaterial({ color: '#3b302b', roughness: 0.6, metalness: 0.1 });
  caps = new THREE.InstancedMesh(capGeometry(), metal, MAX);
  caps.name = 'lanternCaps';
  caps.count = 0;
  caps.frustumCulled = false;
  caps.castShadow = false;
  ctx.scene.add(caps);

  glowGeo = glowGeometry();
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  glow = new THREE.Mesh(glowGeo, mat);
  glow.name = 'lanternGlow';
  glow.frustumCulled = false;
  glow.renderOrder = 3;
  glow.userData.toyNoShadow = true;
  ctx.scene.add(glow);
}

const m4 = new THREE.Matrix4();
const near: [number, number, number, number][] = [];

/** Every frame: the glow breathes; every quarter second the nearest lanterns are picked again. */
export function updateLanterns(ctx: Ctx, dt: number): void {
  if (!caps || !glowGeo) return;
  uniforms.uTime.value += dt;
  uniforms.uNight.value = 1 - Math.min(1, Math.max(0, ctx.clock.daylight));
  refreshT -= dt;
  if (refreshT > 0 && !dirty) return;
  refreshT = REFRESH;
  dirty = false;

  const f = ctx.playing ? ctx.player.pos : (ctx.house?.centre ?? ctx.camera.position);
  near.length = 0;
  for (const k of keys) {
    const [x, y, z] = k.split(',').map(Number);
    const d = Math.hypot(x + 0.5 - f.x, z + 0.5 - f.z);
    if (d > RANGE) continue;
    if (ctx.world.getBlock(x, y, z) !== B.LANTERN) {
      keys.delete(k);
      continue;
    }
    near.push([x, y, z, d]);
  }
  near.sort((a, b) => a[3] - b[3]);
  const n = Math.min(MAX, near.length);
  const centre = glowGeo.getAttribute('aCenter') as THREE.InstancedBufferAttribute;
  const pulse = glowGeo.getAttribute('aPulse') as THREE.InstancedBufferAttribute;
  const boss = ctx.boss;
  for (let i = 0; i < n; i++) {
    const [x, y, z] = near[i];
    // a cap only where the top is open (a lantern under another block keeps its glow)
    m4.makeTranslation(x + 0.5, y, z + 0.5);
    if (ctx.world.getBlock(x, y + 1, z) !== 0) m4.makeScale(0, 0, 0);
    caps.setMatrixAt(i, m4);
    centre.setXYZ(i, x + 0.5, y, z + 0.5);
    pulse.setX(i, boss && boss.alive && boss.inZone(x + 0.5, z + 0.5) ? 1 : 0);
  }
  caps.count = n;
  caps.instanceMatrix.needsUpdate = true;
  glowGeo.instanceCount = n;
  centre.needsUpdate = true;
  pulse.needsUpdate = true;
}
