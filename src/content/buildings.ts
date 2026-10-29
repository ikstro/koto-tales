import { B } from '../world/blocks';
import type { LineId } from './lines';

/**
 * Ready-made buildings in the kit box (DESIGN.md «Kit»). A building is a card:
 * its footprint, the cells bodies bump into, how many come with an unlock and
 * the line said the first time one goes up. Its model lives in
 * src/assets/buildings.ts; the ground under it is never changed.
 */

export type BuildingId =
  | 'tent'
  | 'boombox'
  | 'lantern'
  | 'windmill'
  | 'pole'
  | 'lamp'
  | 'solar'
  | 'battery'
  | 'generator'
  | 'bigspeaker'
  | 'dancefloor'
  | 'discoball'
  | 'djconsole'
  | 'tesla'
  | 'trafficlight'
  | 'garland'
  | 'carousel'
  | 'searchlight'
  | 'trampoline'
  | 'treehouse'
  | 'golem'
  | 'robohelper'
  | 'saucer'
  | 'wifi'
  | 'transmitter'
  | 'radar'
  | 'picnic'
  | 'icecream'
  | 'swings'
  | 'station';

/**
 * What a building does in the power network (DESIGN.md «Power»): buildings closer than
 * `REACH` join by themselves. Numbers are «sparks» a second.
 */
export interface PowerCard {
  /** Given all the time. */
  give?: number;
  /** Given in full sun, times the daylight. */
  solar?: number;
  /** Taken while it works. */
  take?: number;
  /** A battery: how much it holds (sparks × seconds). */
  store?: number;
  /** At night no monster appears this close to it while it works (blocks). */
  light?: number;
  /** Joins what stands this close instead of REACH (a castle's machine is big). */
  reach?: number;
  /** Its links are crackling arcs instead of sagging wires (the power station: its reach is long). */
  arcs?: boolean;
}

export interface BuildingCard {
  id: BuildingId;
  /** Ukrainian name, for debug and the parents' captions. */
  name: string;
  /** Footprint in blocks across (x) and deep (z) before turning; the front faces +z. */
  size: [number, number];
  /** Cells bodies bump into: (dx, dz) from the footprint's min corner, `h` blocks tall. */
  solid: { dx: number; dz: number; h: number }[];
  /** How many the kit holds at the start; null = never runs out. */
  count: number | null;
  /** HUD sprite of the piece in the kit plate. */
  sprite: string;
  /** Said the first time one is put up. */
  firstLine?: LineId;
  /** Spoken when one more comes out of the kit as a reward. */
  rewardLine?: LineId;
  /** The lantern is a block in the world (it cracks the boss's armour), not a model. */
  block?: number;
  /** Plays music around itself while it stands (and has power, if it needs it): heard this far, monsters this close dance. */
  music?: { hear: number; dance: number };
  /** Heroes on it dance (a dance floor). */
  floor?: boolean;
  /** A DJ console: next to it a note piece switches the song. */
  dj?: boolean;
  /** Strikes the nearest monster this close every `every` seconds (a tesla tower). */
  zap?: { reach: number; every: number };
  /** Monsters this close stop on its red light (a traffic light). */
  traffic?: { reach: number };
  /** A carousel: heroes on it ride round and their hearts come back fast. */
  ride?: boolean;
  /** A searchlight: at night its beam sweeps this far; a monster caught in it freezes for `freeze` seconds. */
  beam?: { reach: number; freeze: number };
  /** A trampoline: heroes on it bounce this many blocks up. */
  bounce?: { height: number };
  /** Heroes may sleep in it at night. */
  sleep?: boolean;
  /** A shelter (the tree house): at night no monster appears within `calm`; within `heal` hearts come back fast. */
  shelter?: { calm: number; heal: number };
  /** A golem: the nearest monster this close gets a ground slam every `every` seconds. */
  slam?: { reach: number; every: number; damage: number };
  /** Walks with the party as a helper (the robot): shoots the nearest monster this close. */
  follow?: { reach: number };
  /** A flying saucer: next to it a «fly» piece opens the big map to pick where to land. */
  fly?: boolean;
  /** A Wi-Fi antenna: while it works, its signal reaches this far (blocks). */
  signal?: { zone: number };
  /** A transmitter pad: the party standing on a working one can jump to another working pad. */
  jump?: boolean;
  /** A radar: while it works, the map opens this far around it (blocks). */
  scan?: { radius: number };
  /** Food (a picnic, an ice-cream kiosk): next to it the party sits down to eat and their hearts fill; `fast` = seconds of fast running after. */
  food?: { fast?: number };
  /** Swings: a hero standing still on a seat swings, and the lightning charges faster. */
  swing?: boolean;
  power?: PowerCard;
}

