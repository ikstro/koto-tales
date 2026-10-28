/**
 * «Розбуди героїв» — the start ritual, played inside the running world.
 *
 * Night, the lantern glowing, the roof lifted off. Льоша and Соломія sleep in
 * their beds, Пупся on her cushion; round «z» float up and soft pulses invite
 * a touch. No words. The child touches a hero (that touch also unlocks sound
 * and asks for fullscreen): the hero stretches and yawns inside a ring of gold
 * studs and says hello, the other two wake, hop off and cheer, the door swings
 * open, the light turns to morning, and the camera follows the chosen hero out
 * to the doorstep, where `game.begin` hands over control.
 *
 * Cheap on purpose: the world is the game's own; one warm lamp (the house's),
 * a few instanced meshes and glow planes, no extra render passes.
 */
import * as THREE from 'three';
import type { CharacterModel, HeroId } from '../contracts';
import { WAKE_YAWN } from '../assets/animate';
import { CUSHION_TOP } from '../assets/props';
import { HEROES, HERO_ORDER } from '../content/heroes';
import { HOUSE } from '../content/house';
import type { Ctx } from '../core/ctx';
import type { Game, Intro } from '../core/game';
import type { HeroHandoff } from '../systems/heroes';
import { LAMP_NIGHT } from '../systems/house';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';

/** Asks for fullscreen and landscape where the browser allows it (Android Chrome does). */
async function goFullscreen(): Promise<void> {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    }
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await o.lock?.('landscape');
  } catch {
    // Desktop browsers and iOS refuse; the game works the same in a window.
  }
}

// ─── easing ─────────────────────────────────────────────────────────────────
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ramp = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const bump = (a: number, b: number, x: number) => (x <= a || x >= b ? 0 : Math.sin((Math.PI * (x - a)) / (b - a)));
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
/** Damped spring 0→1 (a bouncy preset), t in seconds since it started. */
const spring = (t: number, freq = 2.4, zeta = 0.42) => {
  if (t <= 0) return 0;
  const w = 2 * Math.PI * freq;
  const wd = w * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + ((zeta * w) / wd) * Math.sin(wd * t));
};

// ─── timeline: seconds after the touch ──────────────────────────────────────
const CHOSEN_WAKE = 0.06;
/** The chosen hero's hello, right after the yawn. */
const LINE = 1.35;
const OTHERS_WAKE = 1.25;
/** Delay between the second and third hero for every step. */
const STAGGER = 0.15;
const HOP = 0.37;
const DOOR = 1.65;
const DAY: [number, number] = [1.75, 2.8];
const WALK = [2.4, 2.65, 2.92];
/** Average walking speed out of the house, blocks per second. */
const WALK_SPEED = 3.8;
/** The roof comes back over this long, starting just before the chosen hero reaches the doorstep. */
const ROOF_IN = 0.7;
/** The simulated touch of ?wakeTap comes this long after the ritual starts. */
const TEST_TAP_AFTER = 1.2;

/** Cool moonlight on the yard (the skin's night sun, tinted and brightened). */
const MOON = new THREE.Color(0x6a86ff);

/** Smallest hit radius around a sleeping head, CSS px. */
const HIT_MIN = 110;

type P2 = [number, number];

interface Sleeper {
  id: HeroId;
  model: CharacterModel;
  biped: boolean;
  head: THREE.Object3D | null;
  /** World feet position while asleep. */
  spot: THREE.Vector3;
  yaw: number;
  /** Centre of the sleeping body, for the hit test. */
  centre: THREE.Vector3;
  // set at the touch
  wakeAt: number;
  cheerAt: number;
  hop: [number, number] | null;
  land: THREE.Vector3;
  path: P2[];
  walk: [number, number];
  endYaw: number;
  fired: Set<string>;
  prev: THREE.Vector3;
}

