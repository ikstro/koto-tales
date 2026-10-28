import * as THREE from 'three';
import './ui/style.css';
import { Models } from './assets/models';
import { HEROES, HERO_ORDER } from './content/heroes';
import { MONSTERS, MONSTER_ORDER } from './content/monsters';
import type { Ctx } from './core/ctx';
import { Game } from './core/game';
import { Input } from './core/input';
import { readParams } from './core/params';
import { Quality } from './core/quality';
import { applyWaitingUpdate, bootStarted, bootSucceeded, registerPWA } from './pwa';
import { Effects } from './render/effects';
import { createSkin } from './render/skins';
import { buildHouse } from './systems/house';
import { initPickups } from './systems/pickups';
import { freshSave, loadSave, persistStorage, reconcileTerrain } from './systems/save';
import { Album } from './ui/album';
import { Hud } from './ui/hud';
import { makePortraits } from './ui/portraits';
import { wakeHeroes } from './ui/wake';
import { voice } from './voice/voice';
import { B, NATURAL_SURFACES, blockDef } from './world/blocks';
import { World } from './world/World';

/** A rainbow tower and a little wall in the front yard, to see built blocks in every skin. */
function placeDemo(ctx: Ctx): void {
  const o = ctx.house!.origin;
  const x = o.x + 11;
  const z = o.z + 9;
  const y = ctx.world.groundHeight(x, z);
  const rainbow = [B.RED, B.ORANGE, B.YELLOW, B.GREEN, B.BLUE, B.PURPLE];
  rainbow.forEach((id, i) => {
    for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) ctx.world.setBlock(x + dx, y + i, z + dz, id);
  });
  ctx.world.setBlock(x, y + 6, z, B.LANTERN);
  [B.BRICK, B.PLANKS, B.GLASS, B.PLANKS, B.BRICK].forEach((id, i) => {
    ctx.world.setBlock(x - 6 + i, y, z + 3, B.BRICK);
    ctx.world.setBlock(x - 6 + i, y + 1, z + 3, id);
  });
  ctx.world.setBlock(x - 7, y, z + 1, B.PINK);
  ctx.world.setBlock(x - 7, y, z + 2, B.WHITE);
}

async function boot(): Promise<void> {
  await bootStarted();
  registerPWA();
  persistStorage();
  const params = readParams();
  const ui = document.getElementById('ui')!;
  const loading = document.createElement('div');
  loading.className = 'screen';
  loading.innerHTML = '<div class="loading">Завантаження…</div>';
  ui.appendChild(loading);

  const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game') as HTMLCanvasElement, antialias: true, powerPreference: 'high-performance' });
  const quality = new Quality(renderer, params.tier);
  const skin = createSkin(params.skin);
  skin.setTier(quality.tier);
  const scene = new THREE.Scene();
  skin.setupScene(scene, renderer);
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 220);

  const models = new Models(skin);
  await models.preload([...HERO_ORDER.map((id) => HEROES[id].model), ...MONSTER_ORDER.map((k) => MONSTERS[k].model)]);

  let save = params.fresh ? freshSave() : loadSave();
  save = reconcileTerrain(save, (id) => !NATURAL_SURFACES.has(blockDef(id).side.surface));
  const world = new World(scene, { seed: save.seed, renderDistance: quality.renderDistance }, skin);
  world.importEdits(save.edits);

  const portraits = makePortraits(renderer, models);
  const input = new Input();
  const hud = new Hud(ui, input, portraits);
  const album = new Album(ui, portraits);

  const ctx: Ctx = {
    renderer,
    scene,
    camera,
    skin,
    world,
    models,
    effects: new Effects(scene),
    input,
    hud,
    album,
    portraits,
    params,
    save,
    heroes: new Map(),
    player: null as unknown as Ctx['player'],
    monsters: [],
    arrows: [],
    pickups: new Map(),
    house: null,
    clock: { t: params.time ?? save.time, daylight: 1, frozen: params.freeze, elapsed: 0 },
    playing: false,
    sleeping: false,
  };
  initPickups(ctx);
  ctx.house = buildHouse(ctx);
  if (params.demo) placeDemo(ctx);

  const game = new Game(ctx, quality);
  game.onFirstFrame = bootSucceeded;
  game.start();
  loading.remove();
  voice.preload?.(HERO_ORDER.map((id) => HEROES[id].lines.hi));

  // A new version waiting in the background is switched to here, before play.
  if (applyWaitingUpdate()) return;

  // The start is a ritual in the world itself: wake a hero by touching them.
  if (params.autostart) game.begin(params.hero ?? save.hero);
  else await wakeHeroes(ctx, game);
}

boot().catch((e) => {
  console.error(e);
  const ui = document.getElementById('ui');
  if (ui) ui.innerHTML = '<div class="screen"><div class="loading">Ой! Щось зламалося. Перезапусти гру.</div></div>';
});
