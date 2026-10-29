import type * as THREE from 'three';
import type { HeroId, IModels, IWorld, Skin } from '../contracts';
import type { Arrow, Hero, Monster, Pickup } from '../actors/entities';
import type { Bed, Door } from '../assets/props';
import type { Effects } from '../render/effects';
import type { Boss } from '../systems/boss';
import type { SaveData } from '../systems/save';
import type { Album } from '../ui/album';
import type { Hud } from '../ui/hud';
import type { GameMap } from '../ui/map';
import type { Portraits } from '../ui/portraits';
import type { Input } from './input';
import type { Params } from './params';

/** The house as it stands in this world. */
export interface HouseState {
  origin: THREE.Vector3;
  centre: THREE.Vector3;
  wake: THREE.Vector3;
  chest: { root: THREE.Group; setOpen(open: boolean): void; pos: THREE.Vector3 };
  campfire: { root: THREE.Group; update(dt: number): void };
  roof: THREE.Group;
  roofMaterials: THREE.Material[];
  roofFade: number;
  /** Bedding of the heroes who sleep in beds (Пупся has the cushion). */
  beds: Partial<Record<HeroId, Bed>>;
  cushion: THREE.Group;
  door: Door;
  /** The lantern's warm light: one PointLight, no shadows. */
  lamp: THREE.PointLight;
  /** World-space interior rectangle. */
  interior: { x0: number; z0: number; x1: number; z1: number };
  footprint: { x0: number; z0: number; x1: number; z1: number; y0: number };
}

/** Everything the systems share. One per running game. */
export interface Ctx {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  skin: Skin;
  world: IWorld;
  models: IModels;
  effects: Effects;
  input: Input;
  hud: Hud;
  album: Album;
  map: GameMap;
  portraits: Portraits;
  params: Params;
  save: SaveData;
  heroes: Map<HeroId, Hero>;
  player: Hero;
  monsters: Monster[];
  /** «Пожирач земель» while it lives (one entity, not in `monsters`); null when beaten. */
  boss: Boss | null;
  arrows: Arrow[];
  pickups: Map<string, Pickup>;
  house: HouseState | null;
  clock: { t: number; daylight: number; frozen: boolean; elapsed: number };
  /** True once a hero is chosen; before that the camera idles around the house. */
  playing: boolean;
  /** Player is asleep (fading home); input is ignored. */
  sleeping: boolean;
  /** A scene holds the heroes in place (beds or a tent for the night, seats at a meal): physics waits, nothing bites. */
  napping: boolean;
  /** Seconds of the ice cream's fast running left (systems/food.ts). */
  fast: number;
}
