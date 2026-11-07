import * as THREE from 'three';
import { TV_PICTURE, tvWarmUp, type Tv } from '../assets/babusia';
import { HOSTS, type Host } from '../content/babusia';
import type { LineId } from '../content/lines';
import { MONSTERS, type MonsterKind } from '../content/monsters';
import { newsComment, newsSubject, nextNews, tellNews } from '../content/news';
import type { Ctx } from '../core/ctx';
import { tappedAt } from '../ui/worldTap';
import { sfx } from '../voice/sfx';
import { voice } from '../voice/voice';
import { eating } from './food';
import { selectedBuilding } from './kit';

/**
 * The monster news on a TV (DESIGN.md «Бабуся»; rules in content/news.ts). Any TV can be registered
 * (the grandmothers' now, the heroes' bigger house later). A tap on the set: a jingle, the set hops,
 * the picture opens on the monster's portrait in a little studio with the ticker running and the red
 * «live» dot blinking, and after the jingle the anchor reads one item. When the line is over the
 * set goes off by itself (or at once on a second tap); then now and then Пупся or the hostess at home
 * says a word. One TV plays at a time.
 */

const BASE = import.meta.env.BASE_URL;
/** A tap reaches the screen within this many blocks of it (seen from the camera). */
const TAP_REACH = 1.0;
/** The hero must stand this close to the set for a tap to count, and stay this close while it plays. */
const NEAR = 12;
/** The anchor starts once the jingle is over (s). */
const JINGLE = 0.95;
/** No mp3 for the line (not voiced yet): the set stays on this long (s). */
const SILENT_FOR = 8;
/** Never on longer than this (s). */
const MAX_ON = 16;
/** The comment comes this long after the set goes off (s). */
const COMMENT_AFTER = 0.7;

export interface TvOptions {
  /** The hostess at home by this set (her comment), or null (only Пупся comments). */
  host(): Host | null;
  /** Whether a tap may reach it now (the hero inside, its roof faded); always when left out. */
  reachable?(): boolean;
}

interface Entry {
  tv: Tv;
  opts: TvOptions;
}

const tvs: Entry[] = [];
let playing: { e: Entry; id: LineId; t: number; said: boolean; heard: boolean; quietT: number } | null = null;
let comment: { line: LineId; t: number } | null = null;

/** A TV that shows the news on a tap; returns a function that takes it back. */
export function registerTv(tv: Tv, opts: TvOptions): () => void {
  const e: Entry = { tv, opts };
  tvs.push(e);
  return () => {
    const i = tvs.indexOf(e);
    if (i >= 0) tvs.splice(i, 1);
    if (playing?.e === e) stop(null, false);
  };
}

// ─── the picture ────────────────────────────────────────────────────────────

let canvas: HTMLCanvasElement | null = null;
let texture: THREE.CanvasTexture | null = null;
const images = new Map<string, HTMLImageElement>();
/** Bumped per news item, so a slow image never paints over a newer one. */
let paintTicket = 0;

function pictureOf(ctx: Ctx, id: LineId, host: Host | null): { src: string; size: number } {
  const s = newsSubject(id);
  if (s === 'eater') return { src: `${BASE}hud/boss-face.png`, size: 0.86 };
  if (s === 'nessie') return { src: `${BASE}hud/nessie-face.png`, size: 0.86 };
  if (s === 'weather') return { src: `${BASE}hud/ask-weather.png`, size: 0.86 };
  if (s === 'house') return { src: `${BASE}hud/${HOSTS[host ?? 'yulia'].mark}.png`, size: 0.86 };
  return { src: ctx.portraits.monsters[s as MonsterKind] ?? ctx.portraits.monsters.zombie, size: 1.12 };
}

/** The studio behind the portrait: a blue sunburst, a vignette like an old set's glass, a mustard desk. */
function studio(g: CanvasRenderingContext2D): void {
  const { w, h } = TV_PICTURE;
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#4a9be8');
  sky.addColorStop(1, '#1d4f99');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h * 0.46;
  g.fillStyle = 'rgba(255,255,255,0.12)';
  for (let i = 0; i < 12; i += 2) {
    const a0 = (i / 12) * Math.PI * 2;
    const a1 = ((i + 1) / 12) * Math.PI * 2;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a0) * w, cy + Math.sin(a0) * w);
    g.lineTo(cx + Math.cos(a1) * w, cy + Math.sin(a1) * w);
    g.closePath();
    g.fill();
  }
  // the desk the portrait stands on
  g.fillStyle = '#eab02b';
  g.beginPath();
  g.ellipse(cx, h * 0.78, w * 0.34, h * 0.08, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffd23a';
  g.beginPath();
  g.ellipse(cx, h * 0.765, w * 0.3, h * 0.055, 0, 0, Math.PI * 2);
  g.fill();
  const v = g.createRadialGradient(cx, cy, h * 0.35, cx, cy, w * 0.72);
  v.addColorStop(0, 'rgba(10,20,40,0)');
  v.addColorStop(1, 'rgba(10,20,40,0.4)');
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
}

function paint(src: string, size: number): THREE.CanvasTexture {
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = TV_PICTURE.w;
    canvas.height = TV_PICTURE.h;
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
  }
  const g = canvas.getContext('2d')!;
  const my = ++paintTicket;
  studio(g);
  texture!.needsUpdate = true;
  const draw = (img: HTMLImageElement) => {
    if (my !== paintTicket) return;
    const { w, h } = TV_PICTURE;
    const s = h * size;
    const r = img.width / img.height || 1;
    const dw = r >= 1 ? s : s * r;
    const dh = r >= 1 ? s / r : s;
    // standing on the desk, above the ticker band
    g.drawImage(img, (w - dw) / 2, h * 0.8 - dh * 0.92, dw, dh);
    texture!.needsUpdate = true;
  };
  let img = images.get(src);
  if (!img) {
    img = new Image();
    img.src = src;
    images.set(src, img);
  }
  if (img.complete && img.naturalWidth) draw(img);
  else img.addEventListener('load', () => draw(img!), { once: true });
  return texture!;
}

