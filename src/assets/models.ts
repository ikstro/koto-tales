/**
 * Model registry: turns a ModelRef from a card into a CharacterModel.
 *
 *   parts   → code-built rig (src/assets/parts/<id>.ts)
 *   glb     → Blender file; parts found by node name (see Rig in contracts)
 *   drawing → the child's drawing (stage 2)
 *
 * Each source is built once into a template Rig; `character()` clones it
 * (geometry and materials shared) and attaches the procedural animator.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CharacterModel, IModels, ItemId, ModelRef, Rig, RigType, Skin } from '../contracts';
import { animate } from './animate';
import { buildItem } from './items';
import { buildAlien1, buildAlien2, buildAlien3, buildAlienCaptain, buildAlienElder, buildAlienKid } from './parts/alien';
import { buildElf1, buildElf2, buildElf3, buildElfElder, buildElfKid, buildElfQueen } from './parts/elf';
import { buildGnome1, buildGnome2, buildGnome3, buildGnomeElder, buildGnomeKid, buildGnomeKing } from './parts/gnome';
import { build as landEater } from './parts/landEater';
import { build as lyosha } from './parts/lyosha';
import { build as pupsia } from './parts/pupsia';
import { buildRobot1, buildRobot2, buildRobot3, buildRobotChief, buildRobotElder, buildRobotKid } from './parts/robot';
import { build as skeleton } from './parts/skeleton';
import { build as solomiia } from './parts/solomiia';
import { build as spider } from './parts/spider';
import { build as zombie } from './parts/zombie';

export const PART_BUILDERS: Record<string, (skin: Skin) => Rig> = {
  lyosha,
  solomiia,
  pupsia,
  zombie,
  skeleton,
  spider,
  landEater,
  elf_elder: buildElfElder,
  elf_1: buildElf1,
  elf_2: buildElf2,
  elf_3: buildElf3,
  elf_kid: buildElfKid,
  gnome_elder: buildGnomeElder,
  gnome_1: buildGnome1,
  gnome_2: buildGnome2,
  gnome_3: buildGnome3,
  gnome_kid: buildGnomeKid,
  robot_elder: buildRobotElder,
  robot_1: buildRobot1,
  robot_2: buildRobot2,
  robot_3: buildRobot3,
  robot_kid: buildRobotKid,
  alien_elder: buildAlienElder,
  alien_1: buildAlien1,
  alien_2: buildAlien2,
  alien_3: buildAlien3,
  alien_kid: buildAlienKid,
  // the castles' rulers (stage C2)
  elf_queen: buildElfQueen,
  gnome_king: buildGnomeKing,
  robot_chief: buildRobotChief,
  alien_captain: buildAlienCaptain,
};

const RIG_PARTS: Record<RigType, string[]> = {
  biped: ['head', 'body', 'armL', 'armR', 'legL', 'legR', 'hair', 'tool'],
  quadruped: ['head', 'body', 'legFL', 'legFR', 'legBL', 'legBR', 'tail', 'tail2'],
  spider: ['body', 'head', 'leg0', 'leg1', 'leg2', 'leg3', 'leg4', 'leg5', 'leg6', 'leg7'],
  static: [],
};

const refKey = (ref: ModelRef): string =>
  ref.kind === 'parts' ? `parts:${ref.id}` : ref.kind === 'glb' ? `glb:${ref.url}` : `drawing:${ref.id}`;

function stage2(ref: { id: string }): Error {
  return new Error(`Drawn models ("${ref.id}") arrive in stage 2; use a 'parts' or 'glb' model for now.`);
}

/** Clones a template rig: new Object3Ds, shared geometry and materials. */
function cloneRig(t: Rig): Rig {
  const root = t.root.clone(true);
  const parts: Record<string, THREE.Object3D> = {};
  for (const name of Object.keys(t.parts)) {
    const found = root.getObjectByName(name);
    if (found) parts[name] = found;
  }
  let eyes: Rig['eyes'];
  if (t.eyes) {
    const mesh = root.getObjectByName(t.eyes.mesh.name) as THREE.Mesh | undefined;
    if (mesh) {
      mesh.material = t.eyes.open;
      eyes = { mesh, open: t.eyes.open, closed: t.eyes.closed };
    }
  }
  return { type: t.type, root, parts, height: t.height, eyes };
}