/** Walk along a polyline between t0 and t1 with a soft start and stop. Returns [x, z, distance walked]. */
function walkAt(points: P2[], t0: number, t1: number, t: number): [number, number, number] {
  const u = clamp01((t - t0) / (t1 - t0));
  const s = u - Math.sin(2 * Math.PI * u) / (2 * Math.PI);
  const len = pathLength(points);
  let d = s * len;
  for (let i = 1; i < points.length; i++) {
    const seg = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    if (d <= seg || i === points.length - 1) {
      const k = seg > 0 ? Math.min(1, d / seg) : 1;
      return [mix(points[i - 1][0], points[i][0], k), mix(points[i - 1][1], points[i][1], k), s * len];
    }
    d -= seg;
  }
  return [points[0][0], points[0][1], 0];
}

function pathLength(points: P2[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return len;
}

interface CamKey {
  t: number;
  p: THREE.Vector3;
  l: THREE.Vector3;
}

/** Catmull-Rom through time-keyed points (continuous velocity), eased into the last key. */
function camAt(keys: CamKey[], t: number, key: 'p' | 'l', out: THREE.Vector3): THREE.Vector3 {
  const last = keys.length - 1;
  t = Math.min(t, keys[last].t);
  let i = 0;
  while (i < last - 1 && t > keys[i + 1].t) i++;
  const a = keys[Math.max(0, i - 1)];
  const b = keys[i];
  const c = keys[i + 1];
  const d = keys[Math.min(last, i + 2)];
  let u = (t - b.t) / (c.t - b.t);
  if (i === last - 1) u = 1 - (1 - u) * (1 - u);
  const m1 = new THREE.Vector3().subVectors(c[key], a[key]).multiplyScalar((c.t - b.t) / Math.max(1e-6, c.t - a.t));
  const m2 = new THREE.Vector3().subVectors(d[key], b[key]).multiplyScalar((c.t - b.t) / Math.max(1e-6, d.t - b.t));
  if (i === 0) m1.subVectors(c[key], b[key]).multiplyScalar(0.5);
  if (i === last - 1) m2.set(0, 0, 0);
  const u2 = u * u;
  const u3 = u2 * u;
  return out
    .copy(b[key])
    .multiplyScalar(2 * u3 - 3 * u2 + 1)
    .addScaledVector(m1, u3 - 2 * u2 + u)
    .addScaledVector(c[key], -2 * u3 + 3 * u2)
    .addScaledVector(m2, u3 - u2);
}

/** A soft round glow texture for the pulses and the ring's halo. */
function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The patch of morning light the open door lays on the floor: bright at the door, fading inwards. */
function doorLightTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 128;
  const g = c.getContext('2d')!;
  const v = g.createLinearGradient(0, 128, 0, 0);
  v.addColorStop(0, 'rgba(255,255,255,1)');
  v.addColorStop(0.55, 'rgba(255,255,255,0.45)');
  v.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = v;
  g.fillRect(0, 0, 32, 128);
  g.globalCompositeOperation = 'destination-in';
  const h = g.createLinearGradient(0, 0, 32, 0);
  h.addColorStop(0, 'rgba(0,0,0,0)');
  h.addColorStop(0.25, 'rgba(0,0,0,1)');
  h.addColorStop(0.75, 'rgba(0,0,0,1)');
  h.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = h;
  g.fillRect(0, 0, 32, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Effects never cast or take the skin's shadows. */
function noShadow(o: THREE.Object3D): void {
  o.traverse((c) => {
    c.castShadow = false;
    c.receiveShadow = false;
    c.userData.toyNoShadow = true;
    c.userData.toyShadow = true;
  });
}

/**
 * Plays the ritual until the hero is chosen and out of the door, then calls
 * `game.begin` with the heroes already standing there. Resolves with the hero.
 */
export function wakeHeroes(ctx: Ctx, game: Game): Promise<HeroId> {
  return new Promise((resolve) => {
    const house = ctx.house!;
    const { scene, skin, camera } = ctx;
    const O = house.origin;
    const at = (dx: number, dy: number, dz: number) => new THREE.Vector3(O.x + dx, O.y + dy, O.z + dz);
    const floorY = O.y + 1;
    const hemi = scene.children.find((o) => (o as THREE.HemisphereLight).isHemisphereLight) as THREE.HemisphereLight | undefined;
    const sun = scene.children.find((o) => (o as THREE.DirectionalLight).isDirectionalLight) as THREE.DirectionalLight | undefined;

    // ─── the sleepers ───
    const sleepers: Sleeper[] = HERO_ORDER.map((id) => {
      const s = HOUSE.sleepSpots[id];
      const model = ctx.models.character(HEROES[id].model);
      const spot = at(s.dx, s.dy, s.dz);
      model.root.position.copy(spot);
      model.root.rotation.y = s.yaw;
      model.play('sleep');
      model.update(0, 0);
      scene.add(model.root);
      model.root.updateMatrixWorld(true);
      const centre = new THREE.Box3().setFromObject(model.root).getCenter(new THREE.Vector3());
      return {
        id,
        model,
        biped: id !== 'pupsia',
        head: model.root.getObjectByName('head') ?? null,
        spot,
        yaw: s.yaw,
        centre,
        wakeAt: Infinity,
        cheerAt: Infinity,
        hop: null,
        land: spot.clone(),
        path: [],
        walk: [Infinity, Infinity],
        endYaw: 0,
        fired: new Set(),
        prev: spot.clone(),
      };
    });
    const headPos = (h: Sleeper, out: THREE.Vector3) =>
      h.head ? h.head.getWorldPosition(out) : out.copy(h.model.root.position).setY(h.model.root.position.y + 1);

    // ─── the house at night ───
    for (const b of Object.values(house.beds)) b.fold(0);
    house.door.setOpen(0);
    // The roof stays in place but draws nothing: it still shades the room from the moon.
    for (const m of house.roofMaterials) {
      m.opacity = 0;
      m.colorWrite = false;
      m.depthWrite = false;
    }
    house.roof.visible = true;
    house.roofFade = 0;

    // ─── effects (all dropped at the end) ───
    const disposables: { dispose(): void }[] = [];
    const fx = new THREE.Group();
    fx.name = 'wake-fx';
    scene.add(fx);
    const glowTex = glowTexture();
    disposables.push(glowTex);
    const discGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    disposables.push(discGeo);
    const disc = (color: string, size: number) => {
      const mat = new THREE.MeshBasicMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
      disposables.push(mat);
      const m = new THREE.Mesh(discGeo, mat);
      m.userData.size = size;
      m.renderOrder = 2;
      fx.add(m);
      return m;
    };
    const setDisc = (d: THREE.Mesh, p: THREE.Vector3, opacity: number, scale: number) => {
      d.position.set(p.x, p.y + 0.03, p.z);
      d.scale.setScalar(d.userData.size * scale);
      (d.material as THREE.MeshBasicMaterial).opacity = opacity;
      d.visible = opacity > 0.003;
    };
    const pulses = sleepers.map((h) => disc('#ffcf7a', h.biped ? 2.2 : 2.0));

    // the chosen ring: round gold studs that pop in one after another
    const RING_N = 16;
    const studGeo = new THREE.CylinderGeometry(0.075, 0.08, 0.07, 12);
    disposables.push(studGeo);
    const ring = new THREE.InstancedMesh(studGeo, skin.partMaterial('#f2b52e', { emissive: true }), RING_N);
    ring.frustumCulled = false;
    ring.visible = false;
    fx.add(ring);
    const ringGlow = disc('#ffb43c', 2.6);

    // «z» of eleven round pieces each, three in flight per sleeper
    const Z_DOTS: P2[] = [
      [-0.15, 0.15], [-0.05, 0.15], [0.05, 0.15], [0.15, 0.15],
      [0.075, 0.075], [0, 0], [-0.075, -0.075],
      [-0.15, -0.15], [-0.05, -0.15], [0.05, -0.15], [0.15, -0.15],
    ];
    const Z_PER = 3;
    const zGeo = new THREE.CylinderGeometry(0.058, 0.058, 0.04, 10).rotateX(Math.PI / 2);
    disposables.push(zGeo);
    const zees = new THREE.InstancedMesh(zGeo, skin.partMaterial('#fff4d6', { emissive: true }), sleepers.length * Z_PER * Z_DOTS.length);
    zees.frustumCulled = false;
    fx.add(zees);

    // morning light on the floor from the open door
    const doorTex = doorLightTexture();
    disposables.push(doorTex);
    const doorGeo = new THREE.PlaneGeometry(1, 1);
    {
      // a trapezoid: door-wide at the door, wider inside
      const p = doorGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setX(i, p.getX(i) * 1.9);
    }
    doorGeo.rotateX(-Math.PI / 2);
    disposables.push(doorGeo);
    const doorMat = new THREE.MeshBasicMaterial({ map: doorTex, color: '#ffc95e', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    disposables.push(doorMat);
    const doorLight = new THREE.Mesh(doorGeo, doorMat);
    doorLight.scale.set(1.25, 1, 3.6);
    doorLight.position.copy(at(4.5, 1.03, 4.2));
    doorLight.renderOrder = 2;
    fx.add(doorLight);
    noShadow(fx);

    // ─── the touch layer (no words, the whole screen listens) ───
    const ui = document.getElementById('ui')!;
    const layer = document.createElement('div');
    layer.className = 'wake-tap';
    ui.appendChild(layer);
    const ripple = (x: number, y: number, hit: boolean) => {
      const r = document.createElement('div');
      r.className = hit ? 'wake-ripple hit' : 'wake-ripple';
      r.style.left = `${x}px`;
      r.style.top = `${y}px`;
      ui.appendChild(r);
      setTimeout(() => r.remove(), 700);
    };

    // ─── state ───
    let T = 0; // seconds since the ritual began
    let tapT = -1; // T of the touch, -1 before it
    let missT = -10; // a touch that hit nobody: the pulses flash
    let chosen: Sleeper | null = null;
    let endT = Infinity; // tau when control is handed over
    let daylight = 0;
    let dayK = 0;
    let done = false;
    let keys: CamKey[] = [];
    let mouth: THREE.Group | null = null;
    const look = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    const tmp2 = new THREE.Vector3();
    const m4 = new THREE.Matrix4();
    const q4 = new THREE.Quaternion();
    const s4 = new THREE.Vector3();
    const p4 = new THREE.Vector3();
    const qz = new THREE.Quaternion();
    const zAxis = new THREE.Vector3(0, 0, 1);

    /** Pre-touch wide view of the room, pulled back on narrow screens so all three beds fit. */
    const wide = (p: THREE.Vector3, l: THREE.Vector3) => {
      l.copy(at(4.5, 1.0, 3.3));
      const fit = Math.max(1, 1.45 / Math.max(0.3, camera.aspect)) ** 0.9;
      p.copy(l).add(tmp.set(0, 11.6, 7.3).multiplyScalar(fit));
      p.x += 0.35 * Math.sin(T * 0.25);
      p.y += 0.15 * Math.sin(T * 0.31);
    };

    /** Where a hero is at tau (seconds after the touch). */
    const poseAt = (h: Sleeper, tau: number, out: THREE.Vector3) => {
      if (!h.biped) {
        const [x, z, d] = walkAt(h.path, h.walk[0], h.walk[1], tau);
        out.set(x, floorY + CUSHION_TOP * clamp01(1 - (d - 0.45) / 0.3), z);
        return;
      }
      if (!h.hop || tau < h.hop[1]) {
        const k = h.hop ? ramp(h.hop[0], h.hop[1], tau) : 0;
        out.lerpVectors(h.spot, h.land, k);
        if (h.hop) out.y += 0.55 * bump(h.hop[0], h.hop[1], tau);
        return;
      }
      const [x, z] = walkAt(h.path, h.walk[0], h.walk[1], tau);
      out.set(x, floorY, z);
    };

    /** The touch: plan everyone's moves around the chosen hero. */
    const choose = (h: Sleeper) => {
      chosen = h;
      tapT = T;
      layer.remove();
      sfx.play('wake');
      sfx.ambient('night');
      const others = sleepers.filter((s) => s !== h);
      // places on the doorstep: the chosen in the middle, Льоша's side left, Соломія's right
      const middle: P2 = [4.5, 7.6];
      const left: P2 = [3.3, 8.0];
      const right: P2 = [5.7, 8.0];
      const ends = new Map<Sleeper, P2>([[h, middle]]);
      const leftOne = others.find((o) => o.id === 'lyosha') ?? others.find((o) => o.id !== 'solomiia')!;
      ends.set(leftOne, left);
      ends.set(others.find((o) => o !== leftOne)!, right);

      const plan = (s: Sleeper, order: number) => {
        const isChosen = s === h;
        const k = isChosen ? 0 : order - 1;
        s.wakeAt = isChosen ? CHOSEN_WAKE : OTHERS_WAKE + k * STAGGER;
        if (s.biped) {
          const h0 = isChosen ? 1.5 : 1.65 + k * STAGGER;
          s.hop = [h0, h0 + HOP];
          const side = Math.sign(O.x + 4.5 - s.spot.x) || 1;
          s.land.set(s.spot.x + side * 1.05, floorY, s.spot.z + 1.1);
          s.cheerAt = isChosen ? 1.9 : 2.05 + k * STAGGER;
        } else {
          s.land.copy(s.spot);
          s.cheerAt = isChosen ? 1.5 : 2.05 + k * STAGGER;
        }
        const end = ends.get(s)!;
        const sx = s.land.x - O.x;
        const sz = s.land.z - O.z;
        s.path = [
          [sx, sz],
          [mix(sx, 4.5, 0.65), 5.3],
          [4.5, 6.45],
          [4.5, 7.15],
          end,
        ].map(([x, z]) => [O.x + x, O.z + z] as P2);
        const t0 = WALK[order];
        s.walk = [t0, t0 + Math.max(0.9, pathLength(s.path) / WALK_SPEED)];
        s.endYaw = end === middle ? 0 : end === left ? 0.35 : -0.35;
      };
      plan(h, 0);
      others.forEach((o, i) => plan(o, i + 1));
      // a short beat on the doorstep, all three together, before control is handed over
      endT = Math.max(...sleepers.map((s) => s.walk[1])) + 0.5;

      // a yawning mouth on the chosen face, open only during the yawn
      if (h.head) {
        mouth = new THREE.Group();
        const holeGeo = new THREE.BoxGeometry(h.biped ? 0.13 : 0.15, h.biped ? 0.11 : 0.13, 0.02);
        const tongueGeo = new THREE.BoxGeometry(h.biped ? 0.08 : 0.09, 0.04, 0.022);
        disposables.push(holeGeo, tongueGeo);
        const hole = new THREE.Mesh(holeGeo, skin.partMaterial('#4a1a1c'));
        const tongue = new THREE.Mesh(tongueGeo, skin.partMaterial('#ef7f8f'));
        tongue.position.set(0, h.biped ? -0.035 : -0.04, 0.002);
        mouth.add(hole, tongue);
        mouth.position.set(0, h.biped ? 0.1 : -0.085, h.biped ? 0.236 : 0.334);
        mouth.visible = false;
        noShadow(mouth);
        h.head.add(mouth);
      }

      // camera: from where it is, in close on the chosen one, back over the room, out of the door
      const biped = h.biped;
      const s = biped ? 1.5 : 1;
      const F = h.spot.clone().add(new THREE.Vector3(0, biped ? 0.85 : 0.2, biped ? 0 : 0.1));
      const off = (x: number, y: number, z: number) => F.clone().add(new THREE.Vector3(x, y, z).multiplyScalar(s));
      const endPos = new THREE.Vector3(O.x + middle[0], floorY, O.z + middle[1]);
      const endP = new THREE.Vector3();
      const endL = new THREE.Vector3();
      game.cam.poseFor(endPos, endP, endL);
      keys = [
        { t: 0, p: camera.position.clone(), l: look.clone() },
        { t: 0.45, p: off(0.1, 5.1, 2.9), l: F.clone().add(new THREE.Vector3(0, 0.1, 0.1)) },
        { t: 1.05, p: off(0.2, 2.4, 2.55), l: F.clone() },
        { t: 1.55, p: off(0.05, 4.9, 2.65), l: F.clone() },
        { t: 2.1, p: at(4.5, 9.8, 8.9), l: at(4.5, 1.0, 3.9) },
        // out of the door together with the chosen hero, not ahead of them
        { t: Math.max(2.8, h.walk[1] - 0.15), p: at(4.5, 9.2, 12.2), l: at(4.5, 1.3, 7.0) },
        { t: endT, p: endP, l: endL },
      ];
    };

    const tryTouch = (e: PointerEvent) => {
      e.preventDefault();
      voice.unlock();
      sfx.unlock();
      if (chosen) return;
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      const toScreen = (v: THREE.Vector3): P2 => {
        const p = tmp2.copy(v).project(camera);
        return [rect.left + (p.x * 0.5 + 0.5) * rect.width, rect.top + (-p.y * 0.5 + 0.5) * rect.height];
      };
      const radius = Math.max(HIT_MIN, 0.13 * Math.min(rect.width, rect.height));
      let best: Sleeper | null = null;
      let bestD = radius;
      for (const h of sleepers) {
        for (const p of [headPos(h, tmp), h.centre]) {
          const [sx, sy] = toScreen(p);
          const d = Math.hypot(sx - e.clientX, sy - e.clientY);
          if (d < bestD) {
            bestD = d;
            best = h;
          }
        }
      }
      ripple(e.clientX, e.clientY, !!best);
      if (!best) {
        missT = T;
        return;
      }
      void goFullscreen();
      choose(best);
    };
    layer.addEventListener('pointerdown', tryTouch);

    const finish = () => {
      done = true;
      const h = chosen!;
      mouth?.removeFromParent();
      for (const b of Object.values(house.beds)) b.fold(1);
      house.door.setOpen(1);
      for (const m of house.roofMaterials) {
        m.opacity = 1;
        m.colorWrite = true;
        m.depthWrite = true;
      }
      house.roofFade = 1;
      fx.removeFromParent();
      ring.dispose();
      zees.dispose();
      for (const d of disposables) d.dispose();
      const handoff: Partial<Record<HeroId, HeroHandoff>> = {};
      for (const s of sleepers) handoff[s.id] = { model: s.model, pos: s.model.root.position.clone(), yaw: s.model.root.rotation.y };
      game.begin(h.id, handoff);
      resolve(h.id);
    };

    // ─── per frame ───
    const update = (dt: number) => {
      if (done) return;
      const hold = ctx.params.wakeHold;
      // ?wakeHold: stop exactly at that moment (heroes and camera freeze, the world keeps drawing)
      if (chosen && hold !== null) dt = Math.max(0, Math.min(dt, tapT + hold - T));
      T += dt;
      if (!chosen && ctx.params.wakeTap && T >= TEST_TAP_AFTER) choose(sleepers.find((s) => s.id === ctx.params.wakeTap)!);
      const tau = chosen ? T - tapT : -1;

      // heroes
      for (const h of sleepers) {
        if (chosen) {
          const fire = (name: string, when: number, fn: () => void) => {
            if (!h.fired.has(name) && tau >= when) {
              h.fired.add(name);
              fn();
            }
          };
          fire('wake', h.wakeAt, () => h.model.play(h === chosen ? 'wake' : 'idle'));
          fire('cheer', h.cheerAt, () => h.model.play('cheer'));
          poseAt(h, tau, tmp);
        } else tmp.copy(h.spot);
        const vx = tmp.x - h.prev.x;
        const vz = tmp.z - h.prev.z;
        const speed = dt > 0 ? Math.hypot(vx, vz) / dt : 0;
        if (dt <= 0) continue; // held (?wakeHold): keep the pose, don't snap it
        h.prev.copy(tmp);
        h.model.root.position.copy(tmp);
        if (chosen) {
          let want = h.yaw;
          if (speed > 0.4) want = Math.atan2(vx, vz);
          else if (tau > h.walk[1]) want = h.endYaw;
          else if (!h.biped && tau > h.wakeAt) want = 0.05;
          else if (h.hop && tau > h.hop[0]) want = Math.sign(O.x + 4.5 - h.spot.x) * 0.55;
          let dy = want - h.yaw;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          h.yaw += dy * (1 - Math.exp(-10 * dt));
        }
        h.model.root.rotation.y = h.yaw;
        h.model.update(dt, Math.min(speed, 4.5));
      }

      if (chosen) {
        const c: Sleeper = chosen;
        if (tau >= LINE && !c.fired.has('line')) {
          c.fired.add('line');
          voice.say(HEROES[c.id].lines.hi, { interrupt: true, priority: 9 });
        }
        if (tau >= DOOR && !c.fired.has('door')) {
          c.fired.add('door');
          sfx.play('door');
        }
        if (tau >= DAY[0] && !c.fired.has('morning')) {
          c.fired.add('morning');
          // every session starts in the morning
          ctx.clock.t = ctx.params.time ?? 0.03;
          sfx.ambient('day');
        }
        // the yawn
        if (mouth) {
          const y = bump(c.wakeAt + WAKE_YAWN[0], c.wakeAt + WAKE_YAWN[1], tau);
          mouth.scale.set(1 + 0.15 * y, Math.max(0.001, y * 1.25), 1);
          mouth.visible = y > 0.01;
        }
      }

      // house
      for (const h of sleepers) {
        const bed = house.beds[h.id];
        if (bed) bed.fold(chosen ? ramp(h.wakeAt, h.wakeAt + 0.35, tau) : 0);
      }
      house.door.setOpen(chosen ? spring(tau - DOOR, 1.5, 0.5) : 0);
      dayK = chosen ? ramp(DAY[0], DAY[1], tau) : 0;
      daylight = mix(0, ctx.clock.daylight, dayK);
      house.lamp.intensity = mix(LAMP_NIGHT, 1.2, dayK) * (1 + 0.04 * Math.sin(T * 9.1));
      const roofAt = chosen ? chosen.walk[1] - 0.3 : Infinity;
      const rf = chosen ? ramp(roofAt, roofAt + ROOF_IN, tau) : 0;
      for (const m of house.roofMaterials) {
        m.opacity = rf;
        m.colorWrite = rf > 0.001;
        m.depthWrite = rf > 0.98;
      }

      // camera
      if (chosen) {
        camAt(keys, tau, 'p', camera.position);
        camAt(keys, tau, 'l', look);
      } else wide(camera.position, look);
      camera.lookAt(look);
      camera.updateMatrixWorld();

      // invitation pulses, then the chosen ring
      const breath = (ph: number) => 0.5 + 0.5 * Math.sin(T * 2 * Math.PI * 0.62 + ph);
      const flash = bump(missT, missT + 0.7, T);
      const pre = ramp(0.15, 0.7, T) * (chosen ? 1 - ramp(0, 0.25, tau) : 1);
      sleepers.forEach((h, i) => {
        const b = breath(i * 2.1);
        setDisc(pulses[i], h.spot, pre * (0.2 + 0.22 * b + 0.35 * flash), 0.9 + 0.12 * b + 0.15 * flash);
      });
      ring.visible = !!chosen;
      if (chosen) {
        const c: Sleeper = chosen;
        const pp = c.model.root.position;
        const out = 1 - ramp(endT - 0.35, endT, tau);
        ring.position.set(pp.x, pp.y + 0.01, pp.z);
        ring.rotation.y = T * 0.5;
        const R = c.biped ? 0.7 : 0.78;
        for (let i = 0; i < RING_N; i++) {
          const k = spring(tau - 0.02 - i * 0.022, 2.6, 0.38) * out;
          const a = (i / RING_N) * Math.PI * 2;
          p4.set(Math.cos(a) * R, 0.035, Math.sin(a) * R);
          ring.setMatrixAt(i, m4.compose(p4, q4.identity(), s4.setScalar(Math.max(0.001, k))));
        }
        ring.instanceMatrix.needsUpdate = true;
        const pop = bump(0, 0.6, tau);
        setDisc(ringGlow, pp, (ramp(0, 0.3, tau) * (0.42 + 0.06 * breath(0)) + pop * 0.5) * out, 1 + 0.25 * pop);
      } else setDisc(ringGlow, look, 0, 1);

      // z's
      let n = 0;
      sleepers.forEach((h, si) => {
        const hp = headPos(h, tmp);
        const wakeT = chosen ? tapT + h.wakeAt : Infinity;
        for (let k = 0; k < Z_PER; k++) {
          const off = si * 0.45 + k * 0.62;
          const period = 1.86;
          const life = 1.85;
          const born = Math.floor((T - off) / period) * period + off;
          const age = T - born;
          const popped = T > wakeT ? clamp01((T - wakeT) / 0.22) : 0;
          const u = age / life;
          const alive = born < wakeT && age >= 0 && age < life && T > 0.05 && popped < 1;
          const vis = alive ? ramp(0, 0.18, u) * (1 - ramp(0.7, 1, u)) * (1 - popped) : 0;
          const scale = (0.55 + 0.75 * u) * (1 + popped * 0.9) * vis;
          p4.set(hp.x + 0.25 + 0.18 * Math.sin(u * 5 + si), hp.y + 0.3 + u * 1.15, hp.z - 0.1);
          qz.setFromAxisAngle(zAxis, 0.25 * Math.sin(u * 4 + si));
          q4.copy(camera.quaternion).multiply(qz);
          for (const [x, y] of Z_DOTS) {
            const dot = tmp2.set(x * scale, y * scale, 0).applyQuaternion(q4).add(p4);
            zees.setMatrixAt(n++, m4.compose(dot, q4, s4.setScalar(Math.max(0.0001, scale))));
          }
        }
      });
      zees.instanceMatrix.needsUpdate = true;

      // morning light on the floor through the door
      const fl = chosen ? ramp(DOOR + 0.05, DOOR + 0.7, tau) * (1 - ramp(DOOR + 1.35, DOOR + 2.3, tau)) : 0;
      doorMat.opacity = 0.6 * fl;
      doorLight.visible = fl > 0.003;

      if (chosen && tau >= endT) finish();
    };

    const intro: Intro = {
      update,
      get daylight() {
        return daylight;
      },
      light() {
        // deeper night than the skin's own: moonlit yard, a dark room around the lamp
        if (hemi) hemi.intensity *= mix(0.2, 1, dayK);
        scene.environmentIntensity *= mix(0.35, 1, dayK);
        if (sun) {
          sun.intensity *= mix(4, 1, dayK);
          sun.color.lerp(MOON, 1 - dayK);
        }
      },
      get info() {
        return { hero: chosen?.id ?? null, t: +T.toFixed(2), tau: chosen ? +(T - tapT).toFixed(2) : null, end: chosen ? +endT.toFixed(2) : null };
      },
    };
    game.intro = intro;
  });
}
