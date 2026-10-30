/**
 * Model lineup for eyeballing heroes, monsters, items, props, house and effects.
 *
 * URL params (or a bare hash like #lyosha):
 *   view=lineup (default) | house | hero | actions
 *   id=lyosha|solomiia|pupsia|zombie|skeleton|spider   (hero / actions views)
 *   action=idle|walk|attack|cast|hurt|happy|sleep       (force one action for everyone)
 *   t=0.3     freeze the forced action at this time (seconds)
 *   roof=0    hide the house roof
 *   skin=pixel|toy|hybrid  use the real skin (src/render/skins) when it exists; default: test skin
 *   ui=0      hide the info box
 *   yaw=1.57  facing of the figures in the actions view
 *   view=castle&race=elves|gnomes|robots|aliens  a castle with its ruler, a hero at the top and the chest
 *     alive=0..1 (default 1)  open=0..1 (default = alive)  night=0..1  cam=front|game|side|back
 *   view=rulers  the four rulers next to their elders
 */
import * as THREE from 'three';
import type { CharacterModel, ItemId, ModelAction, Skin } from '../contracts';
import { ITEM_ORDER } from '../content/items';
import { HOME, HOUSE } from '../content/house';
import { createAquarium, createBunk, createCabinet, createKitchen, createTable } from '../assets/home';
import { animate } from '../assets/animate';
import { Models, PART_BUILDERS } from '../assets/models';
import { countMeshes } from '../assets/parts/kit';
import { createArrow, createBed, createCampfire, createChest } from '../assets/props';
import { createCastle, createCastleItem } from '../assets/castles';
import { Effects } from '../render/effects';
import { cutawayModel } from '../render/skins/cutaway';
import { BLOCKS, B } from '../world/blocks';
import { RACES, type Race } from '../world/villages';
import { TestSkin } from './testSkin';

declare global {
  interface Window {
    __ready?: boolean;
    __drawCalls?: Record<string, number>;
  }
}

const params = new URLSearchParams(location.search);
const hash = location.hash.slice(1);
if (hash && !params.has('view')) {
  if (hash === 'house' || hash === 'lineup') params.set('view', hash);
  else {
    params.set('view', 'hero');
    params.set('id', hash);
  }
}
const view = params.get('view') ?? 'lineup';
const forced = params.get('action') as ModelAction | 'walk' | null;
const freezeAt = params.has('t') ? Number(params.get('t')) : null;
if (params.get('ui') === '0') document.getElementById('info')!.style.display = 'none';

const CHARS = ['lyosha', 'solomiia', 'pupsia', 'david', 'zombie', 'skeleton', 'spider'];

async function pickSkin(): Promise<Skin> {
  const wanted = params.get('skin');
  if (wanted && wanted !== 'test') {
    const index = import.meta.glob('../render/skins/index.ts')['../render/skins/index.ts'];
    if (index) {
      const mod = (await index()) as { createSkin?: (id: string) => Skin };
      if (mod.createSkin) return mod.createSkin(wanted);
    }
    const mods = import.meta.glob('../render/skins/pixel.ts');
    const load = mods['../render/skins/pixel.ts'];
    if (load) {
      const mod = (await load()) as Record<string, unknown>;
      for (const v of Object.values(mod)) {
        if (typeof v !== 'function') continue;
        try {
          const ctor = v as new () => Skin;
          const s = v.prototype?.partMaterial ? new ctor() : (v as () => Skin)();
          if (s && typeof s.partMaterial === 'function') return s;
        } catch {
          /* not a skin factory */
        }
      }
      console.warn('pixel.ts has no recognisable Skin export; using the test skin');
    } else console.warn('src/render/skins/pixel.ts does not exist yet; using the test skin');
  }
  return new TestSkin();
}

interface Actor {
  model: CharacterModel;
  speed: number;
  cycle: boolean;
  offset: number;
  frozen: boolean;
}

const CYCLE: [ModelAction | 'walk', number][] = [
  ['walk', 2.2],
  ['idle', 1.2],
  ['attack', 0.9],
  ['cast', 1.2],
  ['hurt', 0.8],
  ['happy', 1.3],
  ['sleep', 2.4],
  ['idle', 0.8],
];
const CYCLE_LEN = CYCLE.reduce((a, [, d]) => a + d, 0);

