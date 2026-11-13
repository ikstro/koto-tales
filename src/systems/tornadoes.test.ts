import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from '../core/ctx';
import { B } from '../world/blocks';
import { makeBody } from '../actors/physics';
import { HERO_ORDER } from '../content/heroes';
import { freshSave, migrate } from './save';
import { boardWind, disposeTornadoes, initTornadoes, landWind, spawnFireWind, summonBlueWind, updateTornadoes } from './tornadoes';
import { damageMonster, hurtHero } from './combat';
import { useItem, initEffects } from './effects';

vi.mock('../voice/sfx',()=>({sfx:{play:vi.fn()}}));
vi.mock('../voice/voice',()=>({voice:{say:vi.fn()}}));
vi.mock('./combat',()=>({damageMonster:vi.fn(),hurtHero:vi.fn()}));
vi.mock('./villages',()=>({inVillage:()=>false}));
vi.mock('./kit',()=>({selectedBuilding:()=>null,pick:vi.fn()}));
vi.mock('./travel',()=>({homeGate:()=>null,travelTo:vi.fn()}));
vi.mock('./companions',()=>({lendCompanion:()=>null,returnCompanion:vi.fn()}));
vi.mock('./babusia',()=>({giveItem:(ctx:Ctx,id:'babusia_pie',n:number)=>{ctx.save.inv[id]=(ctx.save.inv[id]??0)+n;}}));

const contexts:Ctx[]=[];
function context(): Ctx {
  const actions=new Set<string>();
  const heroes=new Map(HERO_ORDER.map(id=> {
    const body=makeBody(0.3,1.45); body.pos.set(40,3.001,40);
    return [id,{id,body,get pos(){return body.pos;},yaw:0,invulnerable:0,model:{root:new THREE.Group(),play:vi.fn(),update:vi.fn()},syncModel:vi.fn()}] as const;
  }));
  const ctx={scene:new THREE.Scene(),heroes,player:heroes.get('lyosha'),playing:true,sleeping:false,napping:false,boss:null,house:null,monsters:[],params:{tornado:null},save:freshSave(),effects:{ring:vi.fn(),sparkle:vi.fn()},hud:{setCarried:vi.fn()},input:{moveX:0,moveY:0,taps:[],pendingHero:null,take:(a:string)=>{const had=actions.has(a);actions.delete(a);return had;},press:(a:string)=>actions.add(a),clearPresses:()=>actions.clear()},world:{groundHeight:()=>3,getBlock:()=>B.GRASS,isWater:()=>false,isSolid:()=>false,castles:()=>[]}} as unknown as Ctx;
  contexts.push(ctx); initTornadoes(ctx); return ctx;
}
const state=()=> (window as unknown as {__kotoTornadoes:{state:{riding:boolean;blue:number[]|null;fire:number[]|null}}}).__kotoTornadoes.state;
beforeEach(()=> {vi.clearAllMocks();vi.stubGlobal('window',{});});
afterEach(()=> {for(const ctx of contexts.splice(0)) disposeTornadoes(ctx);vi.unstubAllGlobals();});

