/**
 * Tiny box-modelling kit for the code-built rigs, items and props.
 *
 * Boxes are collected per part and merged by paint: every colour of a part is
 * one mesh (one draw call), and every face-atlas box of a part (head, hair,
 * ears…) is one more. Geometry is cached by `kitId/part/paint`, so rebuilding
 * for another skin reuses it; materials always come from the skin.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Skin } from '../../contracts';
import { FACE_U, swatchUV, type FaceAtlas } from '../faces';

export type V3 = readonly [number, number, number];

/**
 * - a colour: plain part material
 * - `{ c, glow, clear }`: colour with skin options (emissive / transparent)
 * - `{ s, face }`: swatch `s` of the kit's face atlas; `face` puts the face on the +Z side
 */
export type Paint =
  | string
  | number
  | { c: string | number; glow?: boolean; clear?: boolean }
  | { s: number; face?: boolean };

interface BoxSpec {
  size: V3;
  at: V3;
  rot?: V3;
  q?: THREE.Quaternion;
  paint: Paint;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
const UP = new THREE.Vector3(0, 1, 0);

function isAtlas(p: Paint): p is { s: number; face?: boolean } {
  return typeof p === 'object' && 's' in p;
}

function colourOf(p: Paint): string {
  if (typeof p === 'string' || typeof p === 'number') return new THREE.Color(p).getHexString();
  if ('c' in p) return new THREE.Color(p.c).getHexString();
  return 'atlas';
}

export function paintKey(p: Paint): string {
  if (isAtlas(p)) return 'atlas';
  const o = typeof p === 'object' ? p : null;
  return colourOf(p) + (o?.glow ? 'g' : '') + (o?.clear ? 't' : '');
}

function boxGeometry(b: BoxSpec): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(b.size[0], b.size[1], b.size[2]);
  g.clearGroups();
  if (isAtlas(b.paint)) {
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    const [su, sv] = swatchUV(b.paint.s);
    for (let i = 0; i < uv.count; i++) {
      // BoxGeometry side order: +X, -X, +Y, -Y, +Z, -Z (4 vertices each).
      if (b.paint.face && i >= 16 && i < 20) uv.setX(i, uv.getX(i) * FACE_U);
      else uv.setXY(i, su, sv);
    }
  }
  const q = b.q ?? new THREE.Quaternion().setFromEuler(new THREE.Euler(...(b.rot ?? [0, 0, 0])));
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...b.at), q, new THREE.Vector3(1, 1, 1)));
  return g;
}

export class Kit {
  private mats = new Map<string, THREE.Material>();
  eyes?: { mesh: THREE.Mesh; open: THREE.Material; closed: THREE.Material };

  constructor(
    readonly id: string,
    readonly skin: Skin,
    readonly atlas?: FaceAtlas,
  ) {}

  material(p: Paint): THREE.Material {
    const key = paintKey(p);
    let m = this.mats.get(key);
    if (m) return m;
    if (isAtlas(p)) {
      if (!this.atlas) throw new Error(`kit ${this.id}: atlas paint without a face atlas`);
      m = this.skin.partMaterial(0xffffff, { map: this.atlas.open });
    } else if (typeof p === 'object') {
      m = this.skin.partMaterial(p.c, { emissive: p.glow, transparent: p.clear });
    } else {
      m = this.skin.partMaterial(p);
    }
    this.mats.set(key, m);
    return m;
  }

  closedEyes(): THREE.Material {
    let m = this.mats.get('atlas-closed');
    if (!m) {
      m = this.skin.partMaterial(0xffffff, { map: this.atlas!.closed });
      this.mats.set('atlas-closed', m);
    }
    return m;
  }

  /** Starts a part: boxes added to the builder are merged into `obj` on `done()`. */
  part(name: string, obj: THREE.Object3D): PartBuilder {
    obj.name = obj.name || name;
    return new PartBuilder(this, name, obj);
  }

  /** All materials this kit asked the skin for. */
  materials(): THREE.Material[] {
    return [...this.mats.values()];
  }
}

export class PartBuilder {
  private boxes: BoxSpec[] = [];

  constructor(
    private kit: Kit,
    private name: string,
    private obj: THREE.Object3D,
  ) {}

  box(size: V3, at: V3, paint: Paint, rot?: V3): this {
    this.boxes.push({ size, at, paint, rot });
    return this;
  }

  /** A square-section beam from a to b. */
  beam(a: V3, b: V3, thick: number, paint: Paint, thickZ = thick): this {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const dir = vb.clone().sub(va);
    const len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
    const mid = va.add(vb).multiplyScalar(0.5);
    this.boxes.push({ size: [thick, len, thickZ], at: [mid.x, mid.y, mid.z], q, paint });
    return this;
  }

  /**
   * Pixel art on a plane facing +Z. `topLeft` is the corner of the first
   * pixel; rows run down (-Y), columns run to +X. Runs of one char merge.
   */
  pixels(rows: string[], pal: Record<string, Paint>, topLeft: V3, px: number, depth: number): this {
    rows.forEach((row, r) => {
      let c = 0;
      while (c < row.length) {
        const ch = row[c];
        let e = c + 1;
        while (e < row.length && row[e] === ch) e++;
        const p = pal[ch];
        if (p !== undefined) {
          const w = (e - c) * px;
          this.box(
            [w, px, depth],
            [topLeft[0] + c * px + w / 2, topLeft[1] - r * px - px / 2, topLeft[2] + depth / 2],
            p,
          );
        }
        c = e;
      }
    });
    return this;
  }

  done(): THREE.Mesh[] {
    const groups = new Map<string, BoxSpec[]>();
    for (const b of this.boxes) {
      const k = paintKey(b.paint);
      let list = groups.get(k);
      if (!list) groups.set(k, (list = []));
      list.push(b);
    }
    const meshes: THREE.Mesh[] = [];
    for (const [k, list] of groups) {
      const cacheKey = `${this.kit.id}/${this.name}/${k}`;
      let geo = geoCache.get(cacheKey);
      if (!geo) {
        const parts = list.map(boxGeometry);
        geo = parts.length === 1 ? parts[0] : mergeGeometries(parts, false)!;
        if (parts.length > 1) parts.forEach((p) => p.dispose());
        geo.computeBoundingSphere();
        geoCache.set(cacheKey, geo);
      }
      const mesh = new THREE.Mesh(geo, this.kit.material(list[0].paint));
      mesh.name = `${this.name}_${k}`;
      mesh.castShadow = true;
      this.obj.add(mesh);
      meshes.push(mesh);
      if (k === 'atlas' && list.some((b) => isAtlas(b.paint) && b.paint.face)) {
        mesh.name = 'eyes';
        this.kit.eyes = { mesh, open: mesh.material as THREE.Material, closed: this.kit.closedEyes() };
      }
    }
    this.boxes = [];
    return meshes;
  }
}

/** Counts meshes under an object (= draw calls when everything is visible). */
export function countMeshes(obj: THREE.Object3D): number {
  let n = 0;
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) n++;
  });
  return n;
}
