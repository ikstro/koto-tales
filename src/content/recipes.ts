import type { Host } from './babusia';
import type { ItemId } from './items';
import type { LineId } from './lines';

/**
 * The recipes (DESIGN.md «Kitchen»): everyone cooks together at the stove in the grandmothers' house.
 * Six dishes each, so a new hostess means new dishes. Flour, milk and butter are always there; the
 * child brings the two products of a recipe. A dish is an item with a `use`: three portions go into
 * the box. Nothing burns and nothing can go wrong.
 */

export interface RecipeCard {
  id: string;
  name: string;
  /** One sentence for the parents (the «Зміст гри» page). */
  about: string;
  /** Whose dish it is: it is in the book while she is at home. */
  host: Host;
  /** The two products, the same one twice when it takes two. */
  needs: readonly [ItemId, ItemId];
  /** The item it makes. */
  dish: ItemId;
  /** What the children hold at the table (Пупся always gets a fish). */
  snack: 'apple' | 'pie' | 'cutlet' | 'pancake' | 'varenyk' | 'cocoa';
  /** The recipe told when its page is tapped. */
  line: LineId;
}

/**
 * What the save keeps of the kitchen besides the pages (`save.recipes`): the products whose simple
 * fact a hostess has told (`"<host>:<item>"`), and the own dishes («власна страва») cooked so far.
 * Gains fields without a migration: the save fills in today's defaults (systems/save.ts).
 */
export interface KitchenSave {
  facts: string[];
  own: string[];
}

export const freshKitchen = (): KitchenSave => ({ facts: [], own: [] });

export const RECIPES = {
  varenyky: { id: 'varenyky', name: 'Вареники з вишнями', about: 'Рецепт бабусі Юлі з двох порцій вишень. Вареники дають швидкий біг.', host: 'yulia', needs: ['cherry', 'cherry'], dish: 'varenyky', snack: 'varenyk', line: 'recipe_varenyky' },
  deruny: { id: 'deruny', name: 'Деруни', about: 'Рецепт бабусі Юлі з двох картоплин. Від дерунів монстри поруч завмирають.', host: 'yulia', needs: ['potato', 'potato'], dish: 'deruny', snack: 'pancake', line: 'recipe_deruny' },
  borscht: { id: 'borscht', name: 'Борщ', about: 'Рецепт бабусі Юлі з картоплі й моркви. Після борщу монстри не з’являються поруч.', host: 'yulia', needs: ['potato', 'carrot'], dish: 'borscht', snack: 'cocoa', line: 'recipe_borscht' },
  yushka: { id: 'yushka', name: 'Грибна юшка', about: 'Рецепт бабусі Юлі з коричневого гриба й моркви. Від юшки монстри поруч танцюють.', host: 'yulia', needs: ['mushroom_brown', 'carrot'], dish: 'yushka', snack: 'cocoa', line: 'recipe_yushka' },
  apple_pies: { id: 'apple_pies', name: 'Пиріжки з яблуками', about: 'Рецепт бабусі Юлі з двох яблук. Пиріжки дають швидкий біг.', host: 'yulia', needs: ['apple', 'apple'], dish: 'apple_pies', snack: 'pie', line: 'recipe_apple_pies' },
  compote: { id: 'compote', name: 'Компот', about: 'Рецепт бабусі Юлі з яблука й вишень. Від компоту монстри поруч танцюють.', host: 'yulia', needs: ['apple', 'cherry'], dish: 'compote', snack: 'cocoa', line: 'recipe_compote' },
  honey_pancakes: { id: 'honey_pancakes', name: 'Млинці з медом', about: 'Рецепт бабусі Олі з меду та яйця. Млинці дають швидкий біг.', host: 'olia', needs: ['honey', 'egg'], dish: 'honey_pancakes', snack: 'pancake', line: 'recipe_honey_pancakes' },
  sunny_egg: { id: 'sunny_egg', name: 'Яєчня-сонечко', about: 'Рецепт бабусі Олі з двох яєць. Після яєчні монстри не з’являються поруч.', host: 'olia', needs: ['egg', 'egg'], dish: 'sunny_egg', snack: 'pancake', line: 'recipe_sunny_egg' },
  carrot_cutlets: { id: 'carrot_cutlets', name: 'Морквяні котлетки', about: 'Рецепт бабусі Олі з моркви та яйця. Від котлеток монстри поруч завмирають.', host: 'olia', needs: ['carrot', 'egg'], dish: 'carrot_cutlets', snack: 'cutlet', line: 'recipe_carrot_cutlets' },
  apple_porridge: { id: 'apple_porridge', name: 'Каша з яблуками', about: 'Рецепт бабусі Олі з яблука й меду. Після каші монстри не з’являються поруч.', host: 'olia', needs: ['apple', 'honey'], dish: 'apple_porridge', snack: 'cocoa', line: 'recipe_apple_porridge' },
  ladybird_toast: { id: 'ladybird_toast', name: 'Бутерброд-сонечко', about: 'Рецепт бабусі Олі з двох морквин. Від бутерброда монстри поруч танцюють.', host: 'olia', needs: ['carrot', 'carrot'], dish: 'ladybird_toast', snack: 'pie', line: 'recipe_ladybird_toast' },
  butterfly_cookies: { id: 'butterfly_cookies', name: 'Печиво-метелики', about: 'Рецепт бабусі Олі з меду й вишень. Від печива монстри поруч завмирають.', host: 'olia', needs: ['honey', 'cherry'], dish: 'butterfly_cookies', snack: 'pie', line: 'recipe_butterfly_cookies' },
} satisfies Record<string, RecipeCard>;

