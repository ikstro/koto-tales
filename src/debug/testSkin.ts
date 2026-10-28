/** Minimal Skin for the model debug page: Lambert parts, hemisphere + sun, plain render. */
import * as THREE from 'three';
import type { QualityTier, Skin } from '../contracts';

export class TestSkin implements Skin {
  readonly id = 'pixel' as const;
  private mats = new Map<string, THREE.Material>();
  private chunk = new THREE.MeshLambertMaterial({ color: 0x999999 });
  private sun = new THREE.DirectionalLight(0xffffff, 2.2);
  private hemi = new THREE.HemisphereLight(0xdfefff, 0x7a6a55, 1.6);

  chunkMaterial(): THREE.Material {
    return this.chunk;
  }

  partMaterial(color: string | number, opts: { emissive?: boolean; map?: THREE.Texture; transparent?: boolean } = {}): THREE.Material {
    const key = `${new THREE.Color(color).getHexString()}|${opts.emissive ? 1 : 0}|${opts.map?.uuid ?? ''}|${opts.transparent ? 1 : 0}`;
    let m = this.mats.get(key);
    if (!m) {
      const c = new THREE.Color(color);
      m = new THREE.MeshLambertMaterial({
        color: c,
        map: opts.map ?? null,
        emissive: opts.emissive ? c.clone().multiplyScalar(0.75) : new THREE.Color(0),
        transparent: !!opts.transparent,
      });
      this.mats.set(key, m);
    }
    return m;
  }

  setupScene(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void {
    scene.background = new THREE.Color(0xbfe3f5);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.sun.position.set(6, 12, 8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const c = this.sun.shadow.camera;
    c.left = c.bottom = -14;
    c.right = c.top = 14;
    c.near = 1;
    c.far = 50;
    scene.add(this.sun, this.sun.target, this.hemi);
  }

  updateScene(): void {}

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    renderer.render(scene, camera);
  }

  setTier(_t: QualityTier): void {}

  dispose(): void {
    this.mats.forEach((m) => m.dispose());
    this.chunk.dispose();
  }
}
