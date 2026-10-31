import * as THREE from 'three';
import type { HeroId } from '../contracts';
import type { Hero } from '../actors/entities';
import { createAquarium, createBunk, createCabinet, createKitchen, createTable, TABLE_H, type Aquarium, type Cabinet, type Kitchen } from '../assets/home';
import { createBed, createCampfire, createChest, createCushion, createDoor, type Bed } from '../assets/props';
import { ARTIFACT_ORDER } from '../content/artifacts';
import { HERO_ORDER } from '../content/heroes';
import { HOME, HOUSE, HOUSE_VERSION, rehousedOrigin } from '../content/house';
import type { Ctx, HouseState } from '../core/ctx';
import { events } from '../core/events';
import { sfx } from '../voice/sfx';
import { B } from '../world/blocks';
import { addFoodPlace, eating, eatingAt, sitOn, type FoodPlace } from './food';

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
  /** Levels the ground under the house and a front yard for the campfire, then puts the house up. */
  const putUp = (x0: number, z0: number, feetY: number) => {
    world.flattenArea(x0 - 2, z0 - 2, x0 + HOUSE.sizeX + 1, z0 + HOUSE.sizeZ + 5, feetY, 10);
    world.placeStructure(x0, feetY - 1, z0, HOUSE.blocks);
    save.house = [x0, feetY - 1, z0];
    save.houseV = HOUSE_VERSION;
    return new THREE.Vector3(x0, feetY - 1, z0);
  };
  if (save.house && save.houseV >= HOUSE_VERSION) {
    origin = new THREE.Vector3(...save.house);
  } else if (save.house) {
    // an older, smaller house: the flattening clears it away (its walls, floor and lantern) and
    // the new one goes up around the same centre; kit buildings in the way go back into the box
    // (systems/kit.ts)
    const [x0, y0, z0] = rehousedOrigin(save.house, save.houseV || 1);
    origin = putUp(x0, z0, y0 + 1);
  } else {
    const spawn = world.findSpawn(0, 0);
    origin = putUp(Math.floor(spawn.x) - Math.floor(HOUSE.sizeX / 2), Math.floor(spawn.z) - Math.floor(HOUSE.sizeZ / 2), Math.round(spawn.y));
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
  const add = (o: THREE.Object3D, dx: number, dz: number, yaw = 0) => {
    o.position.copy(at({ dx, dy: 1, dz }));
    o.rotation.y = yaw;
    o.userData.casts = true;
    scene.add(o);
    return o;
  };
  // the boys' bunk bed: Давид below, Льоша on top
  const bunk = createBunk(skin, BLANKET.david!, BLANKET.lyosha!, HOME.bunkLow, HOME.bunkTop);
  add(bunk.root, HOME.bunk.dx, HOME.bunk.dz);
  beds.david = bunk.low;
  beds.lyosha = bunk.top;
  for (const id of HERO_ORDER) {
    if (beds[id]) continue;
    const s = HOUSE.sleepSpots[id];
    const colour = BLANKET[id];
    if (!colour) {
      cushion = createCushion(skin);
      cushion.position.copy(at({ dx: s.dx, dy: 1, dz: s.dz }));
      scene.add(cushion);
      continue;
    }
    const bed: Bed = createBed(skin, colour, s.dy - 1);
    bed.root.position.copy(at({ dx: s.dx, dy: 1, dz: s.dz }));
    bed.root.rotation.y = s.yaw;
    scene.add(bed.root);
    beds[id] = bed;
  }

  // the kitchen, its table, the treasure cabinet and the aquarium (DESIGN.md «Home»)
  kitchen = createKitchen(skin);
  add(kitchen.root, HOME.kitchen.dx, HOME.kitchen.dz);
  const table = createTable(skin);
  add(table.root, HOME.table.dx, HOME.table.dz);
  cabinet = createCabinet(skin, Math.max(8, ARTIFACT_ORDER().length));
  add(cabinet.root, HOME.shelf.dx, HOME.shelf.dz);
  aquarium = createAquarium(skin);
  add(aquarium.root, HOME.aquarium.dx, HOME.aquarium.dz);
  const fill = () => {
    const ids = ARTIFACT_ORDER();
    cabinet!.fill(
      ids.map((id) => {
        if (!save.artifacts.includes(id)) return undefined;
        try {
          return ctx.models.artifact(id);
        } catch {
          return undefined;
        }
      }),
    );
  };
  fill();
  events.on('artifact:found', fill);
  // the kitchen is a place to eat (systems/food.ts): warm pies, a fish for Пупся, then fast running;
  // the apple shows only when someone is hurt, a tap on the table itself works any time
  const tableAt = at({ dx: HOME.table.dx, dy: 1, dz: HOME.table.dz });
  kitchenPlace = {
    centre: tableAt,
    seats: table.seats,
    fast: KITCHEN_FAST,
    hungryOnly: true,
    snack: 'pie',
    piece: 'food',
    open: (p) => !!ctx.house && isInside(ctx.house, p),
    setEat: () => undefined,
    gone: () => false,
    tap: { at: tableAt.clone().setY(tableAt.y + TABLE_H), reach: 1.1 },
  };
  addFoodPlace(kitchenPlace);
  // For automated checks.
  (window as unknown as { __kotoHome: object }).__kotoHome = {
    origin: origin.toArray(),
    /** Puts the player at a spot relative to the house (block centres are x + 0.5). */
    to: (dx: number, dz: number) => {
      ctx.player.body.pos.set(origin.x + dx, origin.y + 1.05, origin.z + dz);
      ctx.player.body.vel.set(0, 0, 0);
    },
    get artifacts() {
      return [...save.artifacts];
    },
    /** Where the kitchen table is on screen (px), to tap it. */
    get table() {
      const v = tableAt.clone().setY(tableAt.y + TABLE_H).project(ctx.camera);
      const r = ctx.renderer.domElement.getBoundingClientRect();
      return [r.left + (v.x * 0.5 + 0.5) * r.width, r.top + (-v.y * 0.5 + 0.5) * r.height];
    },
    get sitting() {
      return !!chair;
    },
    /** Marks an artifact as found and puts it on the shelf (no fanfare). */
    have: (id: string) => {
      if (!save.artifacts.includes(id)) save.artifacts.push(id);
      fill();
    },
  };

  const door = createDoor(skin);
  door.root.position.copy(at(HOUSE.doorSpot));
  door.root.rotation.y = HOUSE.doorSpot.yaw;
  door.setOpen(1);
  scene.add(door.root);

  // The house's warm lamp, under the ceiling in the middle of the room.
  const lamp = new THREE.PointLight(0xffa64a, LAMP_DAY, 14, 1.3);
  lamp.position.copy(at(HOME.lamp));
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
let kitchen: Kitchen | null = null;
let cabinet: Cabinet | null = null;
let aquarium: Aquarium | null = null;
let kitchenPlace: FoodPlace | null = null;
/** Seconds of fast running after a meal at home (like the ice cream). */
const KITCHEN_FAST = 20;
/** The chair the player sits on at the kitchen table, if any. */
let chair: { seat: THREE.Object3D; by: Hero } | null = null;
let stillAtChair = 0;
const seatPos = new THREE.Vector3();

/** Standing still at a chair of the kitchen table, the player sits down on it (like the swings); a step gets up. */
function chairs(ctx: Ctx, dt: number, inside: boolean): void {
  const h = ctx.player;
  const moving = Math.hypot(ctx.input.moveX, ctx.input.moveY) > 0.2;
  // a meal seats everyone itself; afterwards the player is still on a chair and stays there
  if (eating() || ctx.sleeping) {
    chair = null;
    stillAtChair = 0;
    return;
  }
  if (chair && (moving || h !== chair.by || !inside)) {
    chair = null;
    h.model.play('idle');
  }
  if (!chair) {
    let found: THREE.Object3D | null = null;
    if (inside && kitchenPlace)
      for (const o of kitchenPlace.seats) {
        o.getWorldPosition(seatPos);
        if (Math.hypot(h.pos.x - seatPos.x, h.pos.z - seatPos.z) < 0.6 && Math.abs(h.pos.y - seatPos.y) < 1.2) found = o;
      }
    stillAtChair = found && !moving ? stillAtChair + dt : 0;
    if (!found || stillAtChair < 0.4) return;
    chair = { seat: found, by: h };
    sfx.play('switch', { pitch: 1.5 });
  }
  sitOn(h, chair.seat);
  h.model.play('sit');
}

export function updateHouse(ctx: Ctx, dt: number): void {
  const h = ctx.house;
  if (!h) return;
  h.campfire.update(dt);
  // the home is alive before play too (the start ritual looks at it)
  const night = 1 - ctx.clock.daylight;
  kitchen?.update(dt, !!kitchenPlace && eatingAt(kitchenPlace), night);
  cabinet?.update(dt);
  aquarium?.update(dt);
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

  chairs(ctx, dt, inside);

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
