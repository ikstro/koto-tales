/**
 * The seams between modules. Each module implements its side of this file;
 * the game layer only talks to modules through these shapes.
 *
 *   world data ──► ChunkGeometry (style-neutral) ──► Skin (how it looks)
 *   cards ──► ModelRef ──► Models (parts | glb | drawing) ──► Rig ──► animator ──► CharacterModel
 *
 * Units: 1 block = 1 world unit. +Y is up. The camera looks from +Z towards
 * -Z from above, so "screen up" is world -Z.
 */
import type * as THREE from 'three';
import type { ItemId as ContentItemId } from './content/items';
import type { MonsterKind as ContentMonsterKind } from './content/monsters';

// ─── ids ────────────────────────────────────────────────────────────────────

export type HeroId = 'lyosha' | 'solomiia' | 'pupsia';
/** Defined by the cards, so adding a monster or an item touches one file. */
export type MonsterKind = ContentMonsterKind;
export type ItemId = ContentItemId;

// ─── world ──────────────────────────────────────────────────────────────────

export type Biome = 'meadow' | 'forest' | 'beach' | 'hills' | 'snow';

export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 48;
export const SEA_LEVEL = 10;
/**
 * Bump when terrain generation changes in a way that moves the ground.
 * Saves remember the version they were made with (see systems/save.ts).
 */
export const TERRAIN_VERSION = 1;

export interface RayHit {
  /** The block that was hit. */
  x: number;
  y: number;
  z: number;
  /** Normal of the face that was hit, one of the six axis directions. */
  nx: number;
  ny: number;
  nz: number;
  distance: number;
}

/** One block of a hand-made structure, relative to the structure origin. */
export interface StructureBlock {
  dx: number;
  dy: number;
  dz: number;
  id: number;
}

/** Handed to `onChunkGenerated` so the game can scatter pickups deterministically. */
export interface ChunkInfo {
  cx: number;
  cz: number;
  /** World x/z of the chunk's min corner. */
  x0: number;
  z0: number;
  /** Deterministic per-chunk random in [0,1), seeded from world seed + cx,cz. */
  rand: () => number;
  biomeAt(x: number, z: number): Biome;
  /** y where feet stand on dry land at this column, or null for water/no ground. */
  dryGroundAt(x: number, z: number): number | null;
}

export interface WorldOptions {
  seed: number;
  /** Radius in chunks around the focus that is kept meshed. */
  renderDistance: number;
}

/** Face directions, the low 3 bits of `FaceBuffers.face`. */
export const DIR = { PX: 0, NX: 1, PY: 2, NY: 3, PZ: 4, NZ: 5 } as const;

/**
 * Style-neutral geometry of one render pass of a chunk. The skin's material
 * reads these attributes; it never needs to know how the mesher works.
 */
export interface FaceBuffers {
  /** World-space positions (the mesh sits at the origin). */
  position: Float32Array;
  normal: Float32Array;
  /**
   * Face-local coordinates measured in BLOCKS (0..w, 0..h of a merged quad),
   * so `fract(uv)` is the position inside one block face — a pixel texture
   * tiles with it, a toy brick draws its bevel and stud with it.
   */
  uv: Float32Array;
  /** Ambient occlusion per vertex, 0 (dark corner) .. 1 (open). */
  ao: Float32Array;
  /** blockId * 8 + dir, per vertex (constant across a face). */
  face: Float32Array;
  index: Uint32Array;
}

export interface ChunkGeometry {
  cx: number;
  cz: number;
  opaque: FaceBuffers;
  /** Water and glass. */
  transparent: FaceBuffers;
  /** Solid blocks with air above: x, y, z, blockId per entry (world coords). For studs and grass tufts. */
  tops: Int32Array;
}

/**
 * Implemented by `src/world/World.ts` as `export class World implements IWorld`.
 * Constructor: `new World(scene: THREE.Scene, opts: WorldOptions, skin: Skin)`.
 */
