import { describe, expect, it } from 'vitest';
import { B } from '../world/blocks';
import { findWindLanding, windLandingAt, windCanHit } from './tornadoRules';

const meadow=()=>({groundHeight:(_x:number,_z:number)=>3,getBlock:(_x:number,_y:number,_z:number)=>B.GRASS,isWater:(_x:number,_y:number,_z:number)=>false,isSolid:(_x:number,_y:number,_z:number)=>false});
describe('wind landing',()=> {
  it('finds room for all four heroes, not just the player',()=> {
    const w=meadow();
    expect(windLandingAt(w,0,0)).toHaveLength(4);
    w.isSolid=(x,y,z)=>x===-1 && y===4 && z===0;
    expect(windLandingAt(w,0,0)).toBeNull();
  });
  it('rejects water, tree crowns, roofs, cliffs and a locked area',()=> {
    expect(windLandingAt({...meadow(),isWater:()=>true},0,0)).toBeNull();
    for(const top of [B.LEAVES,B.LOG,B.PLANKS]) expect(windLandingAt({...meadow(),getBlock:()=>top},0,0)).toBeNull();
    expect(windLandingAt({...meadow(),groundHeight:(x)=>x<0?8:3},0,0)).toBeNull();
    expect(windLandingAt(meadow(),0,0,(x)=>x>=0)).toBeNull();
  });
  it('finds a nearby shore, but does not scan across a large lake',()=> {
    const shore={...meadow(),isWater:(x:number)=>x<2};
    const at=findWindLanding(shore,0,0);
    expect(at).not.toBeNull();
    expect(at!.every(s=>s.x>=2)).toBe(true);
    let checks=0;
    expect(findWindLanding({...meadow(),groundHeight:()=>{checks++;return 0;}},0,0)).toBeNull();
    expect(checks).toBeLessThanOrEqual(33);
  });
});
describe('fire wind targets',()=> {
  const monster={alive:true,state:'chase',card:{}};
  it('leaves dancers, waiting monsters, armour, gifts and dead monsters alone',()=> {
    expect(windCanHit(monster)).toBe(true);
    for(const state of ['dance','wait']) expect(windCanHit({...monster,state})).toBe(false);
    for(const armor of ['bolt','lantern']) expect(windCanHit({...monster,card:{armor}})).toBe(false);
    expect(windCanHit({...monster,card:{shy:true}})).toBe(false);
    expect(windCanHit({...monster,alive:false})).toBe(false);
  });
});