async function main() {
  const skin = await pickSkin();
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.setSize(innerWidth, innerHeight);
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  skin.setupScene(scene, renderer);
  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 200);
  const models = new Models(skin);
  const effects = new Effects(scene);
  const actors: Actor[] = [];
  const updaters: ((dt: number, t: number) => void)[] = [];
  const draw: Record<string, number> = {};
  let daylight = 1;
  const focus = new THREE.Vector3();

  const ground = (y: number, size = 60, color = 0x7cc35a) => {
    const g = new THREE.Mesh(new THREE.BoxGeometry(size, 0.2, size), new THREE.MeshLambertMaterial({ color }));
    g.position.y = y - 0.1;
    g.receiveShadow = true;
    scene.add(g);
  };

  const addChar = (id: string, x: number, z: number, yaw = 0, speed = 0, cycle = false, offset = 0) => {
    const model = models.character({ kind: 'parts', id });
    model.root.position.set(x, 0, z);
    model.root.rotation.y = yaw;
    scene.add(model.root);
    const a: Actor = { model, speed, cycle, offset, frozen: false };
    if (forced) {
      a.speed = forced === 'walk' ? 3 : 0;
      a.cycle = false;
      if (forced !== 'walk') model.play(forced);
      model.update(0, a.speed);
      if (freezeAt !== null) {
        for (let tt = 0; tt < freezeAt - 1e-6; tt += 1 / 60) model.update(Math.min(1 / 60, freezeAt - tt), a.speed);
        a.frozen = true;
      }
    } else model.update(0, speed);
    actors.push(a);
    draw[id] = countMeshes(model.root);
    return a;
  };

  const label = (text: string, x: number, y: number, z: number, scale = 1) => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const g = c.getContext('2d')!;
    g.font = 'bold 34px system-ui';
    g.textAlign = 'center';
    g.fillStyle = '#12303f';
    g.fillText(text, 128, 44);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    s.scale.set(1.2 * scale, 0.3 * scale, 1);
    s.position.set(x, y, z);
    scene.add(s);
  };

  if (view === 'lineup') {
    ground(0);
    CHARS.forEach((id, i) => {
      const x = (i - 2.5) * 1.7;
      addChar(id, x, -0.8, 0, 0, true, i * 0.6);
    });
    ITEM_ORDER.forEach((id: ItemId, i) => {
      const it = models.item(id);
      it.position.set((i - 6.5) * 0.78, 0, 1.3);
      it.rotation.y = -0.35;
      it.traverse((o) => (o.castShadow = true));
      scene.add(it);
    });
    const fire = createCampfire(skin);
    fire.root.position.set(-6.2, 0, -0.3);
    scene.add(fire.root);
    updaters.push((dt) => fire.update(dt));
    const chest = createChest(skin);
    chest.root.position.set(6.2, 0, -0.5);
    chest.root.rotation.y = -0.4;
    scene.add(chest.root);
    updaters.push((_dt, t) => chest.setOpen(t % 4 > 1.5));
    const arrow = createArrow(skin);
    arrow.position.set(5.9, 0.4, 1.3);
    arrow.rotation.y = -0.9;
    scene.add(arrow);
    // game camera: pitched ~52° looking down -Z
    const pitch = THREE.MathUtils.degToRad(52);
    const dist = 12;
    camera.position.set(0, Math.sin(pitch) * dist, Math.cos(pitch) * dist + 0.2);
    camera.lookAt(0, 0.4, 0.2);
    updaters.push((_dt, t) => {
      if (t % 2.5 < 0.02 + 1 / 60 && t > 0.5) effects.sparkle(new THREE.Vector3(-3.5, 0.3, 1.3), 0xfff176);
    });
  } else if (view === 'house') {
    ground(1, 80);
    buildHouseBlocks(scene);
    if (params.get('roof') !== '0') scene.add(HOUSE.createRoof(skin));
    const w = HOUSE.wakeSpot;
    addChar('lyosha', w.dx, w.dz, 0.5, 0, true);
    addChar('pupsia', w.dx + 1.5, w.dz + 1.5, -0.6, 0, true, 2);
    actors.forEach((a) => (a.model.root.position.y = 1));
    const chest = createChest(skin);
    chest.root.position.set(HOUSE.chestSpot.dx, HOUSE.chestSpot.dy, HOUSE.chestSpot.dz);
    scene.add(chest.root);
    updaters.push((_dt, t) => chest.setOpen(t % 4 > 1.5));
    // the furniture, as systems/house.ts puts it up
    const bunk = createBunk(skin, '#3fa142', '#6fb2d6', HOME.bunkLow, HOME.bunkTop);
    const kitchen = createKitchen(skin);
    const table = createTable(skin);
    const cabinet = createCabinet(skin, 8);
    const aquarium = createAquarium(skin);
    const solSpot = HOUSE.sleepSpots.solomiia;
    const solBed = createBed(skin, '#ee6a82', solSpot.dy - 1);
    solBed.root.position.set(solSpot.dx, 1, solSpot.dz);
    scene.add(solBed.root);
    for (const [o, at] of [
      [bunk.root, HOME.bunk],
      [kitchen.root, HOME.kitchen],
      [table.root, HOME.table],
      [cabinet.root, HOME.shelf],
      [aquarium.root, HOME.aquarium],
    ] as const) {
      o.position.set(at.dx, 1, at.dz);
      scene.add(o);
    }
    updaters.push((dt, t) => {
      kitchen.update(dt, t % 6 > 3, 0);
      cabinet.update(dt);
      aquarium.update(dt);
    });
    const fire = createCampfire(skin);
    const c = HOUSE.campfireSpot;
    fire.root.position.set(c.dx, c.dy, c.dz);
    scene.add(fire.root);
    updaters.push((dt) => fire.update(dt));
    const sol = addChar('solomiia', c.dx + 1.6, c.dz - 0.2, -1.2, 0, true, 1);
    sol.model.root.position.y = 1;
    const zom = addChar('zombie', c.dx - 3.5, c.dz + 0.5, 1.2, 0, true, 3);
    zom.model.root.position.y = 1;
    // effects demo
    let k = 0;
    updaters.push((_dt, t) => {
      const slot = Math.floor(t / 1.5);
      if (slot <= k) return;
      k = slot;
      const at = new THREE.Vector3(c.dx - 3.5, 1.8, c.dz + 0.5);
      switch (slot % 5) {
        case 0:
          effects.lightning(new THREE.Vector3(c.dx + 1.6, 2.6, c.dz - 0.2), at);
          break;
        case 1:
          effects.poof(at, 0x7cb342);
          break;
        case 2:
          effects.coinBurst(at, 10, 1);
          break;
        case 3:
          effects.sparkle(at, 0x76ff03);
          break;
        case 4:
          effects.ring(at);
          break;
      }
    });
    const pitch = THREE.MathUtils.degToRad(52);
    const dist = 17;
    const cx = 4.5;
    const cz = 5;
    camera.position.set(cx, 1 + Math.sin(pitch) * dist, cz + Math.cos(pitch) * dist);
    camera.lookAt(cx, 1, cz);
    if (freezeAt !== null) {
      // show every effect at once for a still screenshot
      const p = (x: number) => new THREE.Vector3(x, 1.7, 8.5);
      effects.lightning(new THREE.Vector3(c.dx + 1.6, 3, c.dz - 0.2), new THREE.Vector3(c.dx - 3.5, 1.8, c.dz + 0.5));
      effects.poof(p(-1), 0x7cb342);
      effects.coinBurst(p(1), 10, 1);
      effects.sparkle(p(8), 0x76ff03);
      effects.ring(p(10));
      effects.update(0.12);
    }
  } else if (view === 'hero') {
    ground(0);
    const id = params.get('id') ?? 'lyosha';
    const quad = id === 'pupsia' || id === 'spider';
    const yaws = [0, 0.75, Math.PI, quad ? Math.PI / 2 : -0.75];
    yaws.forEach((yaw, i) => addChar(id, (i - 2) * 1.35, 0, yaw));
    addChar(id, 2.7, 0, 0.6, 3);
    label(id, 0, 2.1, -1.5, 1.2);
    const h = PART_BUILDERS[id] ? actors[0].model.height : 1.5;
    camera.fov = 30;
    camera.position.set(0, h * 0.95 + 1.1, 10);
    camera.lookAt(0, h * 0.5, 0);
  } else if (view === 'actions') {
    ground(0);
    const id = params.get('id') ?? 'lyosha';
    const poses: [ModelAction | 'walk', number][] = [
      ['idle', 0],
      ['walk', 0.35],
      ['attack', 0.24],
      ['attack', 0.36],
      ['cast', 0.45],
      ['hurt', 0.1],
      ['happy', 0.3],
      ['sleep', 3],
    ];
    poses.forEach(([act, t], i) => {
      const model = models.character({ kind: 'parts', id });
      model.root.position.set((i - 3.5) * 1.45, 0, 0);
      model.root.rotation.y = Number(params.get('yaw') ?? 0.9);
      scene.add(model.root);
      const sp = act === 'walk' ? 3 : 0;
      if (act !== 'walk') model.play(act);
      model.update(0, sp);
      for (let tt = 0; tt < t - 1e-6; tt += 1 / 60) model.update(Math.min(1 / 60, t - tt), sp);
      actors.push({ model, speed: sp, cycle: false, offset: 0, frozen: true });
      label(`${act} ${t}`, (i - 3.5) * 1.45, 2.05, 0, 0.8);
    });
    camera.fov = 32;
    camera.position.set(0, 4.2, 15);
    camera.lookAt(0, 0.6, 0);
  } else if (view === 'castle') {
    ground(0, 120);
    const race = (params.get('race') ?? 'elves') as Race;
    const alive = Number(params.get('alive') ?? 1);
    const open = Number(params.get('open') ?? alive);
    const night = Number(params.get('night') ?? 0);
    daylight = 1 - night;
    const castle = createCastle(skin, race);
    cutawayModel(castle.root);
    scene.add(castle.root);
    let tris = 0;
    castle.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const g = m.geometry;
      tris += ((g.index ? g.index.count : g.getAttribute('position').count) / 3) * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
    });
    draw[`castle-${race} tris ${Math.round(tris)} draws`] = countMeshes(castle.root);
    const chest = createChest(skin);
    chest.root.position.set(castle.chest.x, castle.chest.y, castle.chest.z);
    chest.root.rotation.y = castle.chest.yaw;
    scene.add(chest.root);
    const ruler = { elves: 'elf_queen', gnomes: 'gnome_king', robots: 'robot_chief', aliens: 'alien_captain' }[race];
    addChar(ruler, 0, 8, 0, 0, true);
    const hero = addChar('lyosha', castle.top.x, castle.top.z, 0.3, 0, true, 1);
    hero.model.root.position.y = castle.top.y;
    const item = createCastleItem(skin, race);
    item.root.position.set(3, 0, 9);
    scene.add(item.root);
    updaters.push((dt) => {
      castle.update(dt, { night, alive, open, on: alive > 0.5, low: false, beat: 0 });
      item.update(dt, { night, on: false, low: false, beat: 0 });
    });
    const cam = params.get('cam') ?? 'front';
    camera.fov = 40;
    focus.set(-0.5, 9, -4.5);
    if (cam === 'game') {
      focus.copy(castle.top);
      // the game's high third-person view from the front, looking at the hero at the top
      const pitch = THREE.MathUtils.degToRad(52);
      const dist = 20;
      camera.position.set(castle.top.x, castle.top.y + Math.sin(pitch) * dist, castle.top.z + Math.cos(pitch) * dist);
      camera.lookAt(castle.top.x, castle.top.y, castle.top.z);
    } else if (cam === 'side') {
      camera.position.set(42, 18, -2);
      camera.lookAt(0, 9, -5);
    } else if (cam === 'back') {
      camera.position.set(-22, 27, -46);
      camera.lookAt(0, 9, -5);
    } else {
      camera.position.set(21, 25, 40);
      camera.lookAt(-0.5, 9.5, -4.5);
    }
  } else if (view === 'rulers') {
    ground(0);
    const pairs: [string, string][] = [['elf_elder', 'elf_queen'], ['gnome_elder', 'gnome_king'], ['robot_elder', 'robot_chief'], ['alien_elder', 'alien_captain']];
    pairs.forEach(([elder, ruler], i) => {
      const x = (i - 1.5) * 2.6;
      addChar(elder, x - 0.6, -0.4, 0.25);
      addChar(ruler, x + 0.55, 0.2, -0.2);
      label(ruler, x + 0.3, 2.4, -0.8, 0.9);
    });
    camera.fov = 30;
    camera.position.set(0, 3.0, 15);
    camera.lookAt(0, 0.9, 0);
    void RACES;
  }
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();

  // per-character draw calls (meshes), static
  window.__drawCalls = draw;
  const tags = Object.entries(draw)
    .map(([k, v]) => `${k} ${v}`)
    .join(' · ');
  const nav = ['lineup', 'house', ...CHARS.map((c) => `hero&id=${c}`), 'actions&id=lyosha', ...RACES.map((r) => `castle&race=${r}`), 'rulers']
    .map((v) => `<a href="?view=${v}">${v.replace('hero&id=', '').replace('&id=', ' ')}</a>`)
    .join('');
  document.getElementById('nav')!.innerHTML = nav;

  const clock = new THREE.Clock();
  let t = 0;
  let frames = 0;
  const loop = () => {
    const dt = Math.min(0.05, clock.getDelta());
    t += dt;
    for (const a of actors) {
      if (a.frozen) continue;
      if (a.cycle) {
        const before = phaseAt(t - dt + a.offset);
        const now = phaseAt(t + a.offset);
        if (now !== before || frames === 0) {
          const act = CYCLE[now][0];
          a.speed = act === 'walk' ? 3 : 0;
          a.model.play(act === 'walk' ? 'idle' : act);
        }
      }
      a.model.update(dt, a.speed);
    }
    updaters.forEach((u) => u(dt, t));
    if (freezeAt === null || view !== 'house') effects.update(dt);
    skin.updateScene(daylight, focus);
    skin.render(renderer, scene, camera);
    frames++;
    if (frames % 20 === 1) {
      document.getElementById('stats')!.textContent = `draw calls ${renderer.info.render.calls} · meshes: ${tags}`;
    }
    if (frames === 30) window.__ready = true;
    requestAnimationFrame(loop);
  };
  loop();

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });
}

