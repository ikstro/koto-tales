/**
 * Home life, the pets (DESIGN.md «Home»): Сірко fed at his doghouse with what the party carries,
 * and the fish in the aquarium. What the save keeps of them; the rules come with stage 2.
 */
export interface PetsSave {
  /** The day Сірко was last fed (-1: never). */
  fedDay: number;
  /** The day the fish were last fed (the first feeding a day gives coins). */
  fishDay: number;
}

export const freshPets = (): PetsSave => ({ fedDay: -1, fishDay: -1 });
