import * as THREE from 'three';

/**
 * How the camera frames the hero: how steeply it looks down at them (degrees, along the line
 * to the hero), how far away it hangs (the hero's size on screen) and how far below the middle
 * of the screen the hero stands (degrees off the view's axis), so there is room above them for
 * tall things and the way ahead.
 */
export interface Framing {
  pitch: number;
  dist: number;
  drop: number;
}

/**
 * `?cam=<n>` picks one for comparing shots; 1 is the game's (DESIGN.md «Camera»): steeper, so tall
 * things take less of the screen, a little closer, so the hero keeps their height on screen.
 */
export const FRAMINGS: readonly Framing[] = [
  // before 2026-10-30: about 49°, the hero in the middle
  { pitch: 49.3, dist: 16.1, drop: 0 },
  { pitch: 60, dist: 14.2, drop: 4 },
  // as far as before: the hero ~11% shorter on screen (the owner keeps the hero's size)
  { pitch: 60, dist: 16.1, drop: 4 },
  { pitch: 64, dist: 16.1, drop: 5 },
];

/**
 * The camera hangs above and behind the hero and never turns, so "up on the
 * joystick" is always "up on the screen". Before the game starts the start
 * ritual (ui/wake.ts) moves it and lands on `poseFor`; `idle` circling the
 * house is the fallback when no ritual runs.
 */
export class FollowCamera {
  /** From the point it looks at the hero by (LOOK_UP above the feet) to the camera. */
  readonly offset = new THREE.Vector3();
  /** How far north of that point the view's axis meets its height (puts the hero below the middle). */
  private ahead = 0;
  private target = new THREE.Vector3();
  private shakeT = 0;
  private orbit = 0;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    framing: Framing = FRAMINGS[1],
  ) {
    const p = THREE.MathUtils.degToRad(framing.pitch);
    const axis = THREE.MathUtils.degToRad(framing.pitch - framing.drop);
    this.offset.set(0, Math.sin(p), Math.cos(p)).multiplyScalar(framing.dist);
    this.ahead = this.offset.y / Math.tan(axis) - this.offset.z;
  }

  shake(strength = 0.35): void {
    this.shakeT = Math.max(this.shakeT, strength);
  }

  /** Jump straight to the follow pose (the same one `follow` settles into). */
  snap(focus: THREE.Vector3): void {
    this.target.copy(focus);
    this.poseFor(focus, this.camera.position, look);
    this.camera.lookAt(look);
  }

  /** The follow pose for a focus point, for an intro that wants to land on it. */
  poseFor(focus: THREE.Vector3, pos: THREE.Vector3, at: THREE.Vector3, zoom = 1): void {
    pos.copy(focus).addScaledVector(this.offset, zoom);
    pos.y += FollowCamera.LOOK_UP;
    at.copy(focus).setY(focus.y + FollowCamera.LOOK_UP);
    at.z -= this.ahead * zoom;
  }

  static readonly LOOK_UP = 0.8;

  /** How far the camera pulls back (1 = normal; bigger near something huge, like the boss). */
  zoomTarget = 1;
  private zoom = 1;

  follow(focus: THREE.Vector3, dt: number): void {
    this.target.lerp(focus, 1 - Math.exp(-dt * 6));
    this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.exp(-dt * 2.5));
    const cam = this.camera;
    this.poseFor(this.target, cam.position, look, this.zoom);
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      const s = this.shakeT * 0.6;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
    }
    cam.lookAt(look);
  }

  /** Start-screen flyover around a point. */
  idle(centre: THREE.Vector3, dt: number): void {
    this.orbit += dt * 0.06;
    // High enough that trees around the house never block the view.
    const r = 22;
    this.camera.position.set(centre.x + Math.sin(this.orbit) * r, centre.y + 20, centre.z + Math.cos(this.orbit) * r);
    this.camera.lookAt(centre.x, centre.y + 1, centre.z);
    this.target.copy(centre);
  }
}

const look = new THREE.Vector3();