export const BUILDINGS: Record<BuildingId, BuildingCard> = {
  tent: {
    id: 'tent',
    name: 'Намет',
    size: [3, 3],
    solid: [],
    count: 1,
    sprite: 'b-tent',
    firstLine: 'first_tent',
    rewardLine: 'reward_tent',
    sleep: true,
  },
  boombox: {
    id: 'boombox',
    name: 'Колонка',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 1 }],
    count: 1,
    sprite: 'b-boombox',
    firstLine: 'first_boombox',
    rewardLine: 'reward_boombox',
    music: { hear: 18, dance: 9 },
  },
  lantern: {
    id: 'lantern',
    name: 'Ліхтар',
    size: [1, 1],
    solid: [],
    count: null,
    sprite: 'brick-24',
    block: B.LANTERN,
  },
  windmill: {
    id: 'windmill',
    name: 'Вітряк',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 4 }],
    count: 0,
    sprite: 'b-windmill',
    firstLine: 'first_windmill',
    rewardLine: 'reward_windmill_more',
    power: { give: 2 },
  },
  pole: {
    id: 'pole',
    name: 'Стовп',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 3 }],
    count: 0,
    sprite: 'b-pole',
    firstLine: 'first_pole',
    rewardLine: 'reward_poles',
    power: {},
  },
  lamp: {
    id: 'lamp',
    name: 'Ліхтар на стовпі',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 3 }],
    count: 0,
    sprite: 'b-lamp',
    firstLine: 'first_lamp',
    rewardLine: 'reward_lamp_more',
    power: { take: 1, light: 8 },
  },
  solar: {
    id: 'solar',
    name: 'Сонячна панель',
    size: [2, 2],
    solid: [
      { dx: 0, dz: 0, h: 1 },
      { dx: 1, dz: 0, h: 1 },
      { dx: 0, dz: 1, h: 1 },
      { dx: 1, dz: 1, h: 1 },
    ],
    count: 0,
    sprite: 'b-solar',
    firstLine: 'first_solar',
    rewardLine: 'reward_solar_more',
    power: { solar: 3 },
  },
  battery: {
    id: 'battery',
    name: 'Акумулятор',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 2 }],
    count: 0,
    sprite: 'b-battery',
    firstLine: 'first_battery',
    rewardLine: 'reward_battery',
    power: { store: 200 },
  },
  generator: {
    id: 'generator',
    name: 'Двигун-генератор',
    size: [2, 2],
    solid: [
      { dx: 0, dz: 0, h: 2 },
      { dx: 1, dz: 0, h: 2 },
      { dx: 0, dz: 1, h: 2 },
      { dx: 1, dz: 1, h: 2 },
    ],
    count: 0,
    sprite: 'b-generator',
    firstLine: 'first_generator',
    rewardLine: 'reward_generator',
    power: { give: 6 },
  },
  // stage B2: disco and defence
  bigspeaker: {
    id: 'bigspeaker',
    name: 'Велика колонка',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 3 }],
    count: 0,
    sprite: 'b-bigspeaker',
    firstLine: 'first_bigspeaker',
    rewardLine: 'reward_bigspeaker_more',
    music: { hear: 30, dance: 14 },
    power: { take: 2 },
  },
  dancefloor: {
    id: 'dancefloor',
    name: 'Танцпол',
    size: [3, 3],
    solid: [],
    count: 0,
    sprite: 'b-dancefloor',
    firstLine: 'first_dancefloor',
    rewardLine: 'reward_dancefloor',
    floor: true,
    power: { take: 2 },
  },
  discoball: {
    id: 'discoball',
    name: 'Диско-куля',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 3 }],
    count: 0,
    sprite: 'b-discoball',
    firstLine: 'first_discoball',
    rewardLine: 'reward_discoball',
    power: { take: 1 },
  },
  djconsole: {
    id: 'djconsole',
    name: 'Пульт діджея',
    size: [2, 1],
    solid: [
      { dx: 0, dz: 0, h: 1 },
      { dx: 1, dz: 0, h: 1 },
    ],
    count: 0,
    sprite: 'b-djconsole',
    firstLine: 'first_djconsole',
    rewardLine: 'reward_djconsole',
    dj: true,
    power: { take: 1 },
  },
  tesla: {
    id: 'tesla',
    name: 'Тесла-вежа',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 4 }],
    count: 0,
    sprite: 'b-tesla',
    firstLine: 'first_tesla',
    rewardLine: 'reward_tesla_more',
    zap: { reach: 7, every: 1.3 },
    power: { take: 3 },
  },
  trafficlight: {
    id: 'trafficlight',
    name: 'Світлофор',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 3 }],
    count: 0,
    sprite: 'b-trafficlight',
    firstLine: 'first_trafficlight',
    rewardLine: 'reward_trafficlight_more',
    traffic: { reach: 9 },
    power: { take: 1 },
  },
  // stage C1: the villages' prizes, one per race
  garland: {
    id: 'garland',
    name: 'Гірлянда',
    size: [3, 1],
    solid: [
      { dx: 0, dz: 0, h: 3 },
      { dx: 2, dz: 0, h: 3 },
    ],
    count: 0,
    sprite: 'b-garland',
    firstLine: 'first_garland',
    power: { take: 1, light: 6 },
  },
  carousel: {
    id: 'carousel',
    name: 'Карусель',
    size: [3, 3],
    solid: [],
    count: 0,
    sprite: 'b-carousel',
    firstLine: 'first_carousel',
    ride: true,
    power: { take: 2 },
  },
  searchlight: {
    id: 'searchlight',
    name: 'Прожектор',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 2 }],
    count: 0,
    sprite: 'b-searchlight',
    firstLine: 'first_searchlight',
    beam: { reach: 14, freeze: 3 },
    power: { take: 2 },
  },
  trampoline: {
    id: 'trampoline',
    name: 'Батут',
    size: [2, 2],
    solid: [],
    count: 0,
    sprite: 'b-trampoline',
    firstLine: 'first_trampoline',
    bounce: { height: 8 },
  },
  // stage C2: the castles' prizes, one per race
  treehouse: {
    id: 'treehouse',
    name: 'Дерево-хатинка',
    size: [3, 3],
    solid: [{ dx: 1, dz: 1, h: 2 }],
    count: 0,
    sprite: 'b-treehouse',
    firstLine: 'first_treehouse',
    sleep: true,
    shelter: { calm: 10, heal: 6 },
  },
  golem: {
    id: 'golem',
    name: "Кам'яний голем",
    size: [2, 2],
    solid: [
      { dx: 0, dz: 0, h: 2 },
      { dx: 1, dz: 0, h: 2 },
      { dx: 0, dz: 1, h: 2 },
      { dx: 1, dz: 1, h: 2 },
    ],
    count: 0,
    sprite: 'b-golem',
    firstLine: 'first_golem',
    slam: { reach: 8, every: 2, damage: 2 },
  },
  robohelper: {
    id: 'robohelper',
    name: 'Робот-помічник',
    size: [1, 1],
    solid: [],
    count: 0,
    sprite: 'b-robohelper',
    firstLine: 'first_robohelper',
    follow: { reach: 10 },
  },
  saucer: {
    id: 'saucer',
    name: 'Літаюча тарілка',
    size: [3, 3],
    solid: [
      { dx: 0, dz: 0, h: 2 },
      { dx: 1, dz: 0, h: 2 },
      { dx: 2, dz: 0, h: 2 },
      { dx: 0, dz: 1, h: 2 },
      { dx: 1, dz: 1, h: 2 },
      { dx: 2, dz: 1, h: 2 },
      { dx: 0, dz: 2, h: 2 },
      { dx: 1, dz: 2, h: 2 },
      { dx: 2, dz: 2, h: 2 },
    ],
    count: 0,
    sprite: 'b-saucer',
    firstLine: 'first_saucer',
    fly: true,
  },
  // stage D1 «Сигнал»: the signal buildings
  wifi: {
    id: 'wifi',
    name: 'Wi-Fi антена',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 4 }],
    count: 0,
    sprite: 'b-wifi',
    firstLine: 'first_wifi',
    rewardLine: 'reward_wifi',
    signal: { zone: 12 },
    power: { take: 1 },
  },
  transmitter: {
    id: 'transmitter',
    name: 'Передавач',
    size: [3, 3],
    solid: [],
    count: 0,
    sprite: 'b-transmitter',
    firstLine: 'first_transmitter',
    rewardLine: 'reward_transmitters',
    jump: true,
    power: { take: 1 },
  },
  radar: {
    id: 'radar',
    name: 'Радар',
    size: [2, 2],
    solid: [
      { dx: 0, dz: 0, h: 3 },
      { dx: 1, dz: 0, h: 3 },
      { dx: 0, dz: 1, h: 3 },
      { dx: 1, dz: 1, h: 3 },
    ],
    count: 0,
    sprite: 'b-radar',
    firstLine: 'first_radar',
    rewardLine: 'reward_radar',
    scan: { radius: 48 },
    power: { take: 2 },
  },
  // stage D2 «Їжа і решта»
  picnic: {
    id: 'picnic',
    name: 'Пікнік',
    size: [3, 3],
    solid: [],
    count: 0,
    sprite: 'b-picnic',
    firstLine: 'first_picnic',
    rewardLine: 'reward_picnic',
    food: {},
  },
  icecream: {
    id: 'icecream',
    name: 'Кіоск з морозивом',
    // the kiosk along the back row; two stools and the cat's spot at its counter in front
    size: [3, 2],
    solid: [
      { dx: 0, dz: 0, h: 2 },
      { dx: 1, dz: 0, h: 2 },
      { dx: 2, dz: 0, h: 2 },
    ],
    count: 0,
    sprite: 'b-icecream',
    firstLine: 'first_icecream',
    rewardLine: 'reward_icecream',
    food: { fast: 20 },
    power: { take: 1 },
  },
  swings: {
    id: 'swings',
    name: 'Гойдалка',
    size: [4, 1],
    solid: [
      { dx: 0, dz: 0, h: 3 },
      { dx: 3, dz: 0, h: 3 },
    ],
    count: 0,
    sprite: 'b-swings',
    firstLine: 'first_swings',
    rewardLine: 'reward_swings',
    swing: true,
  },
  station: {
    id: 'station',
    name: 'Електростанція',
    size: [3, 3],
    solid: [
      { dx: 0, dz: 0, h: 3 },
      { dx: 1, dz: 0, h: 3 },
      { dx: 2, dz: 0, h: 3 },
      { dx: 0, dz: 1, h: 3 },
      { dx: 1, dz: 1, h: 3 },
      { dx: 2, dz: 1, h: 3 },
      { dx: 0, dz: 2, h: 3 },
      { dx: 1, dz: 2, h: 3 },
      { dx: 2, dz: 2, h: 3 },
    ],
    count: 0,
    sprite: 'b-station',
    firstLine: 'first_station',
    rewardLine: 'reward_station',
    power: { give: 20, reach: 24, arcs: true },
  },
};

/** A lighthouse by the water (world/landmarks.ts) in the power network. */
export const LIGHTHOUSE_POWER: PowerCard = { take: 2, light: 16 };

/** Order of the kit plate. */
export const KIT_ORDER: BuildingId[] = [
  'tent',
  'boombox',
  'lantern',
  'windmill',
  'pole',
  'lamp',
  'solar',
  'battery',
  'generator',
  'bigspeaker',
  'dancefloor',
  'discoball',
  'djconsole',
  'tesla',
  'trafficlight',
  'garland',
  'carousel',
  'searchlight',
  'trampoline',
  'treehouse',
  'golem',
  'robohelper',
  'saucer',
  'wifi',
  'transmitter',
  'radar',
  'picnic',
  'icecream',
  'swings',
  'station',
];

/** The boombox's music (the smallest speaker): how far it carries and how close monsters dance. */
export const MUSIC = { hear: 18, dance: 9 };

/** The traffic light's cycle in seconds: green, yellow, red. */
export const TRAFFIC = { green: 6, yellow: 1.5, red: 6 };
