/** One shared AudioContext + master gain for voice and sfx. Created lazily. */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

export function getCtx(): AudioContext {
  if (!ctx) {
    const Ctor: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
  }
  return ctx;
}

export function getMaster(): GainNode {
  getCtx();
  return master!;
}

/** Create/resume the context. Call from a user gesture. */
export function unlockAudio(): void {
  try {
    const c = getCtx();
    if (c.state !== 'running') void c.resume();
  } catch {
    /* audio unavailable: stay silent */
  }
}
