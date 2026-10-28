/**
 * World debug page (debug-world.html): the world alone, with the game camera
 * or an overview. URL: ?skin=pixel|toy|hybrid|diorama&x=&z=&time=0..1&overview=1&hud=0&tier=0|1
 * &demo=1 (a brick tower and a wall next to the focus)
 * Keys: WASD / arrows pan, O overview, N advance time by 0.1.
 * Sets `window.__ready = true` once the chunks around the focus are meshed.
 */
import * as THREE from 'three';
import { createSkin, type AnySkin } from '../render/skins';
import { B } from '../world/blocks';
import { World } from '../world/World';

declare global {
  interface Window {
    __ready?: boolean;
    __world?: World;
  }
}

const q = new URLSearchParams(location.search);
const num = (k: string): number | null => {
  const v = q.get(k);
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const SEED = 20261128;
const GAME_OFFSET = new THREE.Vector3(0, 13, 10.5);
const OVERVIEW_OFFSET = new THREE.Vector3(0, 125, 95);

const canvas = document.getElementById('c') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLDivElement;
if (q.get('hud') === '0') hud.style.display = 'none';

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 220);
const skin = createSkin((q.get('skin') as AnySkin | null) ?? 'pixel');
const qTier = num('tier');
if (qTier === 0 || qTier === 1) skin.setTier(qTier);
skin.setupScene(scene, renderer);
const sceneFog = scene.fog;

const world = new World(scene, { seed: SEED, renderDistance: 5 }, skin);
window.__world = world;
let generated = 0;
world.onChunkGenerated = () => generated++;

const qx = num('x');
const qz = num('z');
const focus =
  qx !== null || qz !== null
    ? new THREE.Vector3((qx ?? 0) + 0.5, 0, (qz ?? 0) + 0.5)
    : world.findSpawn(0, 0);
focus.y = world.groundHeight(Math.floor(focus.x), Math.floor(focus.z));

/** ?demo=1: a coloured-brick tower and a plank/brick wall next to the focus. */
if (q.get('demo') === '1') {
  const fx = Math.floor(focus.x);
  const fz = Math.floor(focus.z);
  const column = (x: number, z: number, ids: number[]) => {
    const g = world.groundHeight(x, z);
    ids.forEach((id, i) => world.setBlock(x, g + i, z, id));
  };
  const rainbow = [B.RED, B.ORANGE, B.YELLOW, B.GREEN, B.BLUE, B.PURPLE, B.PINK];
  // tower: 2×2, a colour per layer, a lantern on top
  for (const [dx, dz] of [
    [3, -1],
    [4, -1],
    [3, 0],
    [4, 0],
  ])
    column(fx + dx, fz + dz, rainbow.slice(0, 5));
  column(fx + 3, fz - 1, [...rainbow.slice(0, 5), B.LANTERN]);
  // wall: planks and brick rows, a glass window, gold on the corner
  for (let dx = -5; dx <= -1; dx++) {
    const pane = dx === -3;
    column(fx + dx, fz - 2, [B.BRICK, pane ? B.GLASS : B.PLANKS, B.BRICK, dx === -1 ? B.GOLD : B.PLANKS]);
  }
  column(fx + 1, fz + 2, [B.WHITE, B.BLUE]);
  column(fx + 2, fz + 2, [B.YELLOW]);
  focus.y = world.groundHeight(fx, fz);
}

let time = num('time') ?? 0.3;
let overview = q.get('overview') === '1';
const daylightOf = (t: number) => Math.min(1, Math.max(0, 0.5 + 0.8 * Math.sin(t * Math.PI * 2)));

// a hero-sized box so the scale reads
const hero = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.5, 0.6), skin.partMaterial('#e53935'));
scene.add(hero);

function placeCamera(): void {
  hero.position.set(focus.x, focus.y + 0.75, focus.z);
  if (overview) {
    camera.far = 600;
    camera.position.copy(focus).add(OVERVIEW_OFFSET);
    camera.lookAt(focus);
    scene.fog = null;
  } else {
    camera.far = 220;
    camera.position.copy(focus).add(GAME_OFFSET);
    camera.lookAt(focus.x, focus.y + 0.8, focus.z);
    scene.fog = sceneFog;
  }
  camera.updateProjectionMatrix();
}

// warm up synchronously so the first frame is complete
const tWarm = performance.now();
for (let i = 0; i < 400 && !world.isIdle(); i++) world.update(focus);
const warmMs = performance.now() - tWarm;

const keys = new Set<string>();
window.addEventListener('keydown', (e) => {
  keys.add(e.key.toLowerCase());
  if (e.key === 'o' || e.key === 'O') overview = !overview;
  if (e.key === 'n' || e.key === 'N') time = (time + 0.1) % 1;
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

let last = performance.now();
let fpsAcc = 0;
let fpsN = 0;
let fps = 0;
let idleFrames = 0;

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  fpsAcc += dt;
  fpsN++;
  if (fpsAcc > 0.5) {
    fps = fpsN / fpsAcc;
    fpsAcc = 0;
    fpsN = 0;
  }

  const speed = (overview ? 60 : 12) * dt;
  if (keys.has('w') || keys.has('arrowup')) focus.z -= speed;
  if (keys.has('s') || keys.has('arrowdown')) focus.z += speed;
  if (keys.has('a') || keys.has('arrowleft')) focus.x -= speed;
  if (keys.has('d') || keys.has('arrowright')) focus.x += speed;
  if (keys.size) focus.y = world.groundHeight(Math.floor(focus.x), Math.floor(focus.z));

  world.update(focus);
  const daylight = daylightOf(time);
  world.setDaylight(daylight);
  skin.updateScene(daylight, focus);
  placeCamera();
  skin.render(renderer, scene, camera);

  if (world.isIdle()) {
    if (++idleFrames === 2) window.__ready = true;
  } else idleFrames = 0;

  const s = world.stats;
  hud.textContent =
    `fps ${fps.toFixed(0)}  skin ${skin.id}  time ${time.toFixed(2)} (day ${daylight.toFixed(2)})\n` +
    `focus ${focus.x.toFixed(0)},${focus.y.toFixed(0)},${focus.z.toFixed(0)}  biome ${world.biomeAt(focus.x, focus.z)}\n` +
    `chunks ${s.loaded}  data ${s.dataChunks}  generated ${generated}\n` +
    `mesh avg ${(s.meshMs / Math.max(1, s.meshed)).toFixed(2)} ms  last ${s.lastMeshMs.toFixed(2)} ms  warmup ${warmMs.toFixed(0)} ms\n` +
    `tris ${renderer.info.render.triangles}  calls ${renderer.info.render.calls}\n` +
    `WASD pan · O overview · N time`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
