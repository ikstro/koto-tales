import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from '../core/ctx';
import type { Monster } from '../actors/entities';
import { events } from '../core/events';
import { freshSave } from './save';
import { damageMonster } from './combat';
import { dropCoins } from './pickups';
import { runWave, type Wave, type WaveRule } from './tasks';

vi.mock('../voice/sfx',()=>({sfx:{play:vi.fn()}}));
vi.mock('../voice/voice',()=>({voice:{say:vi.fn()}}));
vi.mock('./pickups',()=>({dropCoins:vi.fn(),dropHeart:vi.fn()}));
vi.mock('./heroes',()=>({sendHome:vi.fn()}));
vi.mock('./kit',()=>({playingSpeakers:()=>[]}));
vi.mock('./monsters',()=>({spawnAt:vi.fn()}));

function fixture() {
  const ctx={save:freshSave(),scene:new THREE.Scene(),player:{id:'lyosha',hearts:5,pos:new THREE.Vector3(100,3,100)},monsters:[],effects:{poof:vi.fn(),sparkle:vi.fn(),coinBurst:vi.fn()}} as unknown as Ctx;
  const m={kind:'zombie',alive:true,hp:2,card:{color:0x00ff00,coins:[2,2]},pos:new THREE.Vector3(0,3,0),body:{height:2,vel:new THREE.Vector3()},model:{root:new THREE.Group(),play:vi.fn(),dispose:vi.fn()}} as unknown as Monster;
  ctx.monsters.push(m);ctx.scene.add(m.model.root);
  return {ctx,m};
}
beforeEach(()=>vi.clearAllMocks());
describe('wind defeat attribution',()=> {
  it('an unseen collision removes the monster without money, discovery, counters or defeat events',()=> {
    const {ctx,m}=fixture(), event=vi.fn(),off=events.on('monster:defeated',event);
    try {
      damageMonster(ctx,m,2,new THREE.Vector3(1,0,0),null);
      expect(m.alive).toBe(false);expect(m.defeatCredited).toBe(false);
      expect(m.model.dispose).toHaveBeenCalledOnce();expect(ctx.scene.children).not.toContain(m.model.root);
      expect(ctx.save.defeated).toEqual({});expect(ctx.save.found).not.toContain('m:zombie');
      expect(dropCoins).not.toHaveBeenCalled();expect(event).not.toHaveBeenCalled();
    } finally { off(); }
  });
  it('a monster the hero hit earlier gives normal rewards when wind finishes it',()=> {
    const {ctx,m}=fixture(), event=vi.fn(),off=events.on('monster:defeated',event);
    try {
      damageMonster(ctx,m,1,new THREE.Vector3(1,0,0),ctx.player);
      damageMonster(ctx,m,1,new THREE.Vector3(1,0,0),null);
      expect(m.alive).toBe(false);expect(m.defeatCredited).toBe(true);
      expect(ctx.save.defeated.zombie).toBe(1);expect(ctx.save.found).toContain('m:zombie');
      expect(dropCoins).toHaveBeenCalledOnce();expect(event).toHaveBeenCalledWith({kind:'zombie',first:true,by:'lyosha'});
    } finally { off(); }
  });
  it('background deaths do not silently complete defence waves; participated victories do',()=> {
    for(const credited of [false,true]) {
      const {ctx,m}=fixture();m.alive=false;m.hp=0;m.defeatCredited=credited;
      const wave:Wave={wave:new Set([m]),waveT:0};
      const rule={near:20} as WaveRule;
      expect(runWave(ctx,wave,new THREE.Vector3(),1,rule,0.05)).toBe(credited?1:0);
      expect(wave.wave.size).toBe(0);
    }
  });
});
