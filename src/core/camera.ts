import * as THREE from 'three';

/**
 * The camera hangs above and behind the hero and never turns, so "up on the
 * joystick" is always "up on the screen". Before the game starts the start
 * ritual (ui/wake.ts) moves it and lands on `poseFor`; `idle` circling the
 * house is the fallback when no ritual runs.
 */
export class FollowCamera {
  readonly offset = new THREE.Vector3(0, 13, 10.5);
  private target = new THREE.Vector3();
  private shakeT = 0;
  private orbit = 0;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  shake(strength = 0.35): void {
    this.shakeT = Math.max(this.shakeT, strength);
  }

  /** Jump straight to the follow pose (the same one `follow` settles into). */
  snap(focus: THREE.Vector3): void {
    this.target.copy(focus);
    this.camera.position.copy(focus).add(this.offset);
    this.camera.lookAt(focus.x, focus.y + FollowCamera.LOOK_UP, focus.z);
  }

  /** The follow pose for a focus point, for an intro that wants to land on it. */
  poseFor(focus: THREE.Vector3, pos: THREE.Vector3, look: THREE.Vector3): void {
    pos.copy(focus).add(this.offset);
    look.copy(focus).setY(focus.y + FollowCamera.LOOK_UP);
  }

  static readonly LOOK_UP = 0.8;

  follow(focus: THREE.Vector3, dt: number): void {
    this.target.lerp(focus, 1 - Math.exp(-dt * 6));
    const cam = this.camera;
    cam.position.copy(this.target).add(this.offset);
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      const s = this.shakeT * 0.6;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
    }
    cam.lookAt(this.target.x, this.target.y + FollowCamera.LOOK_UP, this.target.z);
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
