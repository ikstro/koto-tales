import * as THREE from 'three';
import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { TORNADO } from '../content/tornadoes';
import { inSafeRing } from '../content/babusia';
import { COMPANIONS } from '../content/companions';
import { taleById } from '../content/tales';
import { createTornadoLook, type TornadoLook } from '../render/tornado';
import { tappedAt } from '../ui/worldTap';
import { voice } from '../voice/voice';
import { sfx } from '../voice/sfx';
import { damageMonster, hurtHero } from './combat';
import { giveItem } from './babusia';
import { inVillage } from './villages';
import { selectedBuilding, pick } from './kit';
import { lendCompanion, returnCompanion } from './companions';
import { findWindLanding, windLandingAt, WIND_SEATS, windCanHit, type WindLanding } from './tornadoRules';

interface Wind {
  look: TornadoLook;
  pos: THREE.Vector3;
  active: boolean;
  age: number;
}
type Passenger = { id: string; walker: NonNullable<ReturnType<typeof lendCompanion>> };
interface State {
  fire: Wind;
  blue: Wind;
  time: number;
  started: boolean;
  riding: boolean;
  recallAt: number;
  nextFire: number;
  fireStep: number;
  fireHit: number;
  engaged: number;
  landingAt: number;
  hintAt: number;
  lastLanding: WindLanding | null;
  passengers: Passenger[];
  tale: string | null;
  off: (()=>void)[];
}
const states = new WeakMap<Ctx, State>();
const dir = new THREE.Vector3();
const tap = new THREE.Vector3();

/** Safe areas include the whole vortex radius, rather than only its centre. */
export function fireProtected(ctx: Ctx, x: number, z: number): boolean {
  const margin=TORNADO.fire.reach+1;
  if(ctx.house && Math.hypot(x-ctx.house.centre.x,z-ctx.house.centre.z)<15+margin) return true;
  if(inSafeRing(ctx.save.babusia,x,z,margin) || ctx.boss?.inZone(x,z,margin)) return true;
  return inVillage(ctx,x,z,margin);
}

function landingAllowed(ctx: Ctx, x: number, z: number): boolean {
  if(ctx.boss?.inZone(x,z,3)) return false;
  // A ride must not bypass a castle's gated stairs or its reward chest.
  return !(ctx.world.castles?.() ?? []).some(c => !ctx.save.castles[c.race]?.freed && Math.hypot(c.x-x,c.z-z)<25);
}

function landing(ctx: Ctx, x: number, z: number): WindLanding | null {
  return findWindLanding(ctx.world,x,z,(px,pz)=>landingAllowed(ctx,px,pz));
}

/** Made before the title: exactly two persistent looks, never allocated on summon. */
export function initTornadoes(ctx: Ctx): void {
  if(states.has(ctx)) return;
  const wind=(kind:'fire'|'blue'):Wind => {
    const look=createTornadoLook(kind);
    look.root.visible=false;
    ctx.scene.add(look.root);
    return {look,pos:new THREE.Vector3(),active:false,age:0};
  };
  const s:State={fire:wind('fire'),blue:wind('blue'),time:0,started:false,riding:false,recallAt:0,nextFire:TORNADO.fire.spawnEvery,fireStep:0,fireHit:0,engaged:0,landingAt:0,hintAt:0,lastLanding:null,passengers:[],tale:null,off:[]};
  states.set(ctx,s);
  s.off.push(events.on('effect:start', ({kind}) => { if(kind==='wind') summonBlueWind(ctx); }));
  s.off.push(events.on('hero:teleport', () => release(ctx,s)));
  // Closing during a ride starts safely at home next time: only the daily gift is saved.
  (window as unknown as {__kotoTornadoes:object}).__kotoTornadoes={
    summon:()=>summonBlueWind(ctx),
    fire:(x?:number,z?:number)=>spawnFireWind(ctx,x,z),
    board:()=>boardWind(ctx),
    land:()=>landWind(ctx),
    get state() { return {riding:s.riding,fire:s.fire.active?s.fire.pos.toArray():null,blue:s.blue.active?s.blue.pos.toArray():null,fireAge:s.fire.age,giftDay:ctx.save.wind.giftDay,time:s.time}; },
  };
}

