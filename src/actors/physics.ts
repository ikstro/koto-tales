import * as THREE from 'three';
import type { IWorld } from '../contracts';

/** A box standing on its feet centre, moved against the voxel grid. */
export interface Body {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  radius: number;
  height: number;
  onGround: boolean;
  inWater: boolean;
  /** Set for one step when horizontal movement was blocked (used for auto-jump and stuck checks). */
  blocked: boolean;
}

const GRAVITY = 25;
const JUMP_SPEED = 8.2; // clears one block
const MAX_FALL = 22;
const EPS = 1e-3;

export function makeBody(radius: number, height: number): Body {
  return {
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    radius,
    height,
    onGround: false,
    inWater: false,
    blocked: false,
  };
}

function collides(world: IWorld, x: number, y: number, z: number, r: number, h: number): boolean {
  const x0 = Math.floor(x - r);
  const x1 = Math.floor(x + r - EPS);
  const y0 = Math.floor(y);
  const y1 = Math.floor(y + h - EPS);
  const z0 = Math.floor(z - r);
  const z1 = Math.floor(z + r - EPS);
  for (let bx = x0; bx <= x1; bx++)
    for (let by = y0; by <= y1; by++)
      for (let bz = z0; bz <= z1; bz++) if (world.isSolid(bx, by, bz)) return true;
  return false;
}

/** True when a one-block step in front is climbable (free space above it). */
function canStepUp(world: IWorld, b: Body, x: number, z: number): boolean {
  return !collides(world, x, b.pos.y + 1 + EPS, z, b.radius, b.height);
}

/**
 * Moves a body by its velocity. Kids never press "jump": walking into a
 * one-block ledge hops onto it by itself.
 */
export function stepBody(world: IWorld, b: Body, dt: number, autoJump = true): void {
  // Big frames are split so a fast body never tunnels through a block.
  const steps = Math.max(1, Math.ceil((Math.abs(b.vel.x) + Math.abs(b.vel.z) + Math.abs(b.vel.y)) * dt / 0.4));
  const h = dt / steps;
  b.blocked = false;
  for (let i = 0; i < steps; i++) subStep(world, b, h, autoJump);
}

function subStep(world: IWorld, b: Body, dt: number, autoJump: boolean): void {
  const p = b.pos;
  const feetWater = world.isWater(Math.floor(p.x), Math.floor(p.y + 0.2), Math.floor(p.z));
  const chestWater = world.isWater(Math.floor(p.x), Math.floor(p.y + b.height * 0.6), Math.floor(p.z));
  b.inWater = feetWater;

  // Gravity, softened in water; deep water floats you up to the surface.
  if (chestWater) b.vel.y = Math.min(b.vel.y + 30 * dt, 2.5);
  else b.vel.y -= (feetWater ? GRAVITY * 0.4 : GRAVITY) * dt;
  if (b.vel.y < -MAX_FALL) b.vel.y = -MAX_FALL;

  // X
  const nx = p.x + b.vel.x * dt;
  if (!collides(world, nx, p.y, p.z, b.radius, b.height)) p.x = nx;
  else {
    b.blocked = true;
    if (autoJump && (b.onGround || feetWater) && canStepUp(world, b, nx, p.z)) b.vel.y = Math.max(b.vel.y, JUMP_SPEED);
  }

  // Z
  const nz = p.z + b.vel.z * dt;
  if (!collides(world, p.x, p.y, nz, b.radius, b.height)) p.z = nz;
  else {
    b.blocked = true;
    if (autoJump && (b.onGround || feetWater) && canStepUp(world, b, p.x, nz)) b.vel.y = Math.max(b.vel.y, JUMP_SPEED);
  }

  // Y
  const ny = p.y + b.vel.y * dt;
  if (!collides(world, p.x, ny, p.z, b.radius, b.height)) {
    p.y = ny;
    b.onGround = false;
  } else if (b.vel.y < 0) {
    p.y = Math.floor(ny + EPS) + 1;
    // Landed inside a block (e.g. one was placed on us): pop out on top.
    while (collides(world, p.x, p.y, p.z, b.radius, b.height) && p.y < 64) p.y += 1;
    b.vel.y = 0;
    b.onGround = true;
  } else {
    b.vel.y = 0;
  }
}

/** Puts a body standing on the ground at x, z. */
export function placeOnGround(world: IWorld, b: Body, x: number, z: number): void {
  b.pos.set(x, world.groundHeight(Math.floor(x), Math.floor(z)) + EPS, z);
  b.vel.set(0, 0, 0);
  b.onGround = true;
}

export function overlapsBlock(b: Body, bx: number, by: number, bz: number): boolean {
  return (
    bx + 1 > b.pos.x - b.radius &&
    bx < b.pos.x + b.radius &&
    by + 1 > b.pos.y &&
    by < b.pos.y + b.height &&
    bz + 1 > b.pos.z - b.radius &&
    bz < b.pos.z + b.radius
  );
}
