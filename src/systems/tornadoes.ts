import * as THREE from 'three';
import type { Ctx } from '../core/ctx';
import { events } from '../core/events';
import { TORNADO } from '../content/tornadoes';
import { inSafeRing } from '../content/babusia';
import { COMPANIONS } from '../content/companions';
import { taleById } from '../content/tales';
import { createTornadoLook, type TornadoLook } from '../render/tornado';
import { tappedInBox } from '../ui/worldTap';
import { setMapMarker } from '../ui/map';
import { voice } from '../voice/voice';
import { sfx } from '../voice/sfx';
import { damageMonster, hurtHero } from './combat';
import { giveItem } from './babusia';
import { inVillage } from './villages';
import { selectedBuilding, pick } from './kit';
import { lendCompanion, returnCompanion } from './companions';
import { findWindLanding, windLandingAt, WIND_SEATS, windCanHit, windPrey, fireGroundAt, type WindLanding } from './tornadoRules';

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
  fireSearchAt: number;
  fireSearchTurn: number;
  fireAnnounced: boolean;
  fireStep: number;
  fireHit: number;
  fireHeading: number;
  fireTurnUntil: number;
  firePassUntil: number;
  engaged: number;
  landingAt: number;
  hintAt: number;
  route: { x:number; z:number }[];
  returnDistance: number;
  returning: boolean;
  descent: WindLanding | null;
  passengers: Passenger[];
  tale: string | null;
  off: (()=>void)[];
  decorAt:number;
  decorBreaks:number;
}
const states = new WeakMap<Ctx, State>();
const dir = new THREE.Vector3();
const tapBox = new THREE.Box3();
const FIRE_TURNS=[0,0.6,-0.6,1.2,-1.2,Math.PI/2,-Math.PI/2,2.4,-2.4,Math.PI] as const;

function nearBlue(ctx:Ctx,s:State):boolean {
  const p=ctx.player.pos,b=s.blue.pos;
  return s.blue.active && Math.hypot(p.x-b.x,p.z-b.z)<=TORNADO.blue.boardReach && Math.abs(p.y-b.y)<=8;
}

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
  const s:State={fire:wind('fire'),blue:wind('blue'),time:0,started:false,riding:false,recallAt:0,fireSearchAt:0,fireSearchTurn:0,fireAnnounced:false,fireStep:0,fireHit:0,fireHeading:0,fireTurnUntil:0,firePassUntil:0,engaged:0,landingAt:0,hintAt:0,route:[],returnDistance:0,returning:false,descent:null,passengers:[],tale:null,off:[],decorAt:0,decorBreaks:0};
  states.set(ctx,s);
  setMapMarker('wind:meeting',null); // Remove the obsolete permanent destination on hot reload too.
  s.off.push(events.on('effect:start', ({kind}) => { if(kind==='wind') summonBlueWind(ctx); }));
  s.off.push(events.on('hero:teleport', () => release(ctx,s)));
  // Closing during a ride starts safely at home; the spent fuel remains spent.
  (window as unknown as {__kotoTornadoes:object}).__kotoTornadoes={
    summon:()=>summonBlueWind(ctx),
    fire:(x?:number,z?:number)=>spawnFireWind(ctx,x,z),
    board:()=>boardWind(ctx),
    land:()=>landWind(ctx),
    get state() { return {riding:s.riding,returning:s.returning,landing:!!s.descent,fuel:ctx.save.wind.fuel,returnDistance:s.returnDistance,searchIn:Math.max(0,s.fireSearchAt-s.time),decorBreaks:s.decorBreaks,fire:s.fire.active?s.fire.pos.toArray():null,blue:s.blue.active?s.blue.pos.toArray():null,fireAge:s.fire.age,giftDay:ctx.save.wind.giftDay,time:s.time}; },
  };
}

export function disposeTornadoes(ctx: Ctx): void {
  const s=states.get(ctx);
  if(!s) return;
  release(ctx,s);
  ctx.skin?.disturbDecor?.(null,Infinity,()=>{});
  s.off.forEach(off=>off());
  s.fire.look.dispose();
  s.blue.look.dispose();
  ctx.hud.setWindBoard(false);
  setMapMarker('wind:fire',null);
  setMapMarker('wind:meeting',null);
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
  ctx.effects.ring(s.blue.pos,0x43bfff,2.2);
  sfx.play('switch',{pitch:1.3,volume:0.6});
  voice.say('tornado_blue_spot',{priority:5});
  return true;
}

