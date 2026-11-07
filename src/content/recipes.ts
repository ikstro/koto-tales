import type { Host } from './babusia';
import { ITEMS, type ItemCard, type ItemId } from './items';
import type { LineId } from './lines';

/**
 * The kitchen (DESIGN.md «Kitchen»): everyone cooks together at the stove in the grandmothers' house.
 * The children mix 1–3 products in the pantry themselves; flour, milk and butter are always there.
 * Products that make a recipe (a multiset, order does not matter) make its dish; anything else is an
 * own dish («власна страва»), weaker, with the power most of its products give. The book of recipes
 * is a hint: sixteen dishes, eight of each hostess, told in her voice. A dish is an item with a `use`:
 * three portions go into the box. Nothing burns and nothing can go wrong.
 */

export interface RecipeCard {
  id: string;
  name: string;
  /** One sentence for the parents (the «Зміст гри» page). */
  about: string;
  /** Whose dish it is: it is in the book while she is at home. */
  host: Host;
  /** Two or three products, the same one twice when it takes two. */
  needs: readonly ItemId[];
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
  deruny: { id: 'deruny', name: 'Деруни', about: 'Рецепт бабусі Юлі з двох картоплин і яйця. Від дерунів монстри поруч завмирають.', host: 'yulia', needs: ['potato', 'potato', 'egg'], dish: 'deruny', snack: 'pancake', line: 'recipe_deruny' },
  borscht: { id: 'borscht', name: 'Борщ', about: 'Рецепт бабусі Юлі з картоплі й моркви. Після борщу монстри не з’являються поруч.', host: 'yulia', needs: ['potato', 'carrot'], dish: 'borscht', snack: 'cocoa', line: 'recipe_borscht' },
  yushka: { id: 'yushka', name: 'Грибна юшка', about: 'Рецепт бабусі Юлі з коричневого гриба, моркви й картоплі. Від юшки монстри поруч танцюють.', host: 'yulia', needs: ['mushroom_brown', 'carrot', 'potato'], dish: 'yushka', snack: 'cocoa', line: 'recipe_yushka' },
  apple_pies: { id: 'apple_pies', name: 'Пиріжки з яблуками', about: 'Рецепт бабусі Юлі з двох яблук. Пиріжки дають швидкий біг.', host: 'yulia', needs: ['apple', 'apple'], dish: 'apple_pies', snack: 'pie', line: 'recipe_apple_pies' },
  compote: { id: 'compote', name: 'Компот', about: 'Рецепт бабусі Юлі з яблука й вишень. Від компоту монстри поруч танцюють.', host: 'yulia', needs: ['apple', 'cherry'], dish: 'compote', snack: 'cocoa', line: 'recipe_compote' },
  mushroom_pies: { id: 'mushroom_pies', name: 'Пиріжки з грибами', about: 'Рецепт бабусі Юлі з картоплі, гриба і яйця. Після пиріжків монстри не з’являються поруч.', host: 'yulia', needs: ['potato', 'mushroom_brown', 'egg'], dish: 'mushroom_pies', snack: 'pie', line: 'recipe_mushroom_pies' },
  uzvar: { id: 'uzvar', name: 'Узвар', about: 'Рецепт бабусі Юлі з яблука, вишень і меду. Від узвару монстри поруч танцюють.', host: 'yulia', needs: ['apple', 'cherry', 'honey'], dish: 'uzvar', snack: 'cocoa', line: 'recipe_uzvar' },
  honey_pancakes: { id: 'honey_pancakes', name: 'Млинці з медом', about: 'Рецепт бабусі Олі з меду та яйця. Млинці дають швидкий біг.', host: 'olia', needs: ['honey', 'egg'], dish: 'honey_pancakes', snack: 'pancake', line: 'recipe_honey_pancakes' },
  sunny_egg: { id: 'sunny_egg', name: 'Яєчня-сонечко', about: 'Рецепт бабусі Олі з двох яєць. Після яєчні монстри не з’являються поруч.', host: 'olia', needs: ['egg', 'egg'], dish: 'sunny_egg', snack: 'pancake', line: 'recipe_sunny_egg' },
  carrot_cutlets: { id: 'carrot_cutlets', name: 'Морквяні котлетки', about: 'Рецепт бабусі Олі з двох морквин і яйця. Від котлеток монстри поруч завмирають.', host: 'olia', needs: ['carrot', 'carrot', 'egg'], dish: 'carrot_cutlets', snack: 'cutlet', line: 'recipe_carrot_cutlets' },
  apple_porridge: { id: 'apple_porridge', name: 'Каша з яблуками', about: 'Рецепт бабусі Олі з яблука й меду. Після каші монстри не з’являються поруч.', host: 'olia', needs: ['apple', 'honey'], dish: 'apple_porridge', snack: 'cocoa', line: 'recipe_apple_porridge' },
  ladybird_toast: { id: 'ladybird_toast', name: 'Бутерброд-сонечко', about: 'Рецепт бабусі Олі з двох морквин. Від бутерброда монстри поруч танцюють.', host: 'olia', needs: ['carrot', 'carrot'], dish: 'ladybird_toast', snack: 'pie', line: 'recipe_ladybird_toast' },
  butterfly_cookies: { id: 'butterfly_cookies', name: 'Печиво-метелики', about: 'Рецепт бабусі Олі з меду, вишень і яйця. Від печива монстри поруч завмирають.', host: 'olia', needs: ['honey', 'cherry', 'egg'], dish: 'butterfly_cookies', snack: 'pie', line: 'recipe_butterfly_cookies' },
  baked_apples: { id: 'baked_apples', name: 'Печені яблука', about: 'Рецепт бабусі Олі з двох яблук і меду. Печені яблука дають швидкий біг.', host: 'olia', needs: ['apple', 'apple', 'honey'], dish: 'baked_apples', snack: 'apple', line: 'recipe_baked_apples' },
  carrot_salad: { id: 'carrot_salad', name: 'Морквяний салат', about: 'Рецепт бабусі Олі з моркви, яблука й меду. Від салату монстри поруч завмирають.', host: 'olia', needs: ['carrot', 'apple', 'honey'], dish: 'carrot_salad', snack: 'apple', line: 'recipe_carrot_salad' },
} satisfies Record<string, RecipeCard>;

