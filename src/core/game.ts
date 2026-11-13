import { initBabusia, updateBabusia, weatherAsk } from '../systems/babusia';
import * as THREE from 'three';
import type { HeroId } from '../contracts';
import { HERO_STATS } from '../content/heroes';
import { MUSIC, type BuildingId } from '../content/buildings';
import { contentsOf } from '../content/contents';
import { updateBoss } from '../systems/boss';
import { updateCombat } from '../systems/combat';
import { updateDayNight } from '../systems/daynight';
import { createHeroes, updateHeroes, type HeroHandoff } from '../systems/heroes';
import { updateHouse } from '../systems/house';
import { exposeMonsters, spawnLog, updateMonsters } from '../systems/monsters';
import { canFold, pick, updateKit } from '../systems/kit';
import { initNarration, updateNarration } from '../systems/narration';
import { updatePickups } from '../systems/pickups';
import { initProgress, updateProgress } from '../systems/progress';
import { startOver, writeSave } from '../systems/save';
import { sleepPlace, updateSleep } from '../systems/sleep';
import { initPortals, updatePortals } from '../systems/travel';
import { updateLandmarks } from '../systems/landmarks';
import { djNear, initDisco, updateDisco } from '../systems/disco';
import { exposeDefense, updateDefense } from '../systems/defense';
import { updatePower } from '../systems/power';
import { updatePrizes } from '../systems/prizes';
import { updateCooking } from '../systems/cooking';
import { eating, updateFood } from '../systems/food';
import { initGadgets, updateGadgets } from '../systems/gadgets';
import { initGarden, updateGarden } from '../systems/garden';
import { initGuests, updateGuests } from '../systems/guests';
import { updateSignal } from '../systems/signal';
import { chestNear, updateCastles } from '../systems/castles';
import { chessChestNear, updateChess } from '../systems/chess';
import { initTales, updateTales } from '../systems/tales';
import { initMail, updateMail } from '../systems/mail';
import { exposeEffects, initEffects, updateEffects } from '../systems/effects';
import { exposeCompanions, initCompanions, updateCompanions } from '../systems/companions';
import { initPets, updatePets } from '../systems/pets';
import { initTvNews, updateTvNews } from '../systems/tvNews';
import { updatePlayroom } from '../systems/playroom';
import { initWhatsNew, updateWhatsNew } from '../systems/whatsNew';
import { applyDebugParams } from '../debug/give';
import { pushBubble } from '../systems/tasks';
import { updateVillages } from '../systems/villages';
import { initWeather, updateWeather } from '../systems/weather';
import { createCloudSea } from '../render/cloudSea';
import { updateLanterns } from '../render/lanterns';
import { updateHeroMark } from '../render/heroMark';
import { initTornadoes, updateTornadoes } from '../systems/tornadoes';
import { cutaway } from '../render/skins/cutaway';
import { music } from '../voice/music';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import { tuneOf } from '../systems/tune';
import { FRAMINGS, FollowCamera } from './camera';
import type { Ctx } from './ctx';
import { events } from './events';
import { probeDrawCalls } from './perfProbe';
import type { Quality } from './quality';
import { applyWaitingUpdate, checkForUpdate, leftTitle } from '../pwa';

