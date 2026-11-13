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
import { setMapMarker } from '../ui/map';

vi.mock('../voice/sfx',()=>({sfx:{play:vi.fn()}}));
vi.mock('../voice/voice',()=>({voice:{say:vi.fn()}}));
vi.mock('./combat',()=>({damageMonster:vi.fn(),hurtHero:vi.fn()}));
vi.mock('../ui/map',()=>({setMapMarker:vi.fn()}));
vi.mock('./villages',()=>({inVillage:()=>false}));
vi.mock('./kit',()=>({selectedBuilding:()=>null,pick:vi.fn()}));
vi.mock('./travel',()=>({homeGate:()=>null,travelTo:vi.fn()}));
vi.mock('./companions',()=>({lendCompanion:()=>null,returnCompanion:vi.fn()}));
vi.mock('./babusia',()=>({giveItem:(ctx:Ctx,id:'babusia_pie',n:number)=>{ctx.save.inv[id]=(ctx.save.inv[id]??0)+n;}}));

const contexts:Ctx[]=[];
function context(): Ctx {
  const actions=new Set<string>();
  const heroes=new Map(HERO_ORDER.map(id=> {
    const body=makeBody(0.3,1.45); body.pos.set(40,3.001,40); body.onGround=true;
    return [id,{id,body,get pos(){return body.pos;},yaw:0,invulnerable:0,model:{root:new THREE.Group(),play:vi.fn(),update:vi.fn()},syncModel:vi.fn()}] as const;
  }));
  const ctx={scene:new THREE.Scene(),heroes,player:heroes.get('lyosha'),playing:true,sleeping:false,napping:false,boss:null,house:null,monsters:[],params:{tornado:null},save:freshSave(),effects:{ring:vi.fn(),sparkle:vi.fn()},hud:{setCarried:vi.fn(),setWindCharge:vi.fn(),setWindBoard:vi.fn()},input:{moveX:0,moveY:0,taps:[],pendingHero:null,take:(a:string)=>{const had=actions.has(a);actions.delete(a);return had;},press:(a:string)=>actions.add(a),clearPresses:()=>actions.clear()},world:{groundHeight:()=>3,getBlock:()=>B.GRASS,isWater:()=>false,isSolid:()=>false,castles:()=>[]}} as unknown as Ctx;
  contexts.push(ctx); initTornadoes(ctx); return ctx;
}
const state=()=> (window as unknown as {__kotoTornadoes:{state:{riding:boolean;returning:boolean;fuel:number;fireAge:number;nextFire:number;blue:number[]|null;fire:number[]|null}}}).__kotoTornadoes.state;
const advance=(ctx:Ctx,seconds:number)=>{for(let t=0;t<seconds-1e-8;t+=0.05) updateTornadoes(ctx,Math.min(0.05,seconds-t),true);};
const land=(ctx:Ctx)=>{const accepted=landWind(ctx);advance(ctx,2);return accepted;};
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
    advance(ctx,1);
    expect(ctx.napping).toBe(true);
    expect(ctx.player.pos.x).toBeGreaterThan(before);
    for(const h of ctx.heroes.values()) expect(h.pos.y).toBeGreaterThan(4);
    ctx.input.moveX=0;expect(land(ctx)).toBe(true);
    expect(ctx.napping).toBe(false);expect(ctx.save.inv.babusia_pie).toBe(1);
    expect(boardWind(ctx)).toBe(true);expect(land(ctx)).toBe(true);
    expect(ctx.save.inv.babusia_pie).toBe(1);
    ctx.save.day=1;expect(boardWind(ctx)).toBe(true);expect(land(ctx)).toBe(true);
    expect(ctx.save.inv.babusia_pie).toBe(2);
    const reloaded=context(); reloaded.save=migrate(JSON.parse(JSON.stringify(ctx.save)));
    expect(summonBlueWind(reloaded)).toBe(true);expect(boardWind(reloaded)).toBe(true);expect(land(reloaded)).toBe(true);
    expect(reloaded.save.inv.babusia_pie).toBe(2);
  });
  it('offers a nearby whistle button and boards onto the wind pad even if the hero stands on rough ground',()=> {
    const ctx=context();summonBlueWind(ctx);updateTornadoes(ctx,0.05,true);
    expect(ctx.hud.setWindBoard).toHaveBeenLastCalledWith(true);
    // The child is next to the wind, but the ground under the child cannot seat four heroes.
    ctx.world.isSolid=(x)=>x<42;
    ctx.input.press('wind:board');updateTornadoes(ctx,0.05,true);
    expect(state().riding).toBe(true);expect(ctx.hud.setWindBoard).toHaveBeenLastCalledWith(false);
  });
  it('shows no boarding button when far away or while another scene holds the party',()=> {
    const ctx=context();summonBlueWind(ctx);ctx.player.pos.x+=12;ctx.input.press('wind:board');updateTornadoes(ctx,0.05,true);
    expect(ctx.hud.setWindBoard).toHaveBeenLastCalledWith(false);
    ctx.player.pos.x-=12;ctx.napping=true;updateTornadoes(ctx,0.05,true);
    expect(ctx.hud.setWindBoard).toHaveBeenLastCalledWith(false);
    ctx.napping=false;updateTornadoes(ctx,0.05,true);expect(state().riding).toBe(false);
  });
  it('does not release the party into water or a newly blocked landing',()=> {
    const ctx=context();summonBlueWind(ctx);boardWind(ctx);
    ctx.world.isWater=()=>true;
    expect(landWind(ctx)).toBe(false);
    expect(state().riding).toBe(true);expect(ctx.napping).toBe(true);
    ctx.world.isWater=()=>false;
    ctx.input.press('jump'); advance(ctx,2);
    expect(state().riding).toBe(false);expect(ctx.napping).toBe(false);
  });
  it('protects the full home boundary and retracts a fire wind if a safe zone moves onto it',()=> {
    const ctx=context();ctx.house={centre:new THREE.Vector3(0,3,0)} as Ctx['house'];
    expect(spawnFireWind(ctx,17,0)).toBe(false);
    expect(spawnFireWind(ctx,30,0)).toBe(true);
    expect(setMapMarker).toHaveBeenCalledWith('wind:fire',expect.objectContaining({icon:'map-fire-wind',pointer:true}));
    expect(spawnFireWind(ctx,35,0)).toBe(false);
    ctx.house!.centre.set(30,3,0);updateTornadoes(ctx,0.1,true);
    expect(state().fire).toBeNull();expect(hurtHero).not.toHaveBeenCalled();
    expect(setMapMarker).toHaveBeenLastCalledWith('wind:fire',null);
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
    expect(damageMonster).toHaveBeenCalledTimes(1);
    expect(vi.mocked(damageMonster).mock.calls[0][4]).toBeNull();
  });
  it('flies above crowns at three times running speed, spends distance not hovering, and recharges only on ground',()=> {
    const ctx=context();summonBlueWind(ctx);boardWind(ctx);
    advance(ctx,1);const fuel=ctx.save.wind.fuel;
    expect(ctx.player.pos.y).toBeGreaterThan(11.8);
    advance(ctx,2);expect(ctx.save.wind.fuel).toBe(fuel);
    const x=ctx.player.pos.x;ctx.input.moveX=1;advance(ctx,2);ctx.input.moveX=0;
    expect(ctx.player.pos.x-x).toBeCloseTo(30,5);
    expect(ctx.save.wind.fuel).toBeCloseTo(fuel-30,5);
    ctx.world.groundHeight=()=>14;advance(ctx,1);
    expect(ctx.player.pos.y).toBeGreaterThan(22.8);
    ctx.world.groundHeight=()=>3;land(ctx);
    const spent=ctx.save.wind.fuel;expect(spent).toBeLessThan(300);
    ctx.player.body.onGround=false;advance(ctx,1);expect(ctx.save.wind.fuel).toBe(spent);
    ctx.player.body.onGround=true;advance(ctx,1);expect(ctx.save.wind.fuel).toBeCloseTo(spent+10,5);
    advance(ctx,30);expect(ctx.save.wind.fuel).toBe(300);
  });
  it('returns along its flown path from a large lake and lands with fuel left',()=> {
    const ctx=context();ctx.world.isWater=(x)=>x>44;
    summonBlueWind(ctx);boardWind(ctx);ctx.input.moveX=1;
    let turned=false;
    for(let i=0;i<900 && state().riding;i++) {
      updateTornadoes(ctx,0.05,true);turned ||= state().returning;
      expect(ctx.save.wind.fuel).toBeGreaterThan(0);
    }
    expect(turned).toBe(true);expect(state().riding).toBe(false);
    expect(ctx.player.pos.x).toBeLessThanOrEqual(44);
    expect(ctx.player.body.onGround).toBe(true);expect(ctx.napping).toBe(false);
  });
  it('lands automatically on dry ground when empty and does not refill on recall or reload',()=> {
    const ctx=context();ctx.save.wind.fuel=55;summonBlueWind(ctx);boardWind(ctx);
    ctx.input.moveX=1;advance(ctx,4);ctx.input.moveX=0;
    expect(state().riding).toBe(false);
    ctx.save.wind.fuel=10;summonBlueWind(ctx);
    expect(boardWind(ctx)).toBe(false);expect(ctx.save.wind.fuel).toBe(10);
    const reloaded=context();reloaded.save=migrate(JSON.parse(JSON.stringify(ctx.save)));
    summonBlueWind(reloaded);expect(boardWind(reloaded)).toBe(false);expect(reloaded.save.wind.fuel).toBe(10);
  });
  it('a landing request over deep water starts a controlled return instead of a distant jump',()=> {
    const ctx=context();ctx.world.isWater=(x)=>x>44;
    summonBlueWind(ctx);boardWind(ctx);ctx.input.moveX=1;advance(ctx,3);ctx.input.moveX=0;
    const before=ctx.player.pos.x;
    expect(landWind(ctx)).toBe(false);expect(state().returning).toBe(true);
    updateTornadoes(ctx,0.05,true);
    expect(before-ctx.player.pos.x).toBeLessThanOrEqual(0.751);
    advance(ctx,6);
    expect(state().riding).toBe(false);expect(ctx.player.pos.x).toBeLessThanOrEqual(44);
  });
  it('keeps the fire wind moving and damaging monsters below a high blue flight',()=> {
    const ctx=context();ctx.player.pos.set(40,3,40);
    spawnFireWind(ctx,43,40);summonBlueWind(ctx);boardWind(ctx);advance(ctx,1);
    const before=state().fire!;
    const monster={alive:true,state:'chase',card:{},pos:new THREE.Vector3(...before)};
    ctx.monsters=[monster] as Ctx['monsters'];advance(ctx,2);
    expect(state().fireAge).toBeGreaterThan(2.9);
    expect(state().fire).not.toEqual(before);
    expect(damageMonster).toHaveBeenCalled();
    expect(vi.mocked(damageMonster).mock.calls.at(-1)![4]).toBeNull();
    expect(hurtHero).not.toHaveBeenCalled();
  });
  it('randomises encounter delays and only counts down while travelling',()=> {
    vi.spyOn(Math,'random').mockReturnValue(0.25);
    const ctx=context();const first=state().nextFire;expect(first).toBe(92.5);
    advance(ctx,2);expect(state().nextFire).toBe(first);
    ctx.input.moveX=1;advance(ctx,1);expect(state().nextFire).toBeCloseTo(first-1);
    vi.restoreAllMocks();
  });
  it('keeps walking already accumulated when an old saved game is closed and resumed',()=> {
    vi.spyOn(Math,'random').mockReturnValue(0.25);
    const ctx=context();ctx.save.tales.done.push('fish');ctx.input.moveX=1;advance(ctx,60);
    expect(ctx.save.wind.fireIn).toBeCloseTo(32.5);
    const saved=migrate(JSON.parse(JSON.stringify(ctx.save)));
    const reloaded=context();disposeTornadoes(reloaded);reloaded.save=saved;initTornadoes(reloaded);
    expect(state().nextFire).toBeCloseTo(32.5);
    reloaded.input.moveX=1;advance(reloaded,33);
    expect(state().fire).not.toBeNull();
    vi.restoreAllMocks();
  });
  it('spawns an encounter ahead of a travelling hero, with a full warning and only one active wind',()=> {
    vi.spyOn(Math,'random').mockReturnValue(0.25);
    const ctx=context();ctx.save.tales.done.push('fish');ctx.input.moveY=1;
    advance(ctx,93);
    const at=state().fire!;
    expect(at).not.toBeNull();expect(at[2]).toBeGreaterThan(ctx.player.pos.z);
    expect(Math.hypot(at[0]-ctx.player.pos.x,at[2]-ctx.player.pos.z)).toBeGreaterThan(11);
    expect(state().fireAge).toBeLessThan(2.5);expect(hurtHero).not.toHaveBeenCalled();
    expect(spawnFireWind(ctx,50,50)).toBe(false);
    vi.restoreAllMocks();
  });
  it('retries a blocked encounter soon, instead of losing the encounter for another long interval',()=> {
    vi.spyOn(Math,'random').mockReturnValue(0.25);
    const ctx=context();ctx.save.tales.done.push('fish');ctx.input.moveY=1;ctx.world.isWater=()=>true;
    advance(ctx,93);expect(state().fire).toBeNull();expect(state().nextFire).toBeLessThanOrEqual(5);
    ctx.world.isWater=()=>false;advance(ctx,5);
    expect(state().fire).not.toBeNull();
    vi.restoreAllMocks();
  });

});
