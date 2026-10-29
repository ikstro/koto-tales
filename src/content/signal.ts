/**
 * The signal rules (DESIGN.md «Signal»), pure so they can be tested: Wi-Fi antennas whose zones
 * touch join one signal net, like poles for power; a net covers everything inside any of its
 * zones; the remote plays a show on the whole net. The radar clears the map in a sweep.
 */

/** A working antenna: where it stands and how far its zone reaches (blocks). */
export interface SignalNode {
  x: number;
  z: number;
  zone: number;
}

/** Seconds a night show lasts. */
export const SHOW_SECONDS = 20;

const touch = (a: SignalNode, b: SignalNode) => Math.hypot(a.x - b.x, a.z - b.z) <= a.zone + b.zone;

/** Nets: groups of antenna indices whose zones touch, directly or through others. */
export function signalNets(nodes: readonly SignalNode[]): number[][] {
  const seen = new Array<boolean>(nodes.length).fill(false);
  const out: number[][] = [];
  for (let i = 0; i < nodes.length; i++) {
    if (seen[i]) continue;
    seen[i] = true;
    const net = [i];
    for (let k = 0; k < net.length; k++) {
      for (let j = 0; j < nodes.length; j++) {
        if (!seen[j] && touch(nodes[net[k]], nodes[j])) {
          seen[j] = true;
          net.push(j);
        }
      }
    }
    out.push(net);
  }
  return out;
}

/** Whether (x, z) is inside the zone of one of the net's antennas. */
export function covers(nodes: readonly SignalNode[], net: readonly number[], x: number, z: number): boolean {
  return net.some((i) => Math.hypot(nodes[i].x - x, nodes[i].z - z) <= nodes[i].zone);
}

/** The net whose zones (x, z) is in, or -1. */
export function netAt(nodes: readonly SignalNode[], nets: readonly number[][], x: number, z: number): number {
  return nets.findIndex((net) => covers(nodes, net, x, z));
}

/**
 * The radar's sweep: the chunks (16 blocks) whose centres lie within `radius` of (x, z) and whose
 * bearing from it falls in [from, to) radians (0 = +x, growing towards +z; may wrap past 2π).
 */
export function sweepChunks(x: number, z: number, radius: number, from: number, to: number, chunk = 16): [number, number][] {
  const out: [number, number][] = [];
  const TAU = Math.PI * 2;
  const span = to - from;
  const c0x = Math.floor((x - radius) / chunk);
  const c1x = Math.floor((x + radius) / chunk);
  const c0z = Math.floor((z - radius) / chunk);
  const c1z = Math.floor((z + radius) / chunk);
  for (let cx = c0x; cx <= c1x; cx++) {
    for (let cz = c0z; cz <= c1z; cz++) {
      const dx = (cx + 0.5) * chunk - x;
      const dz = (cz + 0.5) * chunk - z;
      if (Math.hypot(dx, dz) > radius) continue;
      const a = (((Math.atan2(dz, dx) - from) % TAU) + TAU) % TAU;
      if (a < span) out.push([cx, cz]);
    }
  }
  return out;
}
