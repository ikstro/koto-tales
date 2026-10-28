/**
 * Block registry. The numeric ids are stored in saves (world edits), so an id
 * never changes meaning once shipped — new blocks are appended at the end.
 *
 * Colours are the base tint of each face and `surface` says what it is made of;
 * the active skin (src/render/skins) turns both into a look.
 */

export const B = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WATER: 5,
  LOG: 6,
  LEAVES: 7,
  SNOW: 8,
  PLANKS: 9,
  BRICK: 10,
  GLASS: 11,
  COBBLE: 12,
  ROOF: 13,
  RED: 14,
  ORANGE: 15,
  YELLOW: 16,
  GREEN: 17,
  BLUE: 18,
  PURPLE: 19,
  PINK: 20,
  WHITE: 21,
  BLACK: 22,
  BROWN: 23,
  LANTERN: 24,
  GOLD: 25,
  BED: 26,
} as const;

export type BlockId = (typeof B)[keyof typeof B];

/**
 * What a face is made of. Each skin decides how a surface looks: the pixel
 * skin draws a 16×16 texture, the toy skin a glossy brick, the hybrid keeps
 * natural surfaces pixel and makes built ones plastic.
 */
export type Surface =
  | 'earth'
  | 'grass' // grass seen from above
  | 'grass-side' // earth with a green fringe on top
  | 'sand'
  | 'stone'
  | 'snow'
  | 'bark' // log sides
  | 'wood-rings' // log ends
  | 'leaves'
  | 'planks'
  | 'brick'
  | 'cobble'
  | 'roof'
  | 'plastic' // the coloured building palette
  | 'glass'
  | 'water'
  | 'lantern'
  | 'gold';

/** Surfaces that grow by themselves; everything else was built by someone. */
export const NATURAL_SURFACES: ReadonlySet<Surface> = new Set<Surface>([
  'earth',
  'grass',
  'grass-side',
  'sand',
  'stone',
  'snow',
  'bark',
  'wood-rings',
  'leaves',
  'water',
]);

export interface FaceLook {
  color: string;
  surface: Surface;
}

export interface BlockDef {
  id: BlockId;
  /** Ukrainian name, for the build palette and debug. */
  name: string;
  top: FaceLook;
  side: FaceLook;
  bottom: FaceLook;
  /** Entities collide with it. */
  solid: boolean;
  /** Rendered in the see-through pass and does not hide neighbour faces. */
  transparent: boolean;
  /** Gives off light at night (rendered unshaded). */
  glow?: boolean;
  /** Shown in the kid's build palette. */
  buildable?: boolean;
}

const f = (color: string, surface: Surface): FaceLook => ({ color, surface });
const same = (look: FaceLook) => ({ top: look, side: look, bottom: look });