export type RecipeId = keyof typeof RECIPES;

export const RECIPE_ORDER = Object.keys(RECIPES) as RecipeId[];

export const recipeById = (id: string): RecipeCard | null => (RECIPES as Record<string, RecipeCard>)[id] ?? null;

export const recipesOf = (host: Host): RecipeCard[] => (Object.values(RECIPES) as RecipeCard[]).filter((r) => r.host === host);

export type Power = NonNullable<ItemCard['gives']>;

/** The own dish of each power: one shared stew, tinted by what went in. */
export const OWN: Record<Power, ItemId> = { fast: 'surprise_fast', freeze: 'surprise_freeze', light: 'surprise_light', peace: 'surprise_peace' };
export const OWN_DISHES: readonly ItemId[] = Object.values(OWN);
/** The own dish's page in the book of recipes and its row in «Зміст гри»: one for them all. */
export const OWN_PAGE = { id: 'own', name: 'Власна страва', dish: OWN.peace, line: 'recipe_own' as LineId };

/** Every dish: the book's and the own ones (never album stickers among the finds). */
export const DISHES: ReadonlySet<string> = new Set([...(Object.values(RECIPES) as RecipeCard[]).map((r) => r.dish), ...OWN_DISHES]);

/** The book for the hostess at home: all sixteen, hers first. */
export const bookOf = (host: Host): RecipeCard[] => [...recipesOf(host), ...(Object.values(RECIPES) as RecipeCard[]).filter((r) => r.host !== host)];

/** Every product the recipes ask for. */
export const PRODUCTS: readonly ItemId[] = ['cherry', 'potato', 'carrot', 'mushroom_brown', 'apple', 'honey', 'egg'];

