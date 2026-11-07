/**
 * «Великі шахи» (content/buildings.ts `bigchess`, DESIGN.md «Chess kingdom»): a 4×4 toy board of
 * one-block cells lying on the floor with a thin mustard rim, a living white piece standing on a cell,
 * and a little king and queen watching from the back corners. The party walks on it (no solid cells).
 *
 * Origin at the floor centre of the footprint, front towards +Z. Cells (c, r): c 0‥3 left to right as
 * seen from the front, r 0‥3 from the front (+Z) to the back — the same way round as the kingdom's.
 * `board` is the shared BoardModel (assets/chess.ts: glows, the stars and the goal's coin). `pieces`
 * holds the five white pieces the puzzles rotate (rook, bishop, queen, king, knight), all built up front
 * on the front-left cell; only the knight is visible at first. They share one set of shader programs, so
 * showing another is free. Each is a CharacterModel's root in this model's frame (board.cellPos gives the
 * spots); its CharacterModel is `userData.character`, e.g. `.play('cheer')`. This model's own update runs
 * the board and the visible pieces' idle (blinks, breathing) — the system shows one at a time and moves it.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CharacterModel, Skin } from '../contracts';
import { SMALL_BOARD, type Cell, type PieceKind } from '../content/chess';
import type { BuildingModel } from './buildings';
import { MUSTARD } from './buildingParts';
import { createBoard } from './chess';
import { animate } from './animate';
import { buildChessman } from './parts/chessman';
import { Kit } from './parts/kit';

const N = SMALL_BOARD;
const at = (c: Cell): [number, number] => [c.c - (N - 1) / 2, (N - 1) / 2 - c.r];
const under = (x: number, z: number): Cell | null => {
  const c = Math.floor(x + N / 2);
  const r = Math.floor(N / 2 - z);
  return c >= 0 && r >= 0 && c < N && r < N ? { c, r } : null;
};

/** One static copy of an object's meshes, merged by material (the watchers never move). */
function bakeStatic(obj: THREE.Object3D, name: string): THREE.Group {
  const out = new THREE.Group();
  out.name = name;
  obj.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as THREE.Material;
    const g = mesh.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld));
    const list = byMat.get(mat) ?? [];
    list.push(g.index ? g.toNonIndexed() : g);
    byMat.set(mat, list);
  });
  for (const [mat, list] of byMat) {
    const merged = list.length === 1 ? list[0] : mergeGeometries(list)!;
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    out.add(m);
  }
  return out;
}

/** The pieces the small board's puzzles rotate, in their order. */
export const BIGCHESS_PIECES = ['rook', 'bishop', 'queen', 'king', 'knight'] as const satisfies readonly PieceKind[];

export function createBigchess(skin: Skin): BuildingModel & { pieces: Record<(typeof BIGCHESS_PIECES)[number], THREE.Object3D> } {
  const root = new THREE.Group();
  root.name = 'bigchess';

  const { root: boardRoot, board } = createBoard(skin, { n: N, size: 1, at, under, goal: 'coin', rim: { colour: MUSTARD, width: 0.08 } });
  root.add(boardRoot);

  // the little king and queen on round mustard plinths at the back corners, turned to the board
  const plinths = new THREE.Group();
  plinths.name = 'plinths';
  const p = new Kit('bigchess', skin).part('plinths', plinths);
  const watchers = new THREE.Group();
  for (const [sx, kind] of [[-1, 'king'], [1, 'queen']] as const) {
    p.box([0.42, 0.1, 0.42], [sx * 2, 0.05, -2], MUSTARD, [0, Math.PI / 4, 0]);
    p.box([0.3, 0.06, 0.3], [sx * 2, 0.13, -2], '#ffd23a', [0, Math.PI / 4, 0]);
    const rig = buildChessman(skin, kind, 'white');
    rig.root.scale.setScalar(0.42);
    rig.root.position.set(sx * 2, 0.16, -2);
    rig.root.rotation.y = -sx * Math.PI / 4;
    if (kind === 'queen') rig.parts.armR.rotation.z = -0.9;
    else rig.parts.armL.rotation.z = 0.9;
    watchers.add(rig.root);
  }
  p.done();
  root.add(plinths, bakeStatic(watchers, 'watchers'));

  // the living pieces, all on the front-left cell; the knight shows first
  const characters: CharacterModel[] = [];
  const pieces = {} as Record<(typeof BIGCHESS_PIECES)[number], THREE.Object3D>;
  for (const kind of BIGCHESS_PIECES) {
    const character = animate(buildChessman(skin, kind, 'white'));
    const piece = character.root;
    piece.name = kind;
    board.cellPos({ c: 0, r: 0 }, piece.position);
    piece.userData.character = character;
    piece.visible = kind === 'knight';
    character.update(0, 0);
    characters.push(character);
    pieces[kind] = piece;
    root.add(piece);
  }

  return {
    root,
    board,
    pieces,
    update(dt) {
      board.update(dt);
      for (const c of characters) if (c.root.visible) c.update(dt, 0);
    },
  };
}
