import * as THREE from 'three';
import type { HeroId } from '../contracts';
import { HERO_STATS } from '../content/heroes';
import { updateBuilding } from '../systems/building';
import { updateCombat } from '../systems/combat';
import { updateDayNight } from '../systems/daynight';
import { createHeroes, updateHeroes, type HeroHandoff } from '../systems/heroes';
import { updateHouse } from '../systems/house';
import { updateMonsters } from '../systems/monsters';
import { initNarration, updateNarration } from '../systems/narration';
import { updatePickups } from '../systems/pickups';
import { writeSave } from '../systems/save';
import { cutaway } from '../render/skins/cutaway';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import { tuneOf } from '../systems/tune';
import { FollowCamera } from './camera';
import type { Ctx } from './ctx';
import { events } from './events';
import type { Quality } from './quality';

const AUTOSAVE_EVERY = 15;

/**
 * A start sequence that plays inside the running world before a hero is
 * chosen (ui/wake.ts). The game keeps simulating and drawing the world; the
 * intro moves the camera and its own models, and may change the light.
 */
export interface Intro {
  /** Runs every frame instead of the idle camera. */
  update(dt: number): void;
  /** Daylight the skin shows meanwhile (overrides the clock). */
  readonly daylight: number;
  /** After the skin has set its lights for the frame, before drawing. */
  light?(): void;
  /** Draws over the finished frame, after the skin's post pass (the title's logo). */
  overlay?(renderer: THREE.WebGLRenderer): void;
  /** For automated checks (`__koto.wake`). */
  readonly info?: object;
}

/**
 * The frame loop. Systems run in a fixed order each frame; the skin draws.
 * Before a hero is chosen the world is alive behind the start ritual.
 */
export class Game {
  readonly cam: FollowCamera;
  intro: Intro | null = null;
  private last = performance.now();
  private saveTimer = AUTOSAVE_EVERY;
  private paused = false;
  private stats: HTMLElement | null = null;
  private fps = 0;
  onFirstFrame: (() => void) | null = null;

