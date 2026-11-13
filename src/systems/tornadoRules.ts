import type { IWorld } from '../contracts';
import { B } from '../world/blocks';

export const WIND_SEATS = [[0, 0], [-0.9, 0.8], [0.9, 0.8], [0, 1.8]] as const;
type Ground = Pick<IWorld, 'groundHeight' | 'getBlock' | 'isWater' | 'isSolid'>;
export type WindLanding = { x: number; y: number; z: number }[];
const GROUND = new Set<number>([B.GRASS, B.DIRT, B.SAND, B.STONE, B.COBBLE, B.SNOW]);

/** Every foot and the whole body must fit; roofs, tree crowns and water are not landing pads. */
export function windLandingAt(world: Ground, x: number, z: number, allowed: (x: number, z: number) => boolean = () => true): WindLanding | null {
  const spots: WindLanding = [];
  for (const [dx, dz] of WIND_SEATS) {
    const px=x+dx, pz=z+dz, y=world.groundHeight(Math.floor(px),Math.floor(pz));
    if (!allowed(px,pz) || y<=0 || !GROUND.has(world.getBlock(Math.floor(px),y-1,Math.floor(pz))) || world.isWater(Math.floor(px),y,Math.floor(pz))) return null;
    if (spots.length && Math.abs(y-spots[0].y)>1) return null;
    for(let bx=Math.floor(px-0.33);bx<=Math.floor(px+0.33);bx++) for(let bz=Math.floor(pz-0.33);bz<=Math.floor(pz+0.33);bz++) {
      if(world.groundHeight(bx,bz)!==y || world.isWater(bx,y,bz) || world.isSolid(bx,y,bz) || world.isSolid(bx,y+1,bz)) return null;
    }
    spots.push({x:px,y:y+0.001,z:pz});
  }
  return spots;
}

/** Bounded search: never scans a world or creates distant chunks. Called only on request. */
export function findWindLanding(world: Ground, x: number, z: number, allowed?: (x: number, z: number) => boolean): WindLanding | null {
  const here=windLandingAt(world,x,z,allowed);
  if(here) return here;
  for(const radius of [2,4,6,8]) for(let i=0;i<8;i++) {
    const a=i*Math.PI/4;
    const spot=windLandingAt(world,x+Math.cos(a)*radius,z+Math.sin(a)*radius,allowed);
    if(spot) return spot;
  }
  return null;
}

export function windCanHit(m: { alive: boolean; state: string; card: { armor?: string; shy?: boolean } }): boolean {
  return m.alive && m.state!=='dance' && m.state!=='wait' && !m.card.armor && !m.card.shy;
}