/** The optional point is for authored tales and reproducible checks; safe rules still apply. */
export function spawnFireWind(ctx: Ctx, x?:number,z?:number): boolean {
  const s=states.get(ctx);
  if(!s || !ctx.playing || ctx.sleeping || (ctx.napping && !s.riding) || s.fire.active) return false;
  const p=ctx.player.pos;
  const tries: [number,number][]=[];
  if(x!==undefined && z!==undefined) tries.push([x,z]);
  else for(let i=0;i<24;i++) {
    const r=12+Math.random()*12;
    const a=ctx.player.yaw+(Math.random()<0.5?-1:1)*(0.35+Math.random()*0.9);
    tries.push([p.x+Math.sin(a)*r,p.z+Math.cos(a)*r]);
  }
  for(const [px,pz] of tries) {
    if(placeFire(ctx,s,px,pz,true)) return true;
  }
  return false;
}

function announceFire(s:State):void {
  s.fireAnnounced=true;
  voice.say('tornado_fire_spot',{priority:8});
  sfx.play('rumble',{volume:0.35,pitch:1.25});
}

/** Validate first, then replace the one existing actor and its ordinary map marker atomically. */
function placeFire(ctx:Ctx,s:State,x:number,z:number,announce:boolean):boolean {
  if(fireProtected(ctx,x,z)) return false;
  const y=fireGroundAt(ctx.world,x,z);
  if(y===null) return false;
  s.fire.pos.set(x,y,z);s.fire.age=0;s.fire.active=true;s.fireStep=0;s.fireHit=0;s.engaged=0;
  s.fireHeading=Math.atan2(ctx.player.pos.x-x,ctx.player.pos.z-z);s.fireTurnUntil=0;s.firePassUntil=0;s.fireAnnounced=false;
  setMapMarker('wind:fire',{pos:s.fire.pos,icon:'map-fire-wind',pointer:true,zoneRadius:TORNADO.fire.reach});
  ctx.effects.ring(s.fire.pos,0xff7722,3);
  if(announce) announceFire(s);
  return true;
}

/** One terrain probe per quarter second, never a search or simulation across the whole world. */
function keepFire(ctx:Ctx,s:State):void {
  if(!ctx.save.tales.done.includes('fish') || s.time<s.fireSearchAt) return;
  const rule=TORNADO.fire,f=s.fire,p=ctx.player.pos;
  if(f.active && f.age<rule.relocateAfter && Math.hypot(p.x-f.pos.x,p.z-f.pos.z)<rule.maxDistance) return;
  s.fireSearchAt=s.time+rule.searchEvery;
  const a=Math.random()*Math.PI*2+s.fireSearchTurn++*2.399963229728653;
  const r=rule.spawnNear+Math.random()*(rule.spawnFar-rule.spawnNear);
  const x=p.x+Math.sin(a)*r,z=p.z+Math.cos(a)*r;
  if(f.active && Math.hypot(x-f.pos.x,z-f.pos.z)<18) return;
  placeFire(ctx,s,x,z,false);
}

export function boardWind(ctx: Ctx): boolean {
  const s=states.get(ctx);
  if(!s || !nearBlue(ctx,s) || s.riding || ctx.sleeping || ctx.napping || selectedBuilding()) return false;
  // The wind was summoned onto a checked pad; uneven ground under the child must not prevent boarding.
  const at=windLandingAt(ctx.world,s.blue.pos.x,s.blue.pos.z,(x,z)=>landingAllowed(ctx,x,z)) ?? landing(ctx,ctx.player.pos.x,ctx.player.pos.z);
  if(!at) { voice.say('tornado_land',{priority:7}); return false; }
  if(ctx.save.wind.fuel<TORNADO.blue.reserve) {
    sfx.play('click'); ctx.effects.ring(s.blue.pos,0x43bfff,1.5); return false;
  }
  s.riding=true;
  ctx.hud.setWindBoard(false);
  ctx.napping=true;
  pick(ctx,null);
  for(const id of ctx.save.companions) {
    if(COMPANIONS[id]?.guards) continue; // Сірко keeps his post/errand.
    const walker=lendCompanion(id);
    if(walker) s.passengers.push({id,walker});
  }
  s.blue.pos.set(at[0].x,Math.max(ctx.player.pos.y,at[0].y),at[0].z);
  s.blue.pos.z-=TORNADO.blue.front;
  s.route=[{x:s.blue.pos.x,z:s.blue.pos.z}];
  s.returnDistance=0; s.returning=false; s.descent=null;
  s.landingAt=s.time;
  ctx.input.clearPresses();
  voice.say('tornado_ride',{priority:7});
  sfx.play('jump',{pitch:1.3});
  return true;
}