// ─── on and off ─────────────────────────────────────────────────────────────

const at = new THREE.Vector3();

const screenOf = (e: Entry): THREE.Vector3 => e.tv.screen.getWorldPosition(at);

/** Seen in the world: it and every parent visible. */
function shown(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

function start(ctx: Ctx, e: Entry): void {
  if (playing) stop(ctx, false);
  comment = null;
  const id = nextNews(ctx.save);
  ctx.save.news = tellNews(ctx.save, id);
  const host = e.opts.host();
  const pic = pictureOf(ctx, id, host);
  e.tv.news(paint(pic.src, pic.size));
  e.tv.poke();
  sfx.play('news');
  playing = { e, id, t: 0, said: false, heard: false, quietT: 0 };
}

/** Off; `done`: the item was told to the end (the comment may follow). */
function stop(ctx: Ctx | null, done: boolean): void {
  if (!playing) return;
  const p = playing;
  playing = null;
  p.e.tv.news(null);
  if (!done) {
    p.e.tv.poke();
    sfx.play('switch', { pitch: 0.85 });
    return;
  }
  const line = ctx ? newsComment(ctx.save.news.shown, p.e.opts.host()) : null;
  if (line) comment = { line, t: COMMENT_AFTER };
}

export function updateTvNews(ctx: Ctx, dt: number): void {
  const p = ctx.player.pos;
  // a tap on a set the hero stands near
  if (ctx.input.taps.length && !ctx.sleeping && !ctx.napping && !eating() && !selectedBuilding() && !ctx.map.isOpen && !ctx.album.isOpen) {
    for (const e of tvs) {
      if (!shown(e.tv.root) || e.opts.reachable?.() === false) continue;
      const s = screenOf(e);
      if (Math.hypot(s.x - p.x, s.z - p.z) > NEAR) continue;
      if (!tappedAt(ctx, s, TAP_REACH)) continue;
      if (playing?.e === e) stop(ctx, false);
      else start(ctx, e);
      break;
    }
  }
  if (playing) {
    const q = playing;
    q.t += dt;
    if (!q.said && q.t >= JINGLE) {
      q.said = true;
      voice.say(q.id, { priority: 6, interrupt: true });
    }
    if (q.said && voice.isSpeaking()) q.heard = true;
    q.quietT = q.heard && !voice.isSpeaking() ? q.quietT + dt : 0;
    const s = screenOf(q.e);
    const gone = !shown(q.e.tv.root) || Math.hypot(s.x - p.x, s.z - p.z) > NEAR + 2 || ctx.sleeping;
    if (gone) stop(ctx, false);
    else if (q.quietT > 0.5 || (!q.heard && q.t > JINGLE + SILENT_FOR) || q.t > MAX_ON) stop(ctx, true);
  }
  if (comment) {
    comment.t -= dt;
    if (comment.t <= 0) {
      voice.say(comment.line, { priority: 5 });
      comment = null;
    }
  }
}

/** At the start: the news layer's shaders are built under the title, never mid-play. */
export function initTvNews(ctx: Ctx): void {
  ctx.scene.add(tvWarmUp());
  // For automated checks.
  (window as unknown as { __kotoTv: object }).__kotoTv = {
    get state() {
      return {
        tvs: tvs.length,
        playing: playing ? { id: playing.id, t: +playing.t.toFixed(2), heard: playing.heard } : null,
        news: { ...ctx.save.news },
        comment: comment?.line ?? null,
      };
    },
    /** Where to tap (px) on the nearest registered set's screen. */
    get screen() {
      const e = tvs.find((x) => shown(x.tv.root));
      if (!e) return null;
      const v = screenOf(e).clone().project(ctx.camera);
      const r = ctx.renderer.domElement.getBoundingClientRect();
      return [Math.round(r.left + (v.x * 0.5 + 0.5) * r.width), Math.round(r.top + (-v.y * 0.5 + 0.5) * r.height)];
    },
    get world() {
      const e = tvs.find((x) => shown(x.tv.root));
      return e ? screenOf(e).toArray().map((n) => +n.toFixed(2)) : null;
    },
    /** The set's layers: the program picture and the news (visible, opacity). */
    get layers() {
      const e = tvs.find((x) => shown(x.tv.root));
      if (!e) return null;
      const out: Record<string, unknown> = {};
      e.tv.root.traverse((o) => {
        if (o.name !== 'picture' && o.name !== 'news') return;
        const m = (o.children[0] as THREE.Mesh | undefined)?.material as THREE.Material | undefined;
        out[o.name] = { visible: o.visible, scaleY: +o.scale.y.toFixed(2), opacity: m ? +m.opacity.toFixed(2) : null, z: +o.position.z.toFixed(3) };
      });
      return out;
    },
    /** Marks a monster as met (as the album does), or a giant (as its first card does). */
    meet(kind: MonsterKind | 'eater' | 'nessie') {
      if (kind === 'eater' || kind === 'nessie') {
        const said = kind === 'eater' ? 'guide_boss' : 'guide_nessie';
        if (!ctx.save.said.includes(said)) ctx.save.said.push(said);
      } else if (MONSTERS[kind] && !ctx.save.found.includes(`m:${kind}`)) ctx.save.found.push(`m:${kind}`);
    },
  };
}