export const BLOCKS: Record<number, BlockDef> = {
  [B.AIR]: { id: B.AIR, name: 'повітря', ...same(f('#000000', 'earth')), solid: false, transparent: true },
  [B.GRASS]: {
    id: B.GRASS,
    name: 'трава',
    top: f('#6cbf4a', 'grass'),
    side: f('#8b6a3e', 'grass-side'),
    bottom: f('#8b6a3e', 'earth'),
    solid: true,
    transparent: false,
  },
  [B.DIRT]: { id: B.DIRT, name: 'земля', ...same(f('#8b6a3e', 'earth')), solid: true, transparent: false },
  [B.STONE]: { id: B.STONE, name: 'камінь', ...same(f('#8e8e8e', 'stone')), solid: true, transparent: false },
  [B.SAND]: { id: B.SAND, name: 'пісок', ...same(f('#e3d39a', 'sand')), solid: true, transparent: false },
  [B.WATER]: { id: B.WATER, name: 'вода', ...same(f('#3d7fd9', 'water')), solid: false, transparent: true },
  [B.LOG]: {
    id: B.LOG,
    name: 'колода',
    top: f('#b08a55', 'wood-rings'),
    side: f('#6b4a2b', 'bark'),
    bottom: f('#b08a55', 'wood-rings'),
    solid: true,
    transparent: false,
    buildable: true,
  },
  [B.LEAVES]: { id: B.LEAVES, name: 'листя', ...same(f('#3f9a3a', 'leaves')), solid: true, transparent: false },
  [B.SNOW]: { id: B.SNOW, name: 'сніг', ...same(f('#f4f8fb', 'snow')), solid: true, transparent: false },
  [B.PLANKS]: { id: B.PLANKS, name: 'дошки', ...same(f('#c19a5b', 'planks')), solid: true, transparent: false, buildable: true },
  [B.BRICK]: { id: B.BRICK, name: 'цегла', ...same(f('#b5523b', 'brick')), solid: true, transparent: false, buildable: true },
  [B.GLASS]: { id: B.GLASS, name: 'скло', ...same(f('#cfeefc', 'glass')), solid: true, transparent: true, buildable: true },
  [B.COBBLE]: { id: B.COBBLE, name: 'бруківка', ...same(f('#7d7d7d', 'cobble')), solid: true, transparent: false, buildable: true },
  [B.ROOF]: { id: B.ROOF, name: 'черепиця', ...same(f('#c0392b', 'roof')), solid: true, transparent: false, buildable: true },
  [B.RED]: { id: B.RED, name: 'червоний', ...same(f('#e53935', 'plastic')), solid: true, transparent: false, buildable: true },
  [B.ORANGE]: { id: B.ORANGE, name: 'помаранчевий', ...same(f('#fb8c00', 'plastic')), solid: true, transparent: false, buildable: true },
  [B.YELLOW]: { id: B.YELLOW, name: 'жовтий', ...same(f('#fdd835', 'plastic')), solid: true, transparent: false, buildable: true },
  [B.GREEN]: { id: B.GREEN, name: 'зелений', ...same(f('#43a047', 'plastic')), solid: true, transparent: false, buildable: true },
  [B.BLUE]: { id: B.BLUE, name: 'синій', ...same(f('#1e88e5', 'plastic')), solid: true, transparent: false, buildable: true },
  [B.PURPLE]: { id: B.PURPLE, name: 'фіолетовий', ...same(f('#8e24aa', 'plastic')), solid: true, transparent: false, buildable: true },
  [B.PINK]: { id: B.PINK, name: 'рожевий', ...same(f('#f06292', 'plastic')), solid: true, transparent: false, buildable: true },
  [B.WHITE]: { id: B.WHITE, name: 'білий', ...same(f('#f5f5f5', 'plastic')), solid: true, transparent: false, buildable: true },
  [B.BLACK]: { id: B.BLACK, name: 'чорний', ...same(f('#263238', 'plastic')), solid: true, transparent: false, buildable: true },
  [B.BROWN]: { id: B.BROWN, name: 'коричневий', ...same(f('#795548', 'plastic')), solid: true, transparent: false, buildable: true },
  [B.LANTERN]: {
    id: B.LANTERN,
    name: 'ліхтар',
    ...same(f('#ffd54f', 'lantern')),
    solid: true,
    transparent: false,
    glow: true,
    buildable: true,
  },
  [B.GOLD]: { id: B.GOLD, name: 'золото', ...same(f('#ffca28', 'gold')), solid: true, transparent: false, buildable: true },
  [B.BED]: {
    id: B.BED,
    name: 'ліжко',
    top: f('#e53935', 'plastic'),
    side: f('#c19a5b', 'planks'),
    bottom: f('#c19a5b', 'planks'),
    solid: true,
    transparent: false,
  },
};

export const blockDef = (id: number): BlockDef => BLOCKS[id] ?? BLOCKS[B.AIR];

/** Order of the kid's build palette. */
export const BUILD_PALETTE: BlockId[] = [
  B.RED,
  B.ORANGE,
  B.YELLOW,
  B.GREEN,
  B.BLUE,
  B.PURPLE,
  B.PINK,
  B.WHITE,
  B.PLANKS,
  B.BRICK,
  B.GLASS,
  B.LANTERN,
];
