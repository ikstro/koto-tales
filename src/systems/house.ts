import * as THREE from 'three';
import type { HeroId } from '../contracts';
import { createBed, createCampfire, createChest, createCushion, createDoor, type Bed } from '../assets/props';
import { HERO_ORDER } from '../content/heroes';
import { HOUSE } from '../content/house';
import type { Ctx, HouseState } from '../core/ctx';
import { events } from '../core/events';
import { B } from '../world/blocks';

const BLANKET: Partial<Record<HeroId, string>> = { lyosha: '#6fb2d6', solomiia: '#ee6a82', david: '#3fa142' };
/** Lantern light by day and by night (it is the house's own warm lamp). */
const LAMP_DAY = 1.2;
export const LAMP_NIGHT = 6;

/**
 * The house: built once next to the world origin, then remembered by the
 * save (its blocks live in the world edits, its corner in `save.house`).
 */
export function buildHouse(ctx: Ctx): HouseState {
  const { world, save, skin, scene } = ctx;
  let origin: THREE.Vector3;
  if (save.house) {
    origin = new THREE.Vector3(...save.house);
  } else {
    const spawn = world.findSpawn(0, 0);
    const x0 = Math.floor(spawn.x) - Math.floor(HOUSE.sizeX / 2);
    const z0 = Math.floor(spawn.z) - Math.floor(HOUSE.sizeZ / 2);
    const feetY = Math.round(spawn.y);
    // Level ground under the house and a front yard for the campfire.
    world.flattenArea(x0 - 2, z0 - 2, x0 + HOUSE.sizeX + 1, z0 + HOUSE.sizeZ + 5, feetY, 10);
    origin = new THREE.Vector3(x0, feetY - 1, z0);
    world.placeStructure(origin.x, origin.y, origin.z, HOUSE.blocks);
    save.house = [origin.x, origin.y, origin.z];
  }

  const at = (s: { dx: number; dy: number; dz: number }) => origin.clone().add(new THREE.Vector3(s.dx, s.dy, s.dz));

  // The roof fades while someone is inside; its materials are its own so
  // nothing else in the world fades with it.
  const roof = HOUSE.createRoof(skin);
  // The roof group carries its own height above the floor; shift it, don't replace it.
  roof.position.add(origin);
  const roofMaterials: THREE.Material[] = [];
  roof.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const list = Array.isArray(m.material) ? m.material : [m.material];
    const own = list.map((mat) => {
      const c = mat.clone();
      c.transparent = true;
      roofMaterials.push(c);
      return c;
    });
    m.material = Array.isArray(m.material) ? own : own[0];
  });
  roof.userData.casts = true;
  scene.add(roof);

  const chestModel = createChest(skin);
  const chestPos = at(HOUSE.chestSpot);
  chestModel.root.position.copy(chestPos);
  scene.add(chestModel.root);

  const campfire = createCampfire(skin);
  campfire.root.position.copy(at(HOUSE.campfireSpot));
  scene.add(campfire.root);

  // Furniture is props, not blocks: it shows up in houses already written into
  // old saves without touching their edits. Daytime state: blankets folded, door open.
  const beds: HouseState['beds'] = {};
  let cushion: THREE.Group | null = null;
  for (const id of HERO_ORDER) {
    const s = HOUSE.sleepSpots[id];
    const colour = BLANKET[id];
    if (!colour) {
      cushion = createCushion(skin);
      cushion.position.copy(at({ dx: s.dx, dy: 1, dz: s.dz }));
      scene.add(cushion);
      continue;
    }
    // On a BED block only the bedding is added; elsewhere a whole bed up to the sleeper.
    const onBlock = world.getBlock(Math.floor(origin.x + s.dx), origin.y + 1, Math.floor(origin.z + s.dz)) === B.BED;
    const bed: Bed = onBlock ? createBed(skin, colour, 0) : createBed(skin, colour, s.dy - 1);
    bed.root.position.copy(at({ dx: s.dx, dy: onBlock ? s.dy : 1, dz: s.dz }));
    bed.root.rotation.y = s.yaw;
    scene.add(bed.root);
    beds[id] = bed;
  }
  const door = createDoor(skin);
  door.root.position.copy(at(HOUSE.doorSpot));
  door.root.rotation.y = HOUSE.doorSpot.yaw;
  door.setOpen(1);
  scene.add(door.root);

  // The lantern's light, just in front of the lantern block in the back corner.
  const lamp = new THREE.PointLight(0xffa64a, LAMP_DAY, 9, 1.4);
  lamp.position.copy(at({ dx: 6.9, dy: 2.5, dz: 2.3 }));
  scene.add(lamp);

  const i = HOUSE.interior;
  return {
    origin,
    centre: origin.clone().add(new THREE.Vector3(HOUSE.sizeX / 2, 1, HOUSE.sizeZ / 2)),
    wake: at(HOUSE.wakeSpot),
    chest: { ...chestModel, pos: chestPos },
    campfire,
    roof,
    roofMaterials,
    roofFade: 1,
    beds,
    cushion: cushion ?? new THREE.Group(),
    door,
    lamp,
    interior: { x0: origin.x + i.x0, z0: origin.z + i.z0, x1: origin.x + i.x1, z1: origin.z + i.z1 },
    footprint: { x0: origin.x, z0: origin.z, x1: origin.x + HOUSE.sizeX, z1: origin.z + HOUSE.sizeZ, y0: origin.y },
  };
}

export function isInside(h: HouseState, p: THREE.Vector3): boolean {
  const r = h.interior;
  return p.x >= r.x0 && p.x < r.x1 && p.z >= r.z0 && p.z < r.z1 && p.y >= h.origin.y && p.y < h.origin.y + 5;
}

/** The house shell may not be broken (but blocks can be placed around and inside it). */
export function isHouseShell(h: HouseState, x: number, y: number, z: number): boolean {
  const f = h.footprint;
  return x >= f.x0 && x < f.x1 && z >= f.z0 && z < f.z1 && y >= f.y0 && y <= f.y0 + 4;
}

let wasInside = false;
let chestOpen = false;

export function updateHouse(ctx: Ctx, dt: number): void {
  const h = ctx.house;
  if (!h) return;
  h.campfire.update(dt);
  if (!ctx.playing) return; // before play the start ritual (ui/wake.ts) owns the house
  h.lamp.intensity = LAMP_DAY + (LAMP_NIGHT - LAMP_DAY) * (1 - ctx.clock.daylight);

  const inside = isInside(h, ctx.player.pos);
  if (inside !== wasInside) {
    wasInside = inside;
    events.emit('hero:home', { inside });
  }
  const target = inside ? 0 : 1;
  h.roofFade += (target - h.roofFade) * (1 - Math.exp(-dt * 8));
  h.roof.visible = h.roofFade > 0.02;
  for (const m of h.roofMaterials) {
    m.opacity = h.roofFade;
    m.depthWrite = h.roofFade > 0.98;
  }

  const near = ctx.player.pos.distanceTo(h.chest.pos) < 2.2;
  if (near !== chestOpen) {
    chestOpen = near;
    h.chest.setOpen(near);
    ctx.hud.chestPrompt.classList.toggle('hidden', !near);
  }
}

export function homeDistance(ctx: Ctx, p: THREE.Vector3): number {
  const h = ctx.house;
  if (!h) return Infinity;
  return Math.hypot(p.x - h.centre.x, p.z - h.centre.z);
}