function release(ctx: Ctx,s:State): void {
  if(!s.riding) return;
  s.riding=false;
  s.returning=false; s.descent=null; s.route=[];
  ctx.napping=false;
  ctx.hud.setWindCharge(false,ctx.save.wind.fuel/TORNADO.blue.range);
  for(const {id} of s.passengers) returnCompanion(id);
  s.passengers=[];
}

export function landWind(ctx: Ctx): boolean {
  const s=states.get(ctx);
  if(!s?.riding) return false;
  if(s.descent) return true;
  const at=landing(ctx,s.blue.pos.x,s.blue.pos.z+TORNADO.blue.front);
  if(!at) {
    if(s.time>s.hintAt) { voice.say('tornado_land',{priority:7}); s.hintAt=s.time+5; }
    s.returning=true;
    return false;
  }
  s.descent=at;
  return true;
}

function finishLanding(ctx:Ctx,s:State,at:WindLanding):void {
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
  // Settle the camera after the continuous descent; its orientation and scale stay familiar.
  events.emit('hero:teleport',{});
  ctx.effects.ring(ctx.player.pos,0x43bfff,2.5);
  if(ctx.save.wind.giftDay<ctx.save.day) {
    ctx.save.wind.giftDay=ctx.save.day; // Write the guard before delivering anything.
    giveItem(ctx,'babusia_pie',1);
    voice.say('tornado_gift',{priority:6});
    ctx.effects.sparkle(ctx.player.pos,0x43bfff);
  }
}

/** Retain the flown route only since the last dry pad. Straight segments share one endpoint. */
function rememberRoute(s:State,x:number,z:number):void {
  const end=s.route[s.route.length-1], before=s.route[s.route.length-2];
  const length=Math.hypot(x-end.x,z-end.z);
  if(length<1e-8) return;
  s.returnDistance+=length;
  if(before && (end.x-before.x)*(x-end.x)+(end.z-before.z)*(z-end.z)>0 &&
    Math.abs((end.x-before.x)*(z-end.z)-(end.z-before.z)*(x-end.x))<1e-6) {
    end.x=x; end.z=z;
  } else s.route.push({x,z});
}

