/**
 * Home life, the garden bed (DESIGN.md «Home», building `garden`): what grows in each bed the
 * child has put up. What the save keeps; the rules come with stage 2.
 */
export interface GardenSave {
  /** Per bed, by its footprint corner `x,z`: what grows there (filled in with the rules). */
  beds: Record<string, unknown>;
}

export const freshGarden = (): GardenSave => ({ beds: {} });
