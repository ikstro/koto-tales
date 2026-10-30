/**
 * Artifacts' models (content/artifacts.ts): small toy treasures built like items — 0.4–0.6 blocks,
 * origin at the bottom centre, front towards +Z; glow parts instead of lights.
 */
import * as THREE from 'three';
import type { Skin } from '../contracts';
import { Kit, type PartBuilder } from './parts/kit';

type Builder = (p: PartBuilder) => void;

/** One builder per artifact card, keyed by its id. */
export const ARTIFACT_BUILDERS: Record<string, Builder> = {};

/** Builds one artifact template (callers clone it). */
export function buildArtifact(id: string, skin: Skin): THREE.Group {
  const g = new THREE.Group();
  g.name = `artifact:${id}`;
  const build = ARTIFACT_BUILDERS[id];
  if (!build) throw new Error(`no artifact model for "${id}"`);
  const p = new Kit(`artifact:${id}`, skin).part('artifact', g);
  build(p);
  p.done();
  return g;
}
