import { freshGarden, type GardenSave } from './garden';
import { freshPets, type PetsSave } from './pets';
import { freshPost, type PostSave } from './post';

/**
 * The heroes' home life (DESIGN.md «Home»), as the save keeps it: one slice per part, each with
 * its own file of rules. A slice gains a field without a save migration: `normHome` fills in the
 * defaults of whatever an older save lacks.
 */
export interface HomeSave {
  pets: PetsSave;
  garden: GardenSave;
  post: PostSave;
}

export const freshHome = (): HomeSave => ({ pets: freshPets(), garden: freshGarden(), post: freshPost() });

/** The slices as saved, with today's defaults under them. */
export function normHome(raw: unknown): HomeSave {
  const h = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof HomeSave, object>>;
  return {
    pets: { ...freshPets(), ...(h.pets ?? {}) },
    garden: { ...freshGarden(), ...(h.garden ?? {}) },
    post: { ...freshPost(), ...(h.post ?? {}) },
  };
}