  constructor(
    readonly ctx: Ctx,
    private quality: Quality,
  ) {
    this.cam = new FollowCamera(ctx.camera);
    initNarration(ctx);
    events.on('attack:bolt', ({ hero }) => {
      if (hero === ctx.player?.id) this.cam.shake(0.3);
    });

    const persist = () => this.persist();
    window.addEventListener('pagehide', persist);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') persist();
    });
    window.addEventListener('resize', () => this.resize());
    this.resize();

    if (ctx.params.stats) {
      this.stats = document.createElement('div');
      Object.assign(this.stats.style, { position: 'fixed', left: '8px', bottom: '8px', font: '14px monospace', color: '#fff', background: 'rgba(0,0,0,.5)', padding: '2px 6px', zIndex: '9' });
      document.body.appendChild(this.stats);
    }

    // For automated checks: a small read-only window into the game.
    const game = this;
    (window as unknown as { __koto: object }).__koto = {
      get ready() {
        return true;
      },
      get wake() {
        return game.intro?.info ?? null;
      },
      get state() {
        return {
          playing: ctx.playing,
          hero: ctx.player?.id ?? null,
          pos: ctx.player ? ctx.player.pos.toArray().map((v) => +v.toFixed(2)) : null,
          hearts: ctx.player?.hearts ?? null,
          coins: ctx.save.coins,
          monsters: ctx.monsters.length,
          pickups: ctx.pickups.size,
          time: +ctx.clock.t.toFixed(3),
        };
      },
    };
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.ctx.renderer.setSize(w, h, false);
    this.ctx.camera.aspect = w / h;
    this.ctx.camera.updateProjectionMatrix();
  }

  start(): void {
    const loop = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.frame(dt);
      if (this.onFirstFrame) {
        this.onFirstFrame();
        this.onFirstFrame = null;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /**
   * The hero was chosen: create the party on the doorstep and hand over control.
   * `handoff` takes over heroes the start ritual already walked out of the house.
   */
  begin(hero: HeroId, handoff?: Partial<Record<HeroId, HeroHandoff>>): void {
    const ctx = this.ctx;
    const p = ctx.params;
    this.intro = null;
    // A new adventure starts on the doorstep, between the door and the campfire —
    // not inside, where a child would first have to find the door.
    const doorstep = ctx.house!.campfire.root.position.clone().add(new THREE.Vector3(0, 0, -2));
    const custom = p.x !== null && p.z !== null;
    const at = custom ? new THREE.Vector3(p.x!, 0, p.z!) : doorstep;
    // ?x=&z= moves the party; the ritual's models still carry over, just placed there.
    if (custom && handoff) for (const h of Object.values(handoff)) delete h.pos;
    createHeroes(ctx, hero, at, handoff);
    ctx.playing = true;
    ctx.hud.show(ctx.params.hud);
    ctx.hud.setBuildBlock(ctx.save.buildBlock);
    ctx.hud.onPickBlock = (id) => (ctx.save.buildBlock = id);
    this.wireMenu();
    this.cam.snap(ctx.player.pos);
    sfx.ambient(ctx.clock.daylight > 0.4 ? 'day' : 'night');
  }

  /** Pause menu, difficulty, sound and the monster counter. */
  private wireMenu(): void {
    const ctx = this.ctx;
    const kills = () => Object.values(ctx.save.defeated).reduce((a, b) => a + (b ?? 0), 0);
    if (ctx.params.difficulty) ctx.save.difficulty = ctx.params.difficulty;
    ctx.hud.setKills(kills());
    ctx.hud.setDifficulty(ctx.save.difficulty);
    ctx.hud.setSoundOn(ctx.save.soundOn);
    this.applySound();
    events.on('monster:defeated', () => ctx.hud.setKills(kills()));
    ctx.hud.onPause = (paused) => {
      this.paused = paused;
      ctx.input.clearPresses();
      if (paused) this.persist();
    };
    ctx.hud.onDifficulty = (level) => {
      ctx.save.difficulty = level;
      ctx.hud.setDifficulty(level);
      voice.say(`diff_${level}` as const, { priority: 8, interrupt: true });
    };
    ctx.hud.onSound = (on) => {
      ctx.save.soundOn = on;
      ctx.hud.setSoundOn(on);
      this.applySound();
    };
    // «Exit» goes back to the title: save, then start the page afresh.
    ctx.hud.onExit = () => {
      this.persist();
      location.reload();
    };
  }

  private applySound(): void {
    const v = this.ctx.save.soundOn && !this.ctx.params.mute ? 1 : 0;
    voice.setVolume(v);
    sfx.setVolume(v);
  }

  private frame(dt: number): void {
    const ctx = this.ctx;
    ctx.input.update();
    if (this.paused) {
      // Paused: the world stays drawn and still; nothing moves, nobody spawns.
      ctx.input.clearPresses();
      ctx.world.update(ctx.player.pos); // keeps streaming if paused before the world finished loading
      ctx.skin.updateScene(ctx.clock.daylight, ctx.player.pos);
      ctx.skin.render(ctx.renderer, ctx.scene, ctx.camera);
      return;
    }
    if (ctx.playing) {
      ctx.clock.elapsed += dt;
      this.quality.sample(dt, ctx.skin);

      if (ctx.input.take('album') && !ctx.album.isOpen) {
        ctx.album.open(ctx.save);
        events.emit('album:open', {});
      }
      if (ctx.input.take('close')) ctx.album.close();

      updateHeroes(ctx, dt);
      updateCombat(ctx, dt);
      updateMonsters(ctx, dt);
      updateBuilding(ctx);
      updateNarration(ctx, dt);
    }
    updatePickups(ctx, dt);
    updateHouse(ctx, dt);
    updateDayNight(ctx, dt);

    const focus = ctx.playing ? ctx.player.pos : ctx.house!.centre;
    ctx.world.update(focus);
    if (ctx.playing) this.cam.follow(ctx.player.pos, dt);
    else if (this.intro) this.intro.update(dt);
    else this.cam.idle(ctx.house!.centre, dt);
    ctx.effects.update(dt);

    if (ctx.playing) {
      ctx.hud.setHearts(ctx.player.hearts, HERO_STATS.maxHearts);
      ctx.hud.setCoins(ctx.save.coins);
      ctx.hud.setBoltCooldown(ctx.player.boltCd / tuneOf(ctx).boltCooldown);
      this.saveTimer -= dt;
      if (this.saveTimer <= 0) {
        this.saveTimer = AUTOSAVE_EVERY;
        this.persist();
      }
    }

    // See-through tunnel from the camera to the hero (trees never hide the child's character).
    cutaway.on.value = ctx.playing ? 1 : 0;
    if (ctx.playing) {
      cutaway.from.copy(ctx.camera.position);
      ctx.player.chest(cutaway.to);
    }
    const intro = ctx.playing ? null : this.intro;
    ctx.skin.updateScene(intro ? intro.daylight : ctx.clock.daylight, focus);
    intro?.light?.();
    ctx.skin.render(ctx.renderer, ctx.scene, ctx.camera);
    intro?.overlay?.(ctx.renderer);

    if (this.stats) {
      this.fps += ((dt > 0 ? 1 / dt : 60) - this.fps) * 0.05;
      const info = ctx.renderer.info.render;
      this.stats.textContent = `${this.fps.toFixed(0)} fps · ${info.calls} calls · ${(info.triangles / 1000).toFixed(0)}k tris · tier ${this.quality.tier}`;
    }
  }

  persist(): void {
    const ctx = this.ctx;
    ctx.save.edits = ctx.world.exportEdits();
    writeSave(ctx.save);
  }
}