function moveParty(ctx:Ctx,s:State,dt:number):void {
  if(ctx.sleeping) { release(ctx,s); return; }
  if(ctx.input.take('jump')) landWind(ctx);
  const b=s.blue, rule=TORNADO.blue;
  let nx=b.pos.x, nz=b.pos.z;
  if(s.descent) {
    // A nearby searched pad is approached in the air, then descended to, never teleported to.
    const target=s.descent[0], dx=target.x-nx, dz=target.z-rule.front-nz, d=Math.hypot(dx,dz);
    const step=Math.min(d,rule.speed*dt);
    if(d>0) { nx+=dx/d*step; nz+=dz/d*step; }
  } else if(s.returning) {
    const target=s.route[Math.max(0,s.route.length-2)];
    if(target) {
      const dx=target.x-nx,dz=target.z-nz,d=Math.hypot(dx,dz),step=Math.min(d,rule.speed*dt);
      if(d>0) { nx+=dx/d*step; nz+=dz/d*step; }
      s.returnDistance=Math.max(0,s.returnDistance-step);
      if(step>=d) s.route.pop();
    }
    if(s.route.length<=1 && s.time>=s.landingAt) {
      s.landingAt=s.time+0.5;
      landWind(ctx);
    }
  } else {
    const length=Math.hypot(ctx.input.moveX,ctx.input.moveY);
    // One stud is always kept for landing. Over water, also reserve the entire flown return route.
    if(ctx.save.wind.fuel<=rule.reserve+s.returnDistance+rule.speed*dt*2 || s.route.length>=1024) {
      if(!landWind(ctx)) s.returning=true;
    } else if(length>0) {
      nx+=ctx.input.moveX/Math.max(1,length)*rule.speed*dt;
      nz+=ctx.input.moveY/Math.max(1,length)*rule.speed*dt;
      if(!landingAllowed(ctx,nx,nz)) { nx=b.pos.x; nz=b.pos.z; }
      rememberRoute(s,nx,nz);
    }
  }
  const travelled=Math.hypot(nx-b.pos.x,nz-b.pos.z);
  ctx.save.wind.fuel=Math.max(0,ctx.save.wind.fuel-travelled);
  b.pos.x=nx; b.pos.z=nz;
  let top=0;
  for(const [dx,dz] of WIND_SEATS) top=Math.max(top,ctx.world.groundHeight(Math.floor(nx+dx),Math.floor(nz+dz+rule.front)));
  const at=s.descent;
  const horizontal=at?Math.hypot(nx-at[0].x,nz+rule.front-at[0].z):Infinity;
  const y=at && horizontal<0.01?Math.max(...at.map(p=>p.y)):top+rule.clearance;
  b.pos.y+=THREE.MathUtils.clamp(y-b.pos.y,-rule.liftSpeed*dt,rule.liftSpeed*dt);
  // Upcoming high terrain is sampled before crossing; the party cannot clip through a crown.
  if(travelled>0 && horizontal>0.01) b.pos.y=Math.max(b.pos.y,top+2);
  if(at && horizontal<0.01 && Math.abs(b.pos.y-y)<0.01) {
    const checked=windLandingAt(ctx.world,at[0].x,at[0].z,(x,z)=>landingAllowed(ctx,x,z));
    if(checked) { finishLanding(ctx,s,checked); return; }
    s.descent=null; s.returning=true;
  }
  const heroes=[ctx.player,...[...ctx.heroes.values()].filter(h=>h!==ctx.player)];
  heroes.forEach((h,i)=> {
    const [dx,dz]=WIND_SEATS[i];
    h.pos.set(nx+dx,b.pos.y+0.12*Math.sin(s.time*2+i),nz+dz+rule.front);
    h.body.vel.set(0,0,0); h.body.inWater=false; h.body.onGround=false;
    h.model.play('idle'); h.syncModel(dt);
  });
  s.passengers.forEach(({walker},i)=> {
    const a=i*2.399;
    walker.body.pos.set(nx+Math.cos(a)*1.5,b.pos.y,nz+Math.sin(a)*1.5+rule.front);
    walker.body.vel.set(0,0,0); walker.model.root.position.copy(walker.body.pos); walker.model.update(dt,0);
  });
  if(!s.returning && !s.descent && s.time>=s.landingAt) {
    s.landingAt=s.time+0.25;
    const pad=windLandingAt(ctx.world,nx,nz+rule.front,(x,z)=>landingAllowed(ctx,x,z));
    if(pad) { s.route=[{x:nx,z:nz}]; s.returnDistance=0; }
  }
  ctx.input.pendingHero=null;
  ctx.input.clearPresses();
}