describe('two winds in the game',()=> {
  it('the normal carried-item action recalls one persistent wind without consuming its tool',()=> {
    const ctx=context();ctx.portraits={items:{wind_whistle:'test-whistle'}} as Ctx['portraits'];ctx.save.inv.wind_whistle=1;initEffects(ctx);
    expect(useItem(ctx,'wind_whistle')).toBe(true);
    expect(ctx.save.inv.wind_whistle).toBe(1);
    expect(state().blue).not.toBeNull();
    const objects=ctx.scene.children.length;
    for(let i=0;i<5;i++) { updateTornadoes(ctx,2.1,true); expect(useItem(ctx,'wind_whistle')).toBe(true); }
    expect(ctx.scene.children.length).toBe(objects);
    expect(ctx.save.inv.wind_whistle).toBe(1);
  });
  it('carries all heroes with the joystick and gives only one gift per day, including after reload',()=> {
    const ctx=context();expect(summonBlueWind(ctx)).toBe(true);expect(boardWind(ctx)).toBe(true);
    const before=ctx.player.pos.x;ctx.input.moveX=1;
    updateTornadoes(ctx,0.05,true);
    expect(ctx.napping).toBe(true);
    expect(ctx.player.pos.x).toBeGreaterThan(before);
    for(const h of ctx.heroes.values()) expect(h.pos.y).toBeGreaterThan(4);
    expect(landWind(ctx)).toBe(true);
    expect(ctx.napping).toBe(false);expect(ctx.save.inv.babusia_pie).toBe(1);
    expect(boardWind(ctx)).toBe(true);expect(landWind(ctx)).toBe(true);
    expect(ctx.save.inv.babusia_pie).toBe(1);
    ctx.save.day=1;expect(boardWind(ctx)).toBe(true);expect(landWind(ctx)).toBe(true);
    expect(ctx.save.inv.babusia_pie).toBe(2);
    const reloaded=context(); reloaded.save=migrate(JSON.parse(JSON.stringify(ctx.save)));
    expect(summonBlueWind(reloaded)).toBe(true);expect(boardWind(reloaded)).toBe(true);expect(landWind(reloaded)).toBe(true);
    expect(reloaded.save.inv.babusia_pie).toBe(2);
  });
  it('does not release the party into water or a newly blocked landing',()=> {
    const ctx=context();summonBlueWind(ctx);boardWind(ctx);
    ctx.world.isWater=()=>true;
    expect(landWind(ctx)).toBe(false);
    expect(state().riding).toBe(true);expect(ctx.napping).toBe(true);
    ctx.world.isWater=()=>false;
    ctx.input.press('jump'); updateTornadoes(ctx,0.05,true);
    expect(state().riding).toBe(false);expect(ctx.napping).toBe(false);
  });
  it('protects the full home boundary and retracts a fire wind if a safe zone moves onto it',()=> {
    const ctx=context();ctx.house={centre:new THREE.Vector3(0,3,0)} as Ctx['house'];
    expect(spawnFireWind(ctx,17,0)).toBe(false);
    expect(spawnFireWind(ctx,30,0)).toBe(true);
    expect(spawnFireWind(ctx,35,0)).toBe(false);
    ctx.house!.centre.set(30,3,0);updateTornadoes(ctx,0.1,true);
    expect(state().fire).toBeNull();expect(hurtHero).not.toHaveBeenCalled();
  });
  it('warns before contact, then damages through the normal credited combat path at a bounded rate',()=> {
    const ctx=context();ctx.player.pos.set(28,3.001,0);
    const target={alive:true,state:'chase',card:{},pos:new THREE.Vector3(30,3,0)};
    const dancer={...target,state:'dance'};
    const armoured={...target,card:{armor:'bolt'}};
    ctx.monsters=[target,dancer,armoured] as Ctx['monsters'];
    expect(spawnFireWind(ctx,30,0)).toBe(true);
    updateTornadoes(ctx,1,true);expect(damageMonster).not.toHaveBeenCalled();expect(hurtHero).not.toHaveBeenCalled();
    updateTornadoes(ctx,2,true);
    expect(damageMonster).toHaveBeenCalledTimes(1);
    expect(vi.mocked(damageMonster).mock.calls[0][1]).toBe(target);
    expect(vi.mocked(damageMonster).mock.calls[0][4]).toBe(ctx.player);
    expect(hurtHero).toHaveBeenCalledTimes(1);
    updateTornadoes(ctx,0.05,true);expect(damageMonster).toHaveBeenCalledTimes(1);
  });
  it('does not farm background monsters when the child is far away',()=> {
    const ctx=context();ctx.player.pos.set(50,3,0);
    ctx.monsters=[{alive:true,state:'chase',card:{},pos:new THREE.Vector3(30,3,0)}] as Ctx['monsters'];
    spawnFireWind(ctx,30,0);updateTornadoes(ctx,3,true);
    expect(damageMonster).not.toHaveBeenCalled();
  });
});