export function disposeTornadoes(ctx: Ctx): void {
  const s=states.get(ctx);
  if(!s) return;
  release(ctx,s);
  s.off.forEach(off=>off());
  s.fire.look.dispose();
  s.blue.look.dispose();
  states.delete(ctx);
}

export function summonBlueWind(ctx: Ctx): boolean {
  const s=states.get(ctx);
  if(!s || !ctx.playing || ctx.sleeping || ctx.napping || s.riding || s.time<s.recallAt) return false;
  s.recallAt=s.time+TORNADO.blue.recallEvery;
  const p=ctx.player.pos;
  const at=landing(ctx,p.x+Math.cos(ctx.player.yaw)*3.5,p.z-Math.sin(ctx.player.yaw)*3.5);
  if(!at) { voice.say('tornado_land',{priority:5}); return false; }
  s.blue.pos.set(at[0].x,at[0].y,at[0].z);
  s.blue.active=true;
  s.blue.age=0;
  s.lastLanding=at;
  ctx.effects.ring(s.blue.pos,0x43bfff,2.2);
  sfx.play('switch',{pitch:1.3,volume:0.6});
  voice.say('tornado_blue_spot',{priority:5});
  return true;
}

/** The optional point is for authored tales and reproducible checks; safe rules still apply. */
export function spawnFireWind(ctx: Ctx, x?:number,z?:number): boolean {
  const s=states.get(ctx);
  if(!s || !ctx.playing || ctx.sleeping || ctx.napping || s.fire.active) return false;
  const p=ctx.player.pos;
  const tries: [number,number][]=[];
  if(x!==undefined && z!==undefined) tries.push([x,z]);
  else for(const r of [16,25,35]) for(let i=0;i<8;i++) {
    const a=ctx.player.yaw+i*Math.PI/4;
    tries.push([p.x+Math.sin(a)*r,p.z+Math.cos(a)*r]);
  }
  for(const [px,pz] of tries) {
    if(fireProtected(ctx,px,pz)) continue;
    const at=windLandingAt(ctx.world,px,pz);
    if(!at) continue;
    s.fire.pos.set(px,at[0].y,pz);
    s.fire.age=0; s.fire.active=true; s.fireStep=0; s.fireHit=0; s.engaged=0;
    ctx.effects.ring(s.fire.pos,0xff7722,3);
    voice.say('tornado_fire_spot',{priority:8});
    sfx.play('rumble',{volume:0.35,pitch:1.25});
    return true;
  }
  return false;
}

export function boardWind(ctx: Ctx): boolean {
  const s=states.get(ctx);
  if(!s?.blue.active || s.riding || ctx.sleeping || ctx.napping || selectedBuilding() || ctx.player.pos.distanceTo(s.blue.pos)>TORNADO.blue.boardReach) return false;
  const at=landing(ctx,ctx.player.pos.x,ctx.player.pos.z);
  if(!at) return false;
  s.lastLanding=at;
  s.riding=true;
  ctx.napping=true;
  pick(ctx,null);
  for(const id of ctx.save.companions) {
    if(COMPANIONS[id]?.guards) continue; // Сірко keeps his post/errand.
    const walker=lendCompanion(id);
    if(walker) s.passengers.push({id,walker});
  }
  s.blue.pos.copy(ctx.player.pos);
  s.blue.pos.z-=TORNADO.blue.front;
  s.landingAt=s.time+TORNADO.blue.landingEvery;
  ctx.input.clearPresses();
  voice.say('tornado_ride',{priority:7});
  sfx.play('jump',{pitch:1.3});
  return true;
}

function release(ctx: Ctx,s:State): void {
  if(!s.riding) return;
  s.riding=false;
  ctx.napping=false;
  for(const {id} of s.passengers) returnCompanion(id);
  s.passengers=[];
}

