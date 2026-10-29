import type { PowerCard } from './buildings';

/**
 * The power rules (DESIGN.md «Power»), pure so they can be tested: what stands close
 * enough joins by itself; a network works when what it gives covers what it takes;
 * batteries keep what is left over and give back what is missing; when even that is
 * not enough, the whole network blinks and nothing on it works.
 */

/** Buildings closer than this (blocks, along the ground) join with a wire. */
export const REACH = 7;
/** …and no further apart up or down. */
const REACH_UP = 6;

export interface PowerNode {
  /** Where its wires hang from (world). */
  x: number;
  y: number;
  z: number;
  card: PowerCard;
  /** A battery's store (sparks × seconds). */
  charge: number;
}

export interface NetState {
  /** Given now (sources, the sun) and taken (lamps, lighthouses). */
  give: number;
  take: number;
  /** Everything on it works. */
  on: boolean;
  /** Short: everything blinks and nothing works. */
  low: boolean;
}

/** How close another socket must be to join this one. */
export const reachOf = (card: PowerCard) => Math.max(REACH, card.reach ?? 0);
/** …and how far up or down (a long reach, the power station's, climbs hills too). */
export const reachUpOf = (card: PowerCard) => ((card.reach ?? 0) > REACH * 2 ? REACH_UP * 2 : REACH_UP);
const near = (a: PowerNode, b: PowerNode) =>
  Math.hypot(a.x - b.x, a.z - b.z) <= Math.max(reachOf(a.card), reachOf(b.card)) && Math.abs(a.y - b.y) <= Math.max(reachUpOf(a.card), reachUpOf(b.card));

/** Networks: groups of node indices joined through neighbours. */
export function networks(nodes: readonly PowerNode[]): number[][] {
  const seen = new Array<boolean>(nodes.length).fill(false);
  const out: number[][] = [];
  for (let i = 0; i < nodes.length; i++) {
    if (seen[i]) continue;
    seen[i] = true;
    const net = [i];
    for (let k = 0; k < net.length; k++) {
      for (let j = 0; j < nodes.length; j++) {
        if (!seen[j] && near(nodes[net[k]], nodes[j])) {
          seen[j] = true;
          net.push(j);
        }
      }
    }
    out.push(net);
  }
  return out;
}

/** The wires of a network: each node hangs one wire to the nearest one already wired (no web of crossings). */
export function wires(nodes: readonly PowerNode[], net: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  const done = [net[0]];
  const left = net.slice(1);
  while (left.length) {
    let bi = -1;
    let bj = -1;
    let bd = Infinity;
    for (let a = 0; a < left.length; a++) {
      for (const j of done) {
        const n = nodes[left[a]];
        const m = nodes[j];
        const d = Math.hypot(n.x - m.x, n.z - m.z);
        if (d < bd && near(n, m)) {
          bd = d;
          bi = a;
          bj = j;
        }
      }
    }
    if (bi < 0) break;
    out.push([bj, left[bi]]);
    done.push(left[bi]);
    left.splice(bi, 1);
  }
  return out;
}

/**
 * One step of a network over `dt` seconds with the sun at `daylight` (0..1). Changes the
 * batteries' charge.
 */
export function tick(nodes: PowerNode[], net: readonly number[], daylight: number, dt: number): NetState {
  let give = 0;
  let take = 0;
  let stored = 0;
  let room = 0;
  for (const i of net) {
    const c = nodes[i].card;
    give += (c.give ?? 0) + (c.solar ?? 0) * daylight;
    take += c.take ?? 0;
    if (c.store) {
      stored += nodes[i].charge;
      room += c.store - nodes[i].charge;
    }
  }
  const spare = give - take;
  if (spare >= 0) {
    // what is left over goes into the batteries
    let put = Math.min(room, spare * dt);
    for (const i of net) {
      const c = nodes[i].card;
      if (!c.store || put <= 0) continue;
      const k = Math.min(put, c.store - nodes[i].charge);
      nodes[i].charge += k;
      put -= k;
    }
    return { give, take, on: take > 0 || give > 0 || stored > 0, low: false };
  }
  let need = -spare * dt;
  if (stored < need) {
    // not even the batteries can help: they give their last and the network blinks
    for (const i of net) if (nodes[i].card.store) nodes[i].charge = 0;
    return { give, take, on: false, low: true };
  }
  for (const i of net) {
    if (!nodes[i].card.store || need <= 0) continue;
    const k = Math.min(need, nodes[i].charge);
    nodes[i].charge -= k;
    need -= k;
  }
  return { give, take, on: true, low: false };
}