function phaseAt(t: number): number {
  let x = ((t % CYCLE_LEN) + CYCLE_LEN) % CYCLE_LEN;
  for (let i = 0; i < CYCLE.length; i++) {
    if (x < CYCLE[i][1]) return i;
    x -= CYCLE[i][1];
  }
  return 0;
}

/** House blocks as plain coloured cubes (the real world mesher is someone else's). */
function buildHouseBlocks(scene: THREE.Scene) {
  const byId = new Map<number, { dx: number; dy: number; dz: number }[]>();
  for (const b of HOUSE.blocks) {
    if (b.id === B.AIR) continue;
    let l = byId.get(b.id);
    if (!l) byId.set(b.id, (l = []));
    l.push(b);
  }
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const m = new THREE.Matrix4();
  for (const [id, list] of byId) {
    const def = BLOCKS[id];
    const glass = id === B.GLASS;
    const mat = new THREE.MeshLambertMaterial({
      color: def.side.color,
      transparent: glass,
      opacity: glass ? 0.45 : 1,
      emissive: def.glow ? new THREE.Color(def.side.color).multiplyScalar(0.6) : new THREE.Color(0),
    });
    const inst = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((b, i) => inst.setMatrixAt(i, m.makeTranslation(b.dx + 0.5, b.dy + 0.5, b.dz + 0.5)));
    inst.castShadow = inst.receiveShadow = true;
    scene.add(inst);
  }
}

// keep `animate` referenced for quick console experiments
(window as unknown as { __animate: typeof animate }).__animate = animate;

main().catch((e) => {
  document.getElementById('stats')!.textContent = String(e?.stack ?? e);
  console.error(e);
  window.__ready = true;
});