/** Away this long, a waiting new version is switched to on coming back (the owner's call, 2026-11-02). */
const UPDATE_AFTER_AWAY_MS = 10 * 60 * 1000;

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
  private saveTimer = AUTOSAVE_EVERY;
  private paused = false;
  /** While paused nothing moves, so the last picture stays on the canvas; it is drawn again only when it must be. */
  private stillDirty = true;
  /** «Почати знову» wrote a new story: the old one is no longer saved. */
  private restarting = false;
  private stats: HTMLElement | null = null;
  private fps = 0;
  /** Frames drawn so far (the frame cap skips some display refreshes). */
  private rendered = 0;
  /** Smoothed CPU time of one drawn frame (simulation + draw submission), ms. */
  private workMs = 0;
  /** Freezes while playing (a drawn frame more than 100 ms after the last) and the worst frame of the last 5 s. */
  private hitch = { freezes: 0, worst: 0, worstAt: 0 };
  onFirstFrame: (() => void) | null = null;

  constructor(
    readonly ctx: Ctx,
    private quality: Quality,
  ) {
    this.cam = new FollowCamera(ctx.camera, FRAMINGS[ctx.params.cam ?? 1] ?? FRAMINGS[1]);
    initNarration(ctx);
    initWeather(ctx, quality);
    initTornadoes(ctx);
    // there from the start, empty, so its shader is built under the title and never mid-play
    ctx.clouds = createCloudSea(ctx.scene);
    initTvNews(ctx);
    events.on('attack:bolt', ({ hero }) => {
      if (hero === ctx.player?.id) this.cam.shake(0.3);
    });
    // a portal carried the party far away: the camera is there at once, under the fade
    events.on('hero:teleport', () => this.cam.snap(ctx.focus ?? ctx.player.pos));
    events.on('sleep:done', () => this.persist());

    const persist = () => this.persist();
    window.addEventListener('pagehide', persist);
    // Back after a long break (the tablet keeps the game open for days): a new version that is
    // waiting is switched to now, from the save just written; otherwise ask the server for one.
    let hiddenAt = 0;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = performance.now();
        persist();
        return;
      }
      this.stillDirty = true;
      if (hiddenAt && performance.now() - hiddenAt >= UPDATE_AFTER_AWAY_MS && applyWaitingUpdate()) return;
      void checkForUpdate();
    });
    window.addEventListener('resize', () => this.resize());
    this.resize();

    if (ctx.params.stats) {
      this.stats = document.createElement('div');
      Object.assign(this.stats.style, { position: 'fixed', left: '8px', bottom: '8px', font: '14px monospace', color: '#fff', background: 'rgba(0,0,0,.5)', padding: '2px 6px', zIndex: '9' });
      this.stats.style.whiteSpace = 'pre-line';
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
          party: [...ctx.heroes.values()].map((h) => ({ id: h.id, pos: h.pos.toArray().map((v) => +v.toFixed(2)) })),
          hearts: ctx.player?.hearts ?? null,
          coins: ctx.save.coins,
          monsters: ctx.monsters.length,
          pickups: ctx.pickups.size,
          time: +ctx.clock.t.toFixed(3),
        };
      },
      get perf() {
        const info = ctx.renderer.info.render;
        return {
          level: quality.level, fps: quality.fps, adaptive: quality.adaptive, rendered: game.rendered, workMs: +game.workMs.toFixed(2),
          calls: info.calls, tris: info.triangles, pixelRatio: ctx.renderer.getPixelRatio(),
          freezes: game.hitch.freezes, worst: Math.round(game.hitch.worst), programs: ctx.renderer.info.programs?.length ?? 0,
        };
      },
      /** The shader programs alive, by material type (or shader name) and what made them differ. */
      shaders: () => (ctx.renderer.info.programs ?? []).map((p) => `${p.name} ${p.cacheKey.length > 220 ? `${p.cacheKey.slice(0, 60)}…${p.cacheKey.slice(-160)}` : p.cacheKey}`),
      /** Draw calls of the next drawn frame, by pass and by what is drawn. */
      probe: () => probeDrawCalls(ctx.renderer, ctx.scene, () => game.rendered),
    };
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.ctx.renderer.setSize(w, h, false);
    this.ctx.camera.aspect = w / h;
    this.ctx.camera.updateProjectionMatrix();
    this.quality.resize();
    this.stillDirty = true;
  }

  start(): void {
    // Draw only when the frame cap says the next frame is due (30 or 60 fps,
    // evenly paced); the simulation steps by the time since the last drawn frame.
    const loop = (now: number) => {
      requestAnimationFrame(loop);
      const ms = this.quality.cap.tick(now);
      if (ms === null) return;
      this.rendered++;
      // a hidden tab (no frames for seconds) is not a freeze
      if (this.ctx.playing && ms < 5000) {
        const h = this.hitch;
        if (ms > 100) h.freezes++;
        if (ms >= h.worst || now - h.worstAt > 5000) {
          h.worst = ms;
          h.worstAt = now;
        }
      }
      const t0 = performance.now();
      this.frame(Math.min(this.ctx.params.step ?? 0.05, ms / 1000), ms);
      this.workMs += (performance.now() - t0 - this.workMs) * 0.05;
      if (this.onFirstFrame) {
        this.onFirstFrame();
        this.onFirstFrame = null;
      }
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
    leftTitle();
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
    ctx.hud.onKitPick = (id) => {
      if (!ctx.sleeping && !ctx.napping) pick(ctx, id as BuildingId);
    };
    this.wireMenu();
    initProgress(ctx);
    initBabusia(ctx);
    initTales(ctx);
    initMail(ctx);
    initPortals(ctx);
    initDisco(ctx);
    initEffects(ctx);
    initCompanions(ctx);
    initPets(ctx);
    initGadgets(ctx);
    initGarden(ctx);
    initGuests(ctx);
    initWhatsNew(ctx);
    exposeMonsters(ctx);
    exposeDefense();
    exposeEffects(ctx);
    exposeCompanions(ctx);
    applyDebugParams(ctx);
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
      if (paused) {
        this.persist();
        this.quality.quiet();
        // a step up may have changed the look: the still picture is drawn once more in it
        this.stillDirty = true;
      }
    };
    // The album fills the screen: the world waits behind it, as behind the big map.
    ctx.album.onClose = () => ctx.hud.onPause?.(false);
    // a step up in quality waits for a moment like this, never mid-play
    ctx.hud.onDark = () => this.quality.quiet();
    // The big map pauses the game the same way the pause menu does.
    ctx.map.onPause = ctx.hud.onPause;
    ctx.map.start(ctx);
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
    ctx.hud.onRestart = (held) => {
      if (held) this.restart();
      else voice.say('restart_hold', { priority: 9, interrupt: true });
    };
    // «Зміст гри»: everything in the game, where this save stands, the way to what is far away
    ctx.hud.onContents = () =>
      contentsOf(ctx.save, {
        home: ctx.house ? [ctx.house.centre.x, ctx.house.centre.z] : null,
        villages: ctx.world.villages?.() ?? [],
        castles: ctx.world.castles?.() ?? [],
        chess: ctx.world.chess?.() ?? null,
        boss: ctx.save.boss.site,
      });
    // «Exit»: save, Пупся says goodbye in the dark, then the game closes. A page in a browser tab
    // may not close itself: then it lets go of fullscreen and starts afresh at the title.
    ctx.hud.onExit = () => {
      this.persist();
      this.paused = true;
      voice.say('bye', { priority: 10, interrupt: true });
      void ctx.hud.fade(true).then(() =>
        setTimeout(() => {
          window.close();
          setTimeout(() => {
            if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
            if (!applyWaitingUpdate()) location.reload();
          }, 300);
        }, 1400),
      );
    };
  }

  /** «Почати знову» held through: the new story is written, the old one kept aside; then the title. */
  private restart(): void {
    const ctx = this.ctx;
    this.persist();
    this.restarting = true;
    startOver(ctx.save);
    sfx.play('sticker');
    voice.say('restart_done', { priority: 10, interrupt: true });
    void ctx.hud.fade(true).then(() =>
      setTimeout(() => {
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
        location.reload();
      }, 1600),
    );
  }

  private applySound(): void {
    const v = this.ctx.save.soundOn && !this.ctx.params.mute ? 1 : 0;
    voice.setVolume(v);
    sfx.setVolume(v);
    music.setVolume(v);
  }

  private frame(dt: number, ms: number): void {
    const ctx = this.ctx;
    ctx.input.update();
    if (this.paused) {
      // Paused: the world stays drawn and still; nothing moves, nobody spawns.
      if (ctx.album.isOpen && (ctx.input.take('close') || ctx.input.take('album'))) ctx.album.close();
      ctx.input.clearPresses();
      music.update(dt, -1, 0, false);
      ctx.world.update(ctx.focus ?? ctx.player.pos); // keeps streaming if paused before the world finished loading
      // The canvas keeps its last picture: drawing the same still scene every frame only heats the
      // tablet and slows the map and the menus on top. Drawn again after a resize, a new look, land
      // streaming in, or a return from the background.
      if (this.stillDirty || !(ctx.world.isIdle?.() ?? true)) {
        this.stillDirty = false;
        ctx.skin.updateScene(ctx.clock.daylight, ctx.focus ?? ctx.player.pos);
        updateWeather(ctx, 0, true);
        ctx.clouds?.draw(0, ctx.camera, ctx.clock.daylight);
        ctx.skin.render(ctx.renderer, ctx.scene, ctx.camera);
      }
      return;
    }
    if (ctx.playing) {
      ctx.clock.elapsed += dt;
      if (!ctx.album.isOpen) this.quality.sample(ms);

      if (ctx.input.take('album') && !ctx.album.isOpen) {
        ctx.album.open(ctx.save);
        events.emit('album:open', {});
        ctx.hud.onPause?.(true);
        return;
      }
      if (ctx.input.take('close')) ctx.album.close();

      updateTornadoes(ctx, dt, this.quality.level <= 0);

      if (ctx.napping) for (const h of ctx.heroes.values()) h.model.update(dt, 0);
      else updateHeroes(ctx, dt);
      updateCombat(ctx, dt);
      updateMonsters(ctx, dt);
      updateBoss(ctx, dt);
      updateKit(ctx, dt);
      updateDisco(ctx, dt);
      updateDefense(ctx, dt);
      updatePrizes(ctx, dt);
      updateCompanions(ctx, dt);
      updatePets(ctx, dt);
      updateTvNews(ctx, dt);
      updateEffects(ctx, dt);
      updateSignal(ctx, dt);
      updateFood(ctx, dt);
      updateCooking(ctx, dt);
      updateGadgets(ctx, dt);
      updateGarden(ctx);
      updateProgress(ctx);
      updateSleep(ctx);
      ctx.hud.setPrompt(ctx.sleeping || ctx.napping || eating() ? null : chestNear(ctx) || chessChestNear(ctx) ? 'chest' : sleepPlace(ctx) ? 'moon' : canFold(ctx) ? 'fold' : null);
      ctx.hud.setNote(!ctx.sleeping && !ctx.napping && djNear(ctx));
      ctx.hud.setAsk(weatherAsk(ctx));
      updateNarration(ctx, dt);
      updateWhatsNew(ctx, dt);
    }
    updatePortals(ctx, dt);
    updatePower(ctx, dt);
    updateLandmarks(ctx, dt);
    updateVillages(ctx, dt);
    // before the castles: both chests answer the one prompt, and the castles take it whoever stands there
    updateChess(ctx, dt);
    updateCastles(ctx, dt);
    updateBabusia(ctx, dt);
    updateTales(ctx, dt);
    updateMail(ctx, dt);
    pushBubble(ctx);
    updatePickups(ctx, dt);
    updateHouse(ctx, dt);
    updatePlayroom(ctx, dt);
    updateGuests(ctx, dt);
    updateDayNight(ctx, dt);
    updateLanterns(ctx, dt);
    updateHeroMark(ctx, dt);

    // a scene may hold the view on something else than the player (the house flying at night)
    const focus = ctx.focus ?? (ctx.playing ? ctx.player.pos : ctx.house!.centre);
    ctx.world.update(focus);
    if (ctx.playing) {
      // Near the Land Eater the camera pulls back so the whole beast fits on screen.
      const b = ctx.boss;
      const near = !ctx.focus && !!b && b.alive && Math.hypot(b.pos.x - ctx.player.pos.x, b.pos.z - ctx.player.pos.z) < 28;
      this.cam.zoomTarget = Math.max(ctx.zoom, near ? 1.5 : 1);
      this.cam.follow(focus, dt);
    }
    else if (this.intro) this.intro.update(dt);
    else this.cam.idle(ctx.house!.centre, dt);
    ctx.effects.update(dt);

    if (ctx.playing) {
      ctx.hud.setHearts(ctx.player.hearts, HERO_STATS.maxHearts);
      ctx.hud.setCoins(ctx.save.coins);
      ctx.hud.setBoltCooldown(ctx.player.boltCd / tuneOf(ctx).boltCooldown);
      ctx.map.update(dt);
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
    updateWeather(ctx, dt);
    ctx.clouds?.draw(dt, ctx.camera, ctx.clock.daylight);
    intro?.light?.();
    ctx.skin.render(ctx.renderer, ctx.scene, ctx.camera);
    intro?.overlay?.(ctx.renderer);

    if (this.stats) {
      this.fps += ((dt > 0 ? 1 / dt : 60) - this.fps) * 0.05;
      const info = ctx.renderer.info.render;
      const h = this.hitch;
      const alive = ctx.monsters.filter((m) => m.alive);
      const hidden = alive.filter((m) => m.model.root.layers.mask === 0).length;
      const spawns = Object.entries(spawnLog).map(([k, v]) => `${k} ${v}`).join(' · ');
      this.stats.textContent =
        `${this.fps.toFixed(0)} fps · ${info.calls} calls · ${(info.triangles / 1000).toFixed(0)}k tris · L${this.quality.level} @${this.quality.fps}` +
        ` · worst ${Math.round(h.worst)} ms · freezes ${h.freezes} · ${ctx.renderer.info.programs?.length ?? 0} shaders` +
        `\nmonsters ${alive.length} (hidden ${hidden}) · ${spawns}`;
    }
  }

  persist(): void {
    // a new story is already written: nothing of the old one may overwrite it
    if (this.restarting) return;
    const ctx = this.ctx;
    ctx.save.edits = ctx.world.exportEdits();
    writeSave(ctx.save);
  }
}