export class Models implements IModels {
  private templates = new Map<string, Rig>();
  private items = new Map<ItemId, THREE.Group>();
  /** Loaded .glb scenes, kept untouched so a skin change can re-dress them. */
  private glbScenes = new Map<string, { scene: THREE.Group; rig: RigType }>();
  private loader = new GLTFLoader();

  constructor(private skin: Skin) {}

  async preload(refs: ModelRef[]): Promise<void> {
    const jobs: Promise<void>[] = [];
    for (const ref of refs) {
      if (ref.kind === 'drawing') throw stage2(ref);
      if (ref.kind !== 'glb' || this.glbScenes.has(ref.url)) continue;
      jobs.push(
        this.loader.loadAsync(ref.url).then((gltf) => {
          this.glbScenes.set(ref.url, { scene: gltf.scene, rig: ref.rig });
        }),
      );
    }
    await Promise.all(jobs);
  }

  character(ref: ModelRef): CharacterModel {
    return animate(cloneRig(this.template(ref)));
  }

  item(id: ItemId): THREE.Object3D {
    let t = this.items.get(id);
    if (!t) {
      t = buildItem(id, this.skin);
      this.items.set(id, t);
    }
    return t.clone(true);
  }

  setSkin(skin: Skin): void {
    if (skin === this.skin) return;
    this.skin = skin;
    // Templates rebuild lazily with the new skin; models already in the scene keep their look until recreated.
    this.templates.clear();
    this.items.clear();
  }

  private template(ref: ModelRef): Rig {
    const key = refKey(ref);
    let t = this.templates.get(key);
    if (t) return t;
    if (ref.kind === 'parts') {
      const build = PART_BUILDERS[ref.id];
      if (!build) throw new Error(`No part model "${ref.id}" (known: ${Object.keys(PART_BUILDERS).join(', ')})`);
      t = build(this.skin);
    } else if (ref.kind === 'glb') {
      const loaded = this.glbScenes.get(ref.url);
      if (!loaded) throw new Error(`Model ${ref.url} is not loaded: call preload() first.`);
      t = this.rigFromGlb(loaded.scene, loaded.rig);
    } else {
      throw stage2(ref);
    }
    this.templates.set(key, t);
    return t;
  }

  /**
   * Builds a rig from a loaded .glb: parts are nodes named as in the rig
   * convention; meshes are re-dressed with skin materials (same colour and
   * texture). Optional blink: a mesh named "eyes" plus one named
   * "eyes_closed" (hidden; its material is used for shut eyes).
   */
  private rigFromGlb(source: THREE.Group, type: RigType): Rig {
    const root = new THREE.Group();
    root.name = 'root';
    root.add(source.clone(true));
    const mats = new Map<THREE.Material, THREE.Material>();
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      const dress = (m: THREE.Material): THREE.Material => {
        let out = mats.get(m);
        if (out) return out;
        const std = m as THREE.MeshStandardMaterial;
        const emissive = !!std.emissive && std.emissive.getHex() !== 0;
        out = this.skin.partMaterial(std.color ? std.color.getHex() : 0xffffff, {
          map: std.map ?? undefined,
          emissive,
          transparent: m.transparent,
        });
        mats.set(m, out);
        return out;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(dress) : dress(mesh.material);
    });
    const parts: Record<string, THREE.Object3D> = {};
    for (const name of RIG_PARTS[type]) {
      const found = root.getObjectByName(name);
      if (found) parts[name] = found;
    }
    let eyes: Rig['eyes'];
    const open = root.getObjectByName('eyes') as THREE.Mesh | undefined;
    const closed = root.getObjectByName('eyes_closed') as THREE.Mesh | undefined;
    if (open?.isMesh && closed?.isMesh) {
      closed.visible = false;
      eyes = { mesh: open, open: open.material as THREE.Material, closed: closed.material as THREE.Material };
    }
    const box = new THREE.Box3().setFromObject(root);
    const height = box.isEmpty() ? 1 : box.max.y - Math.min(0, box.min.y);
    return { type, root, parts, height, eyes };
  }
}