export function landWind(ctx: Ctx): boolean {
  const s=states.get(ctx);
  if(!s?.riding) return false;
  // First try the current shore, then a previously checked place (revalidate, buildings can change).
  let at=landing(ctx,s.blue.pos.x,s.blue.pos.z+TORNADO.blue.front);
  if(!at && s.lastLanding) at=windLandingAt(ctx.world,s.lastLanding[0].x,s.lastLanding[0].z,(x,z)=>landingAllowed(ctx,x,z));
  if(!at) {
    if(s.time>s.hintAt) { voice.say('tornado_land',{priority:7}); s.hintAt=s.time+5; }
    return false;
  }
  const distant=Math.hypot(at[0].x-s.blue.pos.x,at[0].z-s.blue.pos.z)>12;
  // Never jump a long distance into unloaded land: keep flying towards a shore instead.
  if(distant) { voice.say('tornado_land',{priority:7}); return false; }
  const heroes=[ctx.player,...[...ctx.heroes.values()].filter(h=>h!==ctx.player)];
  heroes.forEach((h,i)=> {
    h.pos.set(at![i].x,at![i].y,at![i].z);
    h.body.vel.set(0,0,0); h.body.onGround=true; h.body.inWater=false;
    h.invulnerable=Math.max(h.invulnerable,2); h.model.play('idle'); h.syncModel(0);
  });
  for(const {walker} of s.passengers) {
    walker.body.pos.copy(ctx.player.pos); walker.body.vel.set(0,0,0);
    walker.model.root.position.copy(walker.body.pos);
  }
  release(ctx,s);
  s.blue.pos.copy(ctx.player.pos).add(new THREE.Vector3(2.8,0,0));
  s.lastLanding=at;
  // The camera snaps only for a searched landing some blocks away, never rotates or zooms.
  events.emit('hero:teleport',{});
  ctx.effects.ring(ctx.player.pos,0x43bfff,2.5);
  if(ctx.save.wind.giftDay<ctx.save.day) {
    ctx.save.wind.giftDay=ctx.save.day; // Write the guard before delivering anything.
    giveItem(ctx,'babusia_pie',1);
    voice.say('tornado_gift',{priority:6});
    ctx.effects.sparkle(ctx.player.pos,0x43bfff);
  }
  return true;
}

function moveParty(ctx:Ctx,s:State,dt:number):void {
  if(ctx.sleeping) { release(ctx,s); return; }
  if(ctx.input.take('jump') && landWind(ctx)) return;
  const b=s.blue;
  const nx=b.pos.x+ctx.input.moveX*TORNADO.blue.speed*dt;
  const nz=b.pos.z+ctx.input.moveY*TORNADO.blue.speed*dt;
  // Keep flights out of locked castles/boss arenas as well as landing there.
  if(landingAllowed(ctx,nx,nz)) { b.pos.x=nx; b.pos.z=nz; }
  let top=0;
  for(const [dx,dz] of WIND_SEATS) top=Math.max(top,ctx.world.groundHeight(Math.floor(b.pos.x+dx),Math.floor(b.pos.z+dz+TORNADO.blue.front)));
  // Rise before crossing a tall object; come down gently after it.
  const y=top+TORNADO.blue.clearance;
  b.pos.y=y>b.pos.y?y:THREE.MathUtils.lerp(b.pos.y,y,1-Math.exp(-dt*3));
  const heroes=[ctx.player,...[...ctx.heroes.values()].filter(h=>h!==ctx.player)];
  heroes.forEach((h,i)=> {
    const [dx,dz]=WIND_SEATS[i];
    h.pos.set(b.pos.x+dx,b.pos.y+0.12*Math.sin(s.time*2+i),b.pos.z+dz+TORNADO.blue.front);
    h.body.vel.set(0,0,0); h.body.inWater=false; h.body.onGround=false;
    h.model.play('idle'); h.syncModel(dt);
  });
  s.passengers.forEach(({walker},i)=> {
    const a=i*2.399;
    walker.body.pos.set(b.pos.x+Math.cos(a)*1.5,b.pos.y,b.pos.z+Math.sin(a)*1.5+TORNADO.blue.front);
    walker.body.vel.set(0,0,0); walker.model.root.position.copy(walker.body.pos); walker.model.update(dt,0);
  });
  if(s.time>=s.landingAt) {
    s.landingAt=s.time+TORNADO.blue.landingEvery;
    const at=windLandingAt(ctx.world,b.pos.x,b.pos.z+TORNADO.blue.front,(x,z)=>landingAllowed(ctx,x,z));
    if(at) s.lastLanding=at;
  }
  ctx.input.pendingHero=null;
  ctx.input.clearPresses(); // No building, shooting or contextual action while carried.
}