export type RecipeId = keyof typeof RECIPES;

export const RECIPE_ORDER = Object.keys(RECIPES) as RecipeId[];

export const recipeById = (id: string): RecipeCard | null => (RECIPES as Record<string, RecipeCard>)[id] ?? null;

export const recipesOf = (host: Host): RecipeCard[] => (Object.values(RECIPES) as RecipeCard[]).filter((r) => r.host === host);

export const DISHES: ReadonlySet<string> = new Set((Object.values(RECIPES) as RecipeCard[]).map((r) => r.dish));

/** Every product the recipes ask for. */
export const PRODUCTS: readonly ItemId[] = ['cherry', 'potato', 'carrot', 'mushroom_brown', 'apple', 'honey', 'egg'];

export const COOK = {
  /** How close to the stove the pot piece breathes. */
  near: 2.6,
  /** Taps on the spoon. */
  stirs: 6,
  /** Seconds it boils. */
  wait: 6,
  /** Portions into the box. */
  portions: 3,
};

type Pantry = Partial<Record<ItemId, number>>;

const needOf = (r: RecipeCard, item: ItemId) => r.needs.filter((n) => n === item).length;

/** The products short for this recipe, each once. */
export function missing(r: RecipeCard, inv: Pantry): ItemId[] {
  return [...new Set(r.needs)].filter((item) => (inv[item] ?? 0) < needOf(r, item));
}

export const canCook = (r: RecipeCard, inv: Pantry): boolean => missing(r, inv).length === 0;

/** The hostess's morning product, in turn: her own come round first (eggs often at Оля's, she cooks with them most). */
const PANTRY: Record<Host, readonly ItemId[]> = {
  yulia: ['cherry', 'potato', 'carrot', 'apple', 'mushroom_brown'],
  olia: ['egg', 'honey', 'carrot', 'egg', 'apple', 'cherry'],
};

export const pantryOf = (host: Host, day: number): ItemId => PANTRY[host][day % PANTRY[host].length];

/** Each of the six taps on the spoon is someone's act, in turn. */
export const STIR_ACTS = ['lyosha', 'solomiia', 'david', 'pupsia'] as const;
export const stirActOf = (tap: number) => STIR_ACTS[tap % STIR_ACTS.length];