export const COOK = {
  /** How close to the stove the pot piece breathes. */
  near: 2.6,
  /** Products in the pot: at least one before the spoon, three slots. */
  least: 1,
  most: 3,
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

/** A mix as a key that does not care about order (`save.kitchen.own`). */
export const mixKey = (products: readonly ItemId[]): string => [...products].sort().join('+');

/** The recipe these products make, as a multiset (order does not matter), or none. */
export function matchRecipe(products: readonly ItemId[]): RecipeCard | null {
  const key = mixKey(products);
  return (Object.values(RECIPES) as RecipeCard[]).find((r) => mixKey(r.needs) === key) ?? null;
}

/** The own dish: the power most products give; a tie goes to the one dropped first. */
export function surpriseOf(products: readonly ItemId[]): ItemId {
  const count = new Map<Power, number>();
  const order: Power[] = [];
  for (const id of products) {
    const g = (ITEMS[id] as ItemCard).gives;
    if (!g) continue;
    if (!count.has(g)) order.push(g);
    count.set(g, (count.get(g) ?? 0) + 1);
  }
  let best: Power = order[0] ?? 'peace';
  for (const g of order) if (count.get(g)! > count.get(best)!) best = g;
  return OWN[best];
}

/** How far a mix is from a recipe: what is missing plus what is extra. */
function distance(r: RecipeCard, products: readonly ItemId[]): { miss: number; extra: number } {
  const left = [...products];
  let miss = 0;
  for (const n of r.needs) {
    const i = left.indexOf(n);
    if (i < 0) miss++;
    else left.splice(i, 1);
  }
  return { miss, extra: left.length };
}

/** The recipe nearest to what went in (Пупся's hint after an own dish): fewest changes, then fewest taken out, then book order. */
export function hintFor(products: readonly ItemId[]): RecipeCard {
  let best: RecipeCard = RECIPES[RECIPE_ORDER[0]];
  let score = Infinity;
  for (const id of RECIPE_ORDER) {
    const r: RecipeCard = RECIPES[id];
    const d = distance(r, products);
    const s = (d.miss + d.extra) * 10 + d.extra;
    if (s < score) {
      score = s;
      best = r;
    }
  }
  return best;
}

/** A product in the pantry plate, in the voice of the hostess at home: its name, or the first time she sees it, a simple fact. */
const voiceOf = (host: Host) => (host === 'olia' ? 'olia' : 'babusia');
export const nameLine = (host: Host, item: ItemId) => `${voiceOf(host)}_cook_name_${item}` as LineId;
export const factLine = (host: Host, item: ItemId) => `${voiceOf(host)}_fact_${item}` as LineId;
export const factKey = (host: Host, item: ItemId) => `${host}:${item}`;
/** Nothing at all in the pantry: what to bring. */
export const emptyLine = (host: Host) => `${voiceOf(host)}_cook_empty` as LineId;
/** A pale card in the book: Пупся says what is short. */
export const missLine = (item: ItemId) => `cook_miss_${item}` as LineId;
export const hintLine = (r: RecipeCard) => `cook_hint_${r.id}` as LineId;

/** The hostess's morning product, in turn: her own come round first (eggs often at Оля's, she cooks with them most). */
const PANTRY: Record<Host, readonly ItemId[]> = {
  yulia: ['cherry', 'potato', 'carrot', 'apple', 'mushroom_brown', 'egg', 'honey'],
  olia: ['egg', 'honey', 'carrot', 'egg', 'apple', 'cherry'],
};

export const pantryOf = (host: Host, day: number): ItemId => PANTRY[host][day % PANTRY[host].length];

/** Each of the six taps on the spoon is someone's act, in turn. */
export const STIR_ACTS = ['lyosha', 'solomiia', 'david', 'pupsia'] as const;
export const stirActOf = (tap: number) => STIR_ACTS[tap % STIR_ACTS.length];