export interface IWorld {
  readonly seed: number;
  /** Stream chunks around the focus. Call every frame; work is budgeted per call. */
  update(focus: THREE.Vector3): void;
  /** Swap the look: new materials, re-decorate; geometry is kept. */
  setSkin(skin: Skin): void;
  /** Block id at integer world coords. Generates terrain data on demand if the chunk is not loaded. y<0 → STONE, y>=WORLD_HEIGHT → AIR. */
  getBlock(x: number, y: number, z: number): number;
  /** Changes a block, records it as an edit, remeshes the affected chunk(s). */
  setBlock(x: number, y: number, z: number, id: number): void;
  isSolid(x: number, y: number, z: number): boolean;
  isWater(x: number, y: number, z: number): boolean;
  /** y where feet stand: one above the highest solid block in the column at or below `fromY` (default: top of world). */
  groundHeight(x: number, z: number, fromY?: number): number;
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): RayHit | null;
  /** A dry, flat-ish grass spot near (x, z); returns feet position. */
  findSpawn(nearX: number, nearZ: number): THREE.Vector3;
  biomeAt(x: number, z: number): Biome;
  /** Writes blocks as edits (persisted). Used for the house. */
  placeStructure(x: number, y: number, z: number, blocks: StructureBlock[]): void;
  /** Inclusive rectangle; afterwards groundHeight == y everywhere in it (fills below, clears clearHeight above). */
  flattenArea(x0: number, z0: number, x1: number, z1: number, y: number, clearHeight: number): void;
  exportEdits(): Record<string, number>;
  importEdits(edits: Record<string, number>): void;
  /** Called once per chunk per session, the first time it is meshed. */
  onChunkGenerated: ((info: ChunkInfo) => void) | null;
  /** Called when a chunk leaves the render distance. */
  onChunkUnloaded: ((cx: number, cz: number) => void) | null;
  /** 0 = night, 1 = full day. */
  setDaylight(k: number): void;
}

// ─── look ───────────────────────────────────────────────────────────────────

export type SkinId = 'pixel' | 'toy' | 'hybrid';
/** 0 = light (weak tablets), 1 = full. */
export type QualityTier = 0 | 1;