function fireStep(ctx:Ctx,s:State,dt:number):void {
  const f=s.fire, rule=TORNADO.fire;
  if(!f.active) return;
  f.age+=dt;
  const p=ctx.player.pos, d=Math.hypot(p.x-f.pos.x,p.z-f.pos.z);
  if(f.age>rule.life || d>rule.maxDistance || fireProtected(ctx,f.pos.x,f.pos.z)) { f.active=false; return; }
  if(f.age<rule.warn) return;
  s.engaged=Math.max(0,s.engaged-dt);
  if(d<9 && !fireProtected(ctx,p.x,p.z)) s.engaged=8;
  s.fireStep+=dt;
  if(s.fireStep>=0.1) {
    const step=Math.min(s.fireStep,0.2); s.fireStep=0;
    const chase=(f.age-rule.warn)%(rule.chaseFor+rule.restFor)<rule.chaseFor && d<24 && !fireProtected(ctx,p.x,p.z);
    const angle=chase?Math.atan2(p.x-f.pos.x,p.z-f.pos.z):s.time*0.42;
    const x=f.pos.x+Math.sin(angle)*rule.speed*step, z=f.pos.z+Math.cos(angle)*rule.speed*step;
    if(!fireProtected(ctx,x,z)) {
      const at=windLandingAt(ctx.world,x,z);
      if(at && Math.abs(at[0].y-f.pos.y)<1.1) f.pos.set(x,at[0].y,z);
    }
  }
  s.fireHit-=dt;
  if(s.fireHit>0) return;
  s.fireHit=rule.hitEvery;
  for(const hero of ctx.heroes.values()) if(Math.hypot(hero.pos.x-f.pos.x,hero.pos.z-f.pos.z)<rule.reach && Math.abs(hero.pos.y-f.pos.y)<2.5) hurtHero(ctx,hero,1,f.pos);
  if(s.engaged<=0) return; // Unseen background encounters never farm quests/coins.
  for(const m of ctx.monsters) if(windCanHit(m) && Math.hypot(m.pos.x-f.pos.x,m.pos.z-f.pos.z)<rule.reach && Math.abs(m.pos.y-f.pos.y)<3) {
    dir.subVectors(m.pos,f.pos).setY(0);
    if(dir.lengthSq()<0.001) dir.set(1,0,0); else dir.normalize();
    damageMonster(ctx,m,rule.damage,dir,ctx.player);
  }
}

/** Called only on unpaused game frames. Heavy contacts run at most ten times a second. */
export function updateTornadoes(ctx:Ctx,dt:number,low:boolean):void {
  const s=states.get(ctx);
  if(!s || !ctx.playing) return;
  s.time+=dt;
  if(!s.started) {
    s.started=true;
    const mode=ctx.params.tornado;
    if(mode==='fire'||mode==='both') {
      const p=ctx.player.pos;
      if(!spawnFireWind(ctx,p.x-4.5,p.z-1)) spawnFireWind(ctx);
    }
    if(mode==='blue'||mode==='both') summonBlueWind(ctx);
  }
  const cur=ctx.save.tales.cur;
  if(cur!==s.tale) {
    s.tale=cur;
    const wind=taleById(cur)?.wind;
    if(wind==='blue') summonBlueWind(ctx);
    if(wind==='fire') spawnFireWind(ctx);
  }
  if(s.riding) moveParty(ctx,s,dt);
  else if(!ctx.sleeping && !ctx.napping) {
    const b=s.blue;
    if(b.active && b.pos.distanceTo(ctx.player.pos)>55) b.active=false;
    if(b.active && ctx.player.pos.distanceTo(b.pos)<TORNADO.blue.boardReach && tappedAt(ctx,tap.copy(b.pos).setY(b.pos.y+1.6),1.2)) boardWind(ctx);
    if(taleById(cur)?.wind==='blue' && !b.active) summonBlueWind(ctx);
    fireStep(ctx,s,dt);
    s.nextFire-=dt;
    if(s.nextFire<=0) {
      s.nextFire=TORNADO.fire.spawnEvery;
      if(ctx.save.tales.done.includes('fish') && !fireProtected(ctx,ctx.player.pos.x,ctx.player.pos.z)) spawnFireWind(ctx);
    }
  }
  for(const w of [s.fire,s.blue]) {
    if(w===s.blue && w.active) w.age+=dt;
    w.look.root.visible=w.active;
    if(!w.active) continue;
    w.look.root.position.copy(w.pos);
    w.look.draw(s.time,low,w===s.fire?Math.min(1,0.35+w.age/TORNADO.fire.warn*0.65):Math.min(1,w.age*2));
  }
}
