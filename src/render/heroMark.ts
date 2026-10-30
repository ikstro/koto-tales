/**
 * The mark of the hero the child plays: a slim gold ring of the skin's plastic lying on the
 * ground under their feet, with a soft gold glow along it, breathing gently (DESIGN.md
 * «Camera»). The helpers have none. On a switch it pops up under the new hero with a little
 * hop (the hero selection spring, 240 / 14). While the hero jumps it stays on the ground below,
 * in water it floats on the surface. No light: a flat piece and a quad.
 */
import * as THREE from 'three';
import type { Ctx } from '../core/ctx';
import { events } from '../core/events';

const GOLD = '#ffd23a';
/** The ring's radius around a hero's body. */
const AROUND = 0.32;
/** Water tops sit this high in their block (world/mesher.ts). */
const WATER_TOP = 0.9;

let root: THREE.Group | null = null;
let ring: THREE.Mesh | null = null;
let glow: THREE.Mesh | null = null;
const uniforms = { uTime: { value: 0 }, uR: { value: 0.6 } };
let t = 0;
/** The pop after a switch: scale and its speed (a damped spring towards 1), seconds since. */
let pop = 1;
let popV = 0;
let since = 9;

const GLOW_VERT = /* glsl */ `
varying vec2 vQ;
void main() {
  vQ = position.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const GLOW_FRAG = /* glsl */ `
uniform float uTime;
uniform float uR;
varying vec2 vQ;
void main() {
  float d = abs(length(vQ) - uR) / 0.32;
  float a = exp(-d * d * 2.5) * (0.42 + 0.12 * sin(uTime * 2.4));
  gl_FragColor = vec4(1.0, 0.86, 0.36, a);
}
`;

export function initHeroMark(ctx: Ctx): void {
  root = new THREE.Group();
  root.name = 'heroMark';
  root.visible = false;

  ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.085, 8, 40).rotateX(Math.PI / 2).scale(1, 0.55, 1), ctx.skin.partMaterial(GOLD));
  ring.castShadow = false;
  ring.receiveShadow = true;
  ring.position.y = 0.04;

  glow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 2.2).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: GLOW_VERT,
      fragmentShader: GLOW_FRAG,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  glow.position.y = 0.02;
  glow.renderOrder = 2;

  root.add(glow, ring);
  ctx.scene.add(root);

  events.on('hero:switch', () => {
    pop = 0;
    popV = 0;
    since = 0;
  });
}

/** Where the ground (or the water's surface) is under a point, from its block down. */
function groundUnder(ctx: Ctx, x: number, y: number, z: number): number {
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  const fy = Math.floor(y + 0.01);
  for (let by = fy; by > fy - 8; by--) {
    if (ctx.world.isWater(bx, by, bz)) return by + WATER_TOP;
    if (ctx.world.isSolid(bx, by, bz)) return by + 1;
  }
  return y;
}

export function updateHeroMark(ctx: Ctx, dt: number): void {
  if (!root || !ring || !glow) return;
  const hero = ctx.player;
  root.visible = ctx.playing && !ctx.sleeping && !!hero;
  if (!root.visible) return;
  dt = Math.min(dt, 0.05);
  t += dt;
  since += dt;
  uniforms.uTime.value = t;

  // the hero selection spring (240 / 14), a small hop in its first third of a second
  popV += (240 * (1 - pop) - 14 * popV) * dt;
  pop += popV * dt;
  const hop = since < 0.32 ? Math.sin((since / 0.32) * Math.PI) * 0.3 : 0;

  const b = hero.body;
  const p = hero.pos;
  root.position.set(p.x, b.onGround ? p.y : groundUnder(ctx, p.x, p.y, p.z), p.z);
  root.position.y += hop;
  const r = (b.radius + AROUND) * (1 + 0.04 * Math.sin(t * 2.4));
  ring.scale.setScalar(r * Math.max(0, pop));
  glow.scale.setScalar(Math.max(0, pop));
  uniforms.uR.value = r;
}