/** How a skin dresses the world and the characters. Lives in src/render/skins/. */
export interface Skin {
  readonly id: SkinId;
  /** Material for chunk meshes; reads attributes uv, ao, face (see FaceBuffers). */
  chunkMaterial(pass: 'opaque' | 'transparent'): THREE.Material;
  /** Extra per-chunk objects (e.g. studs), only near the camera. Null when nothing to add. */
  decorate?(g: ChunkGeometry, distChunks: number): THREE.Object3D | null;
  /** Material for a part of a character or item. Same colour, different look per skin. */
  partMaterial(color: string | number, opts?: { emissive?: boolean; map?: THREE.Texture; transparent?: boolean }): THREE.Material;
  /** Adds the skin's lights / sky / fog to the scene once. */
  setupScene(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void;
  /** Called every frame: daylight 0..1, the point the camera follows. */
  updateScene(daylight: number, focus: THREE.Vector3): void;
  /** Renders the frame (lets a skin add post effects). */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void;
  setTier(tier: QualityTier): void;
  dispose(): void;
}

// ─── models ─────────────────────────────────────────────────────────────────

/**
 * Rig convention shared by every model source. No bones, no skinning:
 * each part is an Object3D whose origin is its joint, named exactly as below
 * (also the node names inside a .glb). Feet at the root origin, facing +Z.
 *   biped:     head, body, armL, armR, legL, legR (+ optional hair, tool)
 *   quadruped: head, body, legFL, legFR, legBL, legBR, tail, tail2
 *   spider:    body, head, leg0 … leg7
 *   static:    no animated parts (houses, props, drawn objects)
 * "L" is the character's own left (+X when facing +Z).
 */
export type RigType = 'biped' | 'quadruped' | 'spider' | 'static';

export interface Rig {
  type: RigType;
  root: THREE.Group;
  parts: Record<string, THREE.Object3D>;
  /** Approximate height in blocks. */
  height: number;
  /** Optional blink/sleep eyes: the game swaps materials on this mesh. */
  eyes?: { mesh: THREE.Mesh; open: THREE.Material; closed: THREE.Material };
}

/** Where a model comes from. Cards point at models with this. */
export type ModelRef =
  | { kind: 'parts'; id: string } // built in code from boxes: src/assets/parts/<id>.ts
  | { kind: 'glb'; url: string; rig: RigType } // made in Blender: public/models/<name>.glb
  | { kind: 'drawing'; id: string }; // the child's drawing, from IndexedDB (stage 2)

/** One-shot actions return to idle/walk by themselves; 'sleep' holds until another action. */
export type ModelAction = 'idle' | 'attack' | 'cast' | 'hurt' | 'happy' | 'sleep';

/** A rig with the shared procedural animator attached. */
export interface CharacterModel {
  root: THREE.Group;
  height: number;
  /** Advance animation. `moveSpeed` is horizontal speed in blocks/s (0 = standing). dt = 0 snaps to the pose. */
  update(dt: number, moveSpeed: number): void;
  play(action: ModelAction): void;
  dispose(): void;
}

/** Implemented by src/assets/models.ts. */
export interface IModels {
  /** Loads glb files / drawings so that `character` can be synchronous later. */
  preload(refs: ModelRef[]): Promise<void>;
  character(ref: ModelRef): CharacterModel;
  item(id: ItemId): THREE.Object3D;
  setSkin(skin: Skin): void;
}

/** A hand-built structure plus the special spots the game needs. */
export interface HouseBlueprint {
  /** Footprint size in blocks (x and z). Origin = min corner; dy=0 is the floor layer, feet stand at dy=1. */
  sizeX: number;
  sizeZ: number;
  blocks: StructureBlock[];
  /** The roof is a separate model, faded out while a hero is inside so the camera can see in. */
  createRoof(skin: Skin): THREE.Group;
  /** Feet positions relative to the origin, at block centres (x + 0.5). */
  wakeSpot: { dx: number; dy: number; dz: number };
  chestSpot: { dx: number; dy: number; dz: number };
  campfireSpot: { dx: number; dy: number; dz: number };
  /** Interior rectangle (relative, min inclusive / max exclusive) for "hero is inside". */
  interior: { x0: number; z0: number; x1: number; z1: number };
}

// ─── voice & sound ──────────────────────────────────────────────────────────

export type Speaker = 'narrator' | 'lyosha' | 'solomiia' | 'pupsia' | 'monster';

/** Entry of src/content/lines.json — the single source for voice generation. */
export interface Line {
  speaker: Speaker;
  text: string;
}

export type SfxName =
  | 'arrow'
  | 'hit'
  | 'lightning'
  | 'coin'
  | 'pickup'
  | 'sticker'
  | 'poof'
  | 'hurt'
  | 'place'
  | 'break'
  | 'wake'
  | 'switch'
  | 'step'
  | 'click';

export interface IVoice {
  /** Must be called from a user gesture once (mobile audio unlock). */
  unlock(): void;
  /** Speak a line by id from lines.json. Lower priority lines are dropped while a higher one plays. Missing mp3 → silently ignored. */
  say(lineId: string, opts?: { priority?: number; interrupt?: boolean }): void;
  isSpeaking(): boolean;
  setVolume(v: number): void;
}

export interface ISfx {
  unlock(): void;
  play(name: SfxName, opts?: { volume?: number; pitch?: number }): void;
  setVolume(v: number): void;
  /** Soft ambient loop for day / night; null stops it. */
  ambient(kind: 'day' | 'night' | null): void;
}