function fireStep(ctx:Ctx,s:State,dt:number):void {
  const f=s.fire, rule=TORNADO.fire;
  if(!f.active) return;
  f.age+=dt;
  const p=ctx.player.pos, d=Math.hypot(p.x-f.pos.x,p.z-f.pos.z);
  const roaming=ctx.save.tales.done.includes('fish');
  if((!roaming && (f.age>rule.relocateAfter || d>rule.maxDistance)) || fireProtected(ctx,f.pos.x,f.pos.z)) {
    f.active=false; setMapMarker('wind:fire',null); return;
  }
  // Keep the real far-away marker while looking for another place; do not load/simulate its terrain.
  if(d>rule.maxDistance) return;
  if(!s.fireAnnounced && d<24) announceFire(s);
  if(f.age<rule.warn) return;
  s.engaged=Math.max(0,s.engaged-dt);
  const grounded=Math.abs(p.y-f.pos.y)<3 && !s.riding;
  if(d<9 && grounded && !fireProtected(ctx,p.x,p.z)) s.engaged=8;
  s.fireStep+=dt;
  if(s.fireStep>=0.1) {
    const step=Math.min(s.fireStep,0.2); s.fireStep=0;
    const prey=windPrey(ctx.monsters,f.pos,rule.monsterSight,(x,z)=>!fireProtected(ctx,x,z));
    const chase=grounded && (f.age-rule.warn)%(rule.chaseFor+rule.restFor)<rule.chaseFor && d<24 && !fireProtected(ctx,p.x,p.z);
    const desired=prey?Math.atan2(prey.pos.x-f.pos.x,prey.pos.z-f.pos.z):chase?Math.atan2(p.x-f.pos.x,p.z-f.pos.z):s.time*0.42;
    const targetDistance=prey?Math.hypot(prey.pos.x-f.pos.x,prey.pos.z-f.pos.z):chase?d:Infinity;
    // Sweep through a nearby target instead of stopping on it or reversing every tick.
    if(targetDistance<rule.reach && s.time>=s.firePassUntil) s.firePassUntil=s.time+1.2;
    const angle=s.time<Math.max(s.firePassUntil,s.fireTurnUntil)?s.fireHeading:desired;
    const speed=prey?rule.monsterSpeed:rule.speed;
    const distance=speed*step;
    for(const turn of FIRE_TURNS) {
      const x=f.pos.x+Math.sin(angle+turn)*distance,z=f.pos.z+Math.cos(angle+turn)*distance;
      if(fireProtected(ctx,x,z)) continue;
      const y=fireGroundAt(ctx.world,x,z);
      if(y!==null && Math.abs(y-f.pos.y)<1.1) {
        f.pos.set(x,y,z); s.fireHeading=angle+turn;
        // Keep an escape direction briefly; immediately seeking again pins it to the same wall.
        if(turn!==0) s.fireTurnUntil=s.time+0.8;
        break;
      }
    }
  }

  s.fireHit-=dt;
  if(s.fireHit>0) return;
  s.fireHit=rule.hitEvery;
  for(const hero of ctx.heroes.values()) if(Math.hypot(hero.pos.x-f.pos.x,hero.pos.z-f.pos.z)<rule.reach && Math.abs(hero.pos.y-f.pos.y)<2.5) hurtHero(ctx,hero,1,f.pos);
  for(const m of ctx.monsters) if(windCanHit(m) && Math.hypot(m.pos.x-f.pos.x,m.pos.z-f.pos.z)<rule.reach && Math.abs(m.pos.y-f.pos.y)<3) {
    dir.subVectors(m.pos,f.pos).setY(0);
    if(dir.lengthSq()<0.001) dir.set(1,0,0); else dir.normalize();
    damageMonster(ctx,m,rule.damage,dir,s.engaged>0?ctx.player:null);
  }
}

/** Called only on unpaused game frames. Heavy contacts run at most ten times a second. */
export function updateTornadoes(ctx:Ctx,dt:number,low:boolean):void {
  const s=states.get(ctx);
  if(!s || !ctx.playing) return;
  const boardRequested=ctx.input.take('wind:board');
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
    if(nearBlue(ctx,s)) {
      tapBox.min.set(b.pos.x-2.2,b.pos.y,b.pos.z-2.2);
      tapBox.max.set(b.pos.x+2.2,b.pos.y+4.7,b.pos.z+2.2);
      if(boardRequested || tappedInBox(ctx,tapBox)) boardWind(ctx);
    }
    if(taleById(cur)?.wind==='blue' && !b.active) summonBlueWind(ctx);
  }
  if(s.riding || (!ctx.sleeping && !ctx.napping)) {
    fireStep(ctx,s,dt);
    keepFire(ctx,s);
  }
  if(s.time>=s.decorAt) {
    s.decorAt=s.time+0.5;
    const at=s.fire.active && s.fire.age>=TORNADO.fire.warn && s.fire.pos.distanceTo(ctx.player.pos)<TORNADO.fire.maxDistance && (s.riding || (!ctx.sleeping && !ctx.napping))?s.fire.pos:null;
    let broke=false;
    ctx.skin?.disturbDecor?.(at,s.time,(p,color)=> { ctx.effects.poof(p,color,8);s.decorBreaks++;broke=true; });
    if(broke) sfx.play('break',{volume:0.2,pitch:1.4});
  }
  if(!s.riding && !ctx.napping && ctx.player.body.onGround)
    ctx.save.wind.fuel=Math.min(TORNADO.blue.range,ctx.save.wind.fuel+TORNADO.blue.range/TORNADO.blue.recharge*dt);
  ctx.hud.setWindCharge(s.riding,ctx.save.wind.fuel/TORNADO.blue.range,s.returning || !!s.descent);
  ctx.hud.setWindBoard(!s.riding && !ctx.sleeping && !ctx.napping && !selectedBuilding() && nearBlue(ctx,s));
  for(const w of [s.fire,s.blue]) {
    if(w===s.blue && w.active) w.age+=dt;
    w.look.root.visible=w.active;
    if(!w.active) continue;
    w.look.root.position.copy(w.pos);
    w.look.draw(s.time,low,w===s.fire?Math.min(1,0.35+w.age/TORNADO.fire.warn*0.65):Math.min(1,w.age*2));
  }
}
