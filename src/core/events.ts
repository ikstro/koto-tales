import type { HeroId, ItemId, MonsterKind } from '../contracts';

/**
 * What happened in the game. Systems announce facts here; voice, album,
 * quests and the HUD listen. A new quest is a new listener — the systems
 * that raise these events never learn about it.
 */
export interface GameEvents {
  'hero:switch': { hero: HeroId };
  'hero:hurt': { hero: HeroId; hearts: number };
  'hero:sleep': { hero: HeroId };
  'hero:wake': { hero: HeroId };
  'hero:home': { inside: boolean };
  'attack:arrow': { hero: HeroId };
  'attack:bolt': { hero: HeroId; hits: number };
  'monster:spawn': { kind: MonsterKind };
  'monster:spot': { kind: MonsterKind; first: boolean };
  'monster:defeated': { kind: MonsterKind; first: boolean; by: HeroId };
  'item:picked': { item: ItemId; first: boolean; total: number };
  'coins:changed': { coins: number };
  'block:placed': { x: number; y: number; z: number; id: number };
  'block:broken': { x: number; y: number; z: number; id: number };
  'time:phase': { phase: 'morning' | 'evening' | 'night' };
  'album:open': Record<string, never>;
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<keyof GameEvents, Set<Handler<never>>>();

  on<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn as Handler<never>);
    return () => set!.delete(fn as Handler<never>);
  }

  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of set) {
      try {
        (fn as Handler<GameEvents[K]>)(payload);
      } catch (e) {
        // One broken listener must not stop the game loop.
        console.error(`[events] ${String(type)}`, e);
      }
    }
  }
}

export const events = new EventBus();
