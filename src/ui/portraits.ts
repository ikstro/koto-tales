import * as THREE from 'three';
import type { HeroId, IModels, ItemId, MonsterKind } from '../contracts';
import { HEROES, HERO_ORDER } from '../content/heroes';
import { ITEM_ORDER } from '../content/items';
import { MONSTERS, MONSTER_ORDER } from '../content/monsters';

/** Still pictures of every hero, monster and item, for menus and the album. */
export interface Portraits {
  heroes: Record<HeroId, string>;
  monsters: Record<MonsterKind, string>;
  items: Record<ItemId, string>;
}

/**
 * Renders each model once into an offscreen target of the game's own
 * renderer (a second WebGL context can take the main one down on weak
 * tablets) and keeps the result as a PNG data URL.
 */
export function makePortraits(renderer: THREE.WebGLRenderer, models: IModels, size = 192): Portraits {
  const target = new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace });
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(2, 4, 5);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);

  const pixels = new Uint8Array(size * size * 4);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const image = g.createImageData(size, size);

  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  renderer.setClearColor(0x000000, 0);

  const shoot = (obj: THREE.Object3D, yaw: number): string => {
    obj.rotation.y = yaw;
    scene.add(obj);
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const centre = box.getCenter(new THREE.Vector3());
    const dims = box.getSize(new THREE.Vector3());
    const radius = Math.max(dims.x, dims.y, dims.z) * 0.62;
    const dist = radius / Math.tan(THREE.MathUtils.degToRad(15));
    camera.position.set(centre.x, centre.y + radius * 0.35, centre.z + dist);
    camera.lookAt(centre);
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
    // WebGL rows run bottom-up.
    for (let y = 0; y < size; y++) image.data.set(pixels.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    g.putImageData(image, 0, 0);
    scene.remove(obj);
    return canvas.toDataURL('image/png');
  };

  const heroes = {} as Record<HeroId, string>;
  for (const id of HERO_ORDER) {
    const m = models.character(HEROES[id].model);
    m.update(0, 0);
    heroes[id] = shoot(m.root, id === 'pupsia' ? 0.7 : 0.35);
    m.dispose();
  }
  const monsters = {} as Record<MonsterKind, string>;
  for (const kind of MONSTER_ORDER) {
    const m = models.character(MONSTERS[kind].model);
    m.update(0, 0);
    monsters[kind] = shoot(m.root, kind === 'spider' ? 0.6 : 0.35);
    m.dispose();
  }
  const items = {} as Record<ItemId, string>;
  for (const id of ITEM_ORDER) items[id] = shoot(models.item(id), 0.5);

  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  target.dispose();
  return { heroes, monsters, items };
}
