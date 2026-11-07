import { B } from '../world/blocks';
import type { LineId } from './lines';
import type { SpeakerSong } from './music';

/**
 * Ready-made buildings in the kit box (DESIGN.md «Kit»). A building is a card:
 * its footprint, the cells bodies bump into, how many come with an unlock and
 * the line said the first time one goes up. Its model lives in
 * src/assets/buildings.ts; the ground under it is never changed.
 */


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

/** The kit plate's picture tabs (DESIGN.md «Kit»): which shelf a building sits on. */
export const KIT_TABS = ['home', 'music', 'power', 'nature', 'fun'] as const;
export type KitTab = (typeof KIT_TABS)[number];

/** What a tap on a standing building does (systems/gadgets.ts). */
export type TapKind = 'drum' | 'weather' | 'cinema' | 'fireworks' | 'surprise' | 'telescope';

/** A card, with its id typed loosely while the cards are being read (`BuildingCard` is the strict one). */
interface Card<Id extends string = string> {
  /** The same as its key in BUILDINGS. */
  id: Id;
  /** Ukrainian name, for debug and the parents' captions. */
  name: string;
  /** What it does, one sentence for the parents (the «Зміст гри» page). */
  about: string;
  /** Footprint in blocks across (x) and deep (z) before turning; the front faces +z. */
  size: [number, number];
  /** Cells bodies bump into: (dx, dz) from the footprint's min corner, `h` blocks tall. */
  solid: { dx: number; dz: number; h: number }[];
  /** How many the kit holds at the start; null = never runs out. */
  count: number | null;
  /** HUD sprite of the piece in the kit plate. */
  sprite: string;
  /** Which picture tab of the kit plate it sits on. */
  tab: KitTab;
  /** Said the first time one is put up. */
  firstLine?: LineId;
  /** Spoken when one more comes out of the kit as a reward. */
  rewardLine?: LineId;
  /** The lantern is a block in the world (it cracks the boss's armour), not a model. */
  block?: number;
  /**
   * Plays music around itself while it stands (and has power, if it needs it): heard this far,
   * monsters this close dance; its own song (src/content/music.ts) and how loud it is close by
   * (the bigger, the louder).
   */
  music?: { hear: number; dance: number; song: SpeakerSong; loud: number };
  /** Heroes on it dance (a dance floor). */
  floor?: boolean;
  /** A DJ console: next to it a note piece switches the song. */
  dj?: boolean;
  /** Strikes the nearest monster this close every `every` seconds (a tesla tower). */
  zap?: { reach: number; every: number };
  /** Monsters this close stop on its red light (a traffic light). */
  traffic?: { reach: number };
  /**
   * A ride (a carousel, a train): heroes standing still within `on` blocks of its centre take its
   * seats and ride (the model moves the seats); their hearts come back fast; a step gets off.
   */
  ride?: { on: number };
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
  /** Swings: a hero standing still on a seat swings this far (`arc` radians, `pace`), and the lightning charges `rate` times as fast. */
  swing?: { arc: number; pace: number; rate: number };
  /** Every `every` seconds monsters this close are thrown back (`wind`: a steady wind, not a bass blow). */
  blast?: { reach: number; every: number; push: number; wind?: boolean };
  /** A karaoke stage: standing still on it the whole party sings. */
  stage?: boolean;
  /** A tap on the building itself does this (it must be close: on screen, near the hero). */
  tap?: TapKind;
  /** Piano keys on the ground: a step on one plays its note. */
  keys?: boolean;
  /** Thick smoke: a monster this close does not see the heroes. */
  fog?: { reach: number };
  /** A hero standing still on it pedals: the network gets `give` sparks while they do. */
  pedal?: { give: number };
  /** Stands only at the water's edge. */
  water?: boolean;
  /** The child's lightning within `reach` fills the batteries of its network by `charge`. */
  rod?: { reach: number; charge: number };
  /** Shoots at the nearest monster this close every `every` seconds. */
  turret?: { reach: number; every: number };
  /** Catches the nearest monster this close in a bubble every `every` seconds: it waits `hold` seconds. */
  bubble?: { reach: number; every: number; hold: number };
  /** A monster this close is taken in and comes out as coins, one every `every` seconds. */
  wash?: { reach: number; every: number };
  /** Lies across water, from bank to bank; the party walks over it. */
  span?: boolean;
  /** A hero standing still on it rides it at `speed` times their run; the jump gets off. */
  mount?: { speed: number };
  /** Every morning one of this item lies next to it. */
  daily?: { item: string };
  /** A knight-puzzle board of `board`×`board` one-block cells (the chess kingdom's prize, systems/chess.ts):
   *  the cells the knight may jump to glow, the hero steps onto one and it hops there; reaching the coin
   *  gives it (CHESS.bigADay a day). */
  board?: number;
  power?: PowerCard;
}

const CARDS = {
  tent: {
    id: 'tent',
    name: 'Намет',
    about: 'Уночі в ньому можна поспати — і настане ранок, а сердечка повні.',
    size: [3, 3],
    solid: [],
    count: 1,
    sprite: 'b-tent',
    tab: 'home',
    firstLine: 'first_tent',
    rewardLine: 'reward_tent',
    sleep: true,
  },
  doghouse: {
    id: 'doghouse',
    name: 'Будка',
    about: 'Дім для Сірка: пес живе біля будки й стереже дім від монстрів.',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 1 }],
    count: 0,
    sprite: 'b-doghouse',
    tab: 'home',
    firstLine: 'first_doghouse',
    rewardLine: 'reward_doghouse',
  },
  boombox: {
    id: 'boombox',
    name: 'Колонка',
    about: 'Тихенько грає диско без струму. Монстри поруч танцюють і не кусаються.',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 1 }],
    count: 1,
    sprite: 'b-boombox',
    tab: 'music',
    firstLine: 'first_boombox',
    rewardLine: 'reward_boombox',
    music: { hear: 18, dance: 9, song: 'disco', loud: 0.8 },
  },
  lantern: {
    id: 'lantern',
    name: 'Ліхтар',
    about: 'Ніколи не закінчується. Ліхтарі біля Пожирача тріскають його кам’яну броню.',
    size: [1, 1],
    solid: [],
    count: null,
    sprite: 'brick-24',
    tab: 'home',
    block: B.LANTERN,
  },
  fish: {
    id: 'fish',
    name: 'Рибка',
    about: 'Ніколи не закінчується. Поклади рибку на берег озера — Шелохмаське чудовисько випливе за нею.',
    size: [1, 1],
    solid: [],
    count: null,
    sprite: 'b-fish',
    tab: 'home',
  },
  windmill: {
    id: 'windmill',
    name: 'Вітряк',
    about: 'Завжди дає струм (+2). Постав поруч стовп, ліхтар або маяк.',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 4 }],
    count: 0,
    sprite: 'b-windmill',
    tab: 'power',
    firstLine: 'first_windmill',
    rewardLine: 'reward_windmill_more',
    power: { give: 2 },
  },
  pole: {
    id: 'pole',
    name: 'Стовп',
    about: 'Несе струм далі: стовпи поруч з’єднуються дротами самі.',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 3 }],
    count: 0,
    sprite: 'b-pole',
    tab: 'power',
    firstLine: 'first_pole',
    rewardLine: 'reward_poles',
    power: {},
  },
  lamp: {
    id: 'lamp',
    name: 'Ліхтар на стовпі',
    about: 'Бере трохи струму (−1). Уночі поруч не з’являються монстри.',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 3 }],
    count: 0,
    sprite: 'b-lamp',
    tab: 'power',
    firstLine: 'first_lamp',
    rewardLine: 'reward_lamp_more',
    power: { take: 1, light: 8 },
  },
  solar: {
    id: 'solar',
    name: 'Сонячна панель',
    about: 'Дає струм удень (+3), а вночі спить.',
    size: [2, 2],
    solid: [
      { dx: 0, dz: 0, h: 1 },
      { dx: 1, dz: 0, h: 1 },
      { dx: 0, dz: 1, h: 1 },
      { dx: 1, dz: 1, h: 1 },
    ],
    count: 0,
    sprite: 'b-solar',
    tab: 'power',
    firstLine: 'first_solar',
    rewardLine: 'reward_solar_more',
    power: { solar: 3 },
  },
  battery: {
    id: 'battery',
    name: 'Акумулятор',
    about: 'Збирає зайвий струм і віддає, коли бракує, — наприклад, уночі.',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 2 }],
    count: 0,
    sprite: 'b-battery',
    tab: 'power',
    firstLine: 'first_battery',
    rewardLine: 'reward_battery',
    power: { store: 200 },
  },
  generator: {
    id: 'generator',
    name: 'Двигун-генератор',
    about: 'Завжди дає багато струму (+6) і тихо туркоче.',
    size: [2, 2],
    solid: [
      { dx: 0, dz: 0, h: 2 },
      { dx: 1, dz: 0, h: 2 },
      { dx: 0, dz: 1, h: 2 },
      { dx: 1, dz: 1, h: 2 },
    ],
    count: 0,
    sprite: 'b-generator',
    tab: 'power',
    firstLine: 'first_generator',
    rewardLine: 'reward_generator',
    power: { give: 6 },
  },
  // stage B2: disco and defence
  bigspeaker: {
    id: 'bigspeaker',
    name: 'Велика колонка',
    about: 'Гучно грає рок на струмі: її чути найдалі, монстри навколо танцюють.',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 3 }],
    count: 0,
    sprite: 'b-bigspeaker',
    tab: 'music',
    firstLine: 'first_bigspeaker',
    rewardLine: 'reward_bigspeaker_more',
    music: { hear: 30, dance: 14, song: 'rock', loud: 1.3 },
    power: { take: 2 },
  },
  dancefloor: {
    id: 'dancefloor',
    name: 'Танцпол',
    about: 'Плитки світяться в ритм музики. Стань на нього — і герої танцюють.',
    size: [3, 3],
    solid: [],
    count: 0,
    sprite: 'b-dancefloor',
    tab: 'music',
    firstLine: 'first_dancefloor',
    rewardLine: 'reward_dancefloor',
    floor: true,
    power: { take: 2 },
  },
  discoball: {
    id: 'discoball',
    name: 'Диско-куля',
    about: 'Дзеркальна куля: уночі по землі біжать кольорові плями.',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 3 }],
    count: 0,
    sprite: 'b-discoball',
    tab: 'music',
    firstLine: 'first_discoball',
    rewardLine: 'reward_discoball',
    power: { take: 1 },
  },
  djconsole: {
    id: 'djconsole',
    name: 'Пульт діджея',
    about: 'Грає ту пісню, яку обереш: нота поруч перемикає диско, рок, веселу й колискову.',
    size: [2, 1],
    solid: [
      { dx: 0, dz: 0, h: 1 },
      { dx: 1, dz: 0, h: 1 },
    ],
    count: 0,
    sprite: 'b-djconsole',
    tab: 'music',
    firstLine: 'first_djconsole',
    rewardLine: 'reward_djconsole',
    dj: true,
    music: { hear: 24, dance: 11, song: 'dj', loud: 1 },
    power: { take: 1 },
  },
  tesla: {
    id: 'tesla',
    name: 'Тесла-вежа',
    about: 'Б’є блискавкою найближчого монстра (до 7 блоків).',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 4 }],
    count: 0,
    sprite: 'b-tesla',
    tab: 'power',
    firstLine: 'first_tesla',
    rewardLine: 'reward_tesla_more',
    zap: { reach: 7, every: 1.3 },
    power: { take: 3 },
  },
  trafficlight: {
    id: 'trafficlight',
    name: 'Світлофор',
    about: 'Коли горить червоне, монстри поруч зупиняються і чекають.',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 3 }],
    count: 0,
    sprite: 'b-trafficlight',
    tab: 'power',
    firstLine: 'first_trafficlight',
    rewardLine: 'reward_trafficlight_more',
    traffic: { reach: 9 },
    power: { take: 1 },
  },
  // stage C1: the villages' prizes, one per race
  garland: {
    id: 'garland',
    name: 'Гірлянда',
    about: 'Лампочки блимають у ритм. Уночі поруч не з’являються монстри.',
    size: [3, 1],
    solid: [
      { dx: 0, dz: 0, h: 3 },
      { dx: 2, dz: 0, h: 3 },
    ],
    count: 0,
    sprite: 'b-garland',
    tab: 'power',
    firstLine: 'first_garland',
    power: { take: 1, light: 6 },
  },
  carousel: {
    id: 'carousel',
    name: 'Карусель',
    about: 'Крутиться разом із героями; поки катаєшся, сердечка швидко повертаються.',
    size: [3, 3],
    solid: [],
    count: 0,
    sprite: 'b-carousel',
    tab: 'fun',
    firstLine: 'first_carousel',
    ride: { on: 1.45 },
    power: { take: 2 },
  },
  searchlight: {
    id: 'searchlight',
    name: 'Прожектор',
    about: 'Уночі промінь шукає монстрів; спійманий завмирає на 3 секунди.',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 2 }],
    count: 0,
    sprite: 'b-searchlight',
    tab: 'power',
    firstLine: 'first_searchlight',
    beam: { reach: 14, freeze: 3 },
    power: { take: 2 },
  },
  trampoline: {
    id: 'trampoline',
    name: 'Батут',
    about: 'Підкидає героїв на 8 блоків — згори карта відкривається ширше.',
    size: [2, 2],
    solid: [],
    count: 0,
    sprite: 'b-trampoline',
    tab: 'fun',
    firstLine: 'first_trampoline',
    bounce: { height: 8 },
  },
  // stage C2: the castles' prizes, one per race
  treehouse: {
    id: 'treehouse',
    name: 'Дерево-хатинка',
    about: 'Уночі тут можна спати; поруч безпечно, і сердечка повертаються.',
    size: [3, 3],
    solid: [{ dx: 1, dz: 1, h: 2 }],
    count: 0,
    sprite: 'b-treehouse',
    tab: 'home',
    firstLine: 'first_treehouse',
    sleep: true,
    shelter: { calm: 10, heal: 6 },
  },
  golem: {
    id: 'golem',
    name: "Кам'яний голем",
    about: 'Кам’яний друг гупає об землю біля найближчого монстра.',
    size: [2, 2],
    solid: [
      { dx: 0, dz: 0, h: 2 },
      { dx: 1, dz: 0, h: 2 },
      { dx: 0, dz: 1, h: 2 },
      { dx: 1, dz: 1, h: 2 },
    ],
    count: 0,
    sprite: 'b-golem',
    tab: 'fun',
    firstLine: 'first_golem',
    slam: { reach: 8, every: 2, damage: 2 },
  },
  robohelper: {
    id: 'robohelper',
    name: 'Робот-помічник',
    about: 'Ходить разом із героями і стріляє в монстрів.',
    size: [1, 1],
    solid: [],
    count: 0,
    sprite: 'b-robohelper',
    tab: 'fun',
    firstLine: 'first_robohelper',
    follow: { reach: 10 },
  },
  saucer: {
    id: 'saucer',
    name: 'Літаюча тарілка',
    about: 'Поруч з’являється кнопка польоту: обери на карті, куди летіти.',
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
    tab: 'fun',
    firstLine: 'first_saucer',
    fly: true,
  },
  // stage D1 «Сигнал»: the signal buildings
  wifi: {
    id: 'wifi',
    name: 'Wi-Fi антена',
    about: 'Біля антени з’являється пульт: нічне шоу з вогнями й феєрверком.',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 4 }],
    count: 0,
    sprite: 'b-wifi',
    tab: 'power',
    firstLine: 'first_wifi',
    rewardLine: 'reward_wifi',
    signal: { zone: 12 },
    power: { take: 1 },
  },
  transmitter: {
    id: 'transmitter',
    name: 'Передавач',
    about: 'Переносить героїв на інший передавач — тап по ньому на карті.',
    size: [3, 3],
    solid: [],
    count: 0,
    sprite: 'b-transmitter',
    tab: 'power',
    firstLine: 'first_transmitter',
    rewardLine: 'reward_transmitters',
    jump: true,
    power: { take: 1 },
  },
  radar: {
    id: 'radar',
    name: 'Радар',
    about: 'Розганяє хмарки на карті й знаходить села, замки та маяки.',
    size: [2, 2],
    solid: [
      { dx: 0, dz: 0, h: 3 },
      { dx: 1, dz: 0, h: 3 },
      { dx: 0, dz: 1, h: 3 },
      { dx: 1, dz: 1, h: 3 },
    ],
    count: 0,
    sprite: 'b-radar',
    tab: 'power',
    firstLine: 'first_radar',
    rewardLine: 'reward_radar',
    scan: { radius: 48 },
    power: { take: 2 },
  },
  // stage D2 «Їжа і решта»
  picnic: {
    id: 'picnic',
    name: 'Пікнік',
    about: 'Біля нього з’являється яблуко: герої їдять, і всі сердечка повні.',
    size: [3, 3],
    solid: [],
    count: 0,
    sprite: 'b-picnic',
    tab: 'home',
    firstLine: 'first_picnic',
    rewardLine: 'reward_picnic',
    food: {},
  },
  icecream: {
    id: 'icecream',
    name: 'Кіоск з морозивом',
    about: 'Морозиво: сердечка повні і 20 секунд швидкого бігу.',
    // the kiosk along the back row; two stools and the cat's spot at its counter in front
    size: [3, 2],
    solid: [
      { dx: 0, dz: 0, h: 2 },
      { dx: 1, dz: 0, h: 2 },
      { dx: 2, dz: 0, h: 2 },
    ],
    count: 0,
    sprite: 'b-icecream',
    tab: 'home',
    firstLine: 'first_icecream',
    rewardLine: 'reward_icecream',
    food: { fast: 20 },
    power: { take: 1 },
  },
  swings: {
    id: 'swings',
    name: 'Гойдалка',
    about: 'Гойдайся — і блискавка заряджається втричі швидше.',
    size: [4, 1],
    solid: [
      { dx: 0, dz: 0, h: 3 },
      { dx: 3, dz: 0, h: 3 },
    ],
    count: 0,
    sprite: 'b-swings',
    tab: 'fun',
    firstLine: 'first_swings',
    rewardLine: 'reward_swings',
    swing: { arc: 0.6, pace: 2.3, rate: 3 },
  },
  station: {
    id: 'station',
    name: 'Електростанція',
    about: 'Дуже багато струму (+20) і дістає далеко — на 24 блоки.',
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
    tab: 'power',
    firstLine: 'first_station',
    rewardLine: 'reward_station',
    power: { give: 20, reach: 24, arcs: true },
  },
  jukebox: {
    id: 'jukebox',
    name: 'Музичний автомат',
    about: 'Подарунок бабусі: грає всі диски без струму, нота поруч вмикає наступну пісню.',
    size: [2, 2],
    solid: [{ dx: 0, dz: 0, h: 2 }],
    count: 0,
    sprite: 'b-jukebox',
    tab: 'music',
    firstLine: 'first_jukebox',
    rewardLine: 'reward_jukebox',
    dj: true,
    music: { hear: 20, dance: 10, song: 'dj', loud: 0.8 },
  },
  turntable: {
    id: 'turntable',
    name: 'Платівковий програвач',
    about: 'Тихо грає диски без струму; нота поруч вмикає наступну пісню.',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 1 }],
    count: 0,
    sprite: 'b-turntable',
    tab: 'music',
    firstLine: 'first_turntable',
    rewardLine: 'reward_turntable',
    dj: true,
    music: { hear: 12, dance: 6, song: 'dj', loud: 0.5 },
  },
  speakerwall: {
    id: 'speakerwall',
    name: 'Стіна колонок',
    about: 'Найгучніша музика в грі: монстри танцюють дуже далеко. Потрібен струм (−3).',
    size: [4, 1],
    solid: [{ dx: 0, dz: 0, h: 3 }, { dx: 1, dz: 0, h: 3 }, { dx: 2, dz: 0, h: 3 }, { dx: 3, dz: 0, h: 3 }],
    count: 0,
    sprite: 'b-speakerwall',
    tab: 'music',
    firstLine: 'first_speakerwall',
    rewardLine: 'reward_speakerwall',
    music: { hear: 36, dance: 18, song: 'dj', loud: 1.3 },
    power: { take: 3 },
  },
  wheelspeaker: {
    id: 'wheelspeaker',
    name: 'Колонка на колесах',
    about: 'Сама їде за героями й грає: де герої, там і музика.',
    size: [1, 1],
    solid: [],
    count: 0,
    sprite: 'b-wheelspeaker',
    tab: 'music',
    firstLine: 'first_wheelspeaker',
    rewardLine: 'reward_wheelspeaker',
    follow: { reach: 0 },
    music: { hear: 16, dance: 8, song: 'dj', loud: 0.7 },
  },
  basscannon: {
    id: 'basscannon',
    name: 'Бас-гармата',
    about: 'Удар басу відкидає монстрів, що підійшли близько. Потрібен струм (−2).',
    size: [2, 2],
    solid: [{ dx: 0, dz: 0, h: 2 }, { dx: 0, dz: 1, h: 2 }, { dx: 1, dz: 0, h: 2 }, { dx: 1, dz: 1, h: 2 }],
    count: 0,
    sprite: 'b-basscannon',
    tab: 'music',
    firstLine: 'first_basscannon',
    rewardLine: 'reward_basscannon',
    blast: { reach: 9, every: 3, push: 13 },
    power: { take: 2 },
  },
  karaoke: {
    id: 'karaoke',
    name: 'Караоке',
    about: 'Постій на сцені — і всі герої заспівають хором. Потрібен струм (−1).',
    size: [3, 2],
    solid: [],
    count: 0,
    sprite: 'b-karaoke',
    tab: 'music',
    firstLine: 'first_karaoke',
    rewardLine: 'reward_karaoke',
    stage: true,
    music: { hear: 14, dance: 8, song: 'dj', loud: 0.6 },
    power: { take: 1 },
  },
  drums: {
    id: 'drums',
    name: 'Барабани',
    about: 'Натисни на них — і вдариш у барабан; монстри поруч танцюють під біт.',
    size: [2, 2],
    solid: [{ dx: 0, dz: 0, h: 1 }, { dx: 0, dz: 1, h: 1 }, { dx: 1, dz: 0, h: 1 }, { dx: 1, dz: 1, h: 1 }],
    count: 0,
    sprite: 'b-drums',
    tab: 'music',
    firstLine: 'first_drums',
    rewardLine: 'reward_drums',
    tap: 'drum',
  },
  pianopath: {
    id: 'pianopath',
    name: 'Піаніно-доріжка',
    about: 'Клавіші на землі: кожен крок звучить новою нотою.',
    size: [8, 2],
    solid: [],
    count: 0,
    sprite: 'b-pianopath',
    tab: 'music',
    firstLine: 'first_pianopath',
    rewardLine: 'reward_pianopath',
    keys: true,
  },
  lasers: {
    id: 'lasers',
    name: 'Лазерне шоу',
    about: 'Уночі кольорові промені над двором; монстри поруч не з’являються. Потрібен струм (−2).',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 2 }],
    count: 0,
    sprite: 'b-lasers',
    tab: 'music',
    firstLine: 'first_lasers',
    rewardLine: 'reward_lasers',
    power: { take: 2, light: 10 },
  },
  smokemachine: {
    id: 'smokemachine',
    name: 'Дим-машина',
    about: 'Пускає густий дим: монстри в ньому губляться й не бачать героїв. Потрібен струм (−1).',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 1 }],
    count: 0,
    sprite: 'b-smokemachine',
    tab: 'music',
    firstLine: 'first_smokemachine',
    rewardLine: 'reward_smokemachine',
    fog: { reach: 6 },
    power: { take: 1 },
  },
  bikegen: {
    id: 'bikegen',
    name: 'Велогенератор',
    about: 'Постій на ньому — герой крутить педалі, і мережа отримує струм (+8).',
    size: [2, 1],
    solid: [{ dx: 0, dz: 0, h: 1 }],
    count: 0,
    sprite: 'b-bikegen',
    tab: 'power',
    firstLine: 'first_bikegen',
    rewardLine: 'reward_bikegen',
    pedal: { give: 8 },
    power: {},
  },
  waterwheel: {
    id: 'waterwheel',
    name: 'Водяне колесо',
    about: 'Ставиться біля річки чи озера й завжди дає струм (+5).',
    size: [2, 2],
    solid: [{ dx: 0, dz: 0, h: 2 }, { dx: 0, dz: 1, h: 2 }, { dx: 1, dz: 0, h: 2 }, { dx: 1, dz: 1, h: 2 }],
    count: 0,
    sprite: 'b-waterwheel',
    tab: 'power',
    firstLine: 'first_waterwheel',
    rewardLine: 'reward_waterwheel',
    water: true,
    power: { give: 5 },
  },
  sunflower: {
    id: 'sunflower',
    name: 'Сонячний соняшник',
    about: 'Сонячна панель-соняшник: удень дає струм (+4).',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 2 }],
    count: 0,
    sprite: 'b-sunflower',
    tab: 'power',
    firstLine: 'first_sunflower',
    rewardLine: 'reward_sunflower',
    power: { solar: 4 },
  },
  everbattery: {
    id: 'everbattery',
    name: 'Вічна батарея',
    about: 'Величезна батарея: тримає 500 іскор.',
    size: [2, 2],
    solid: [{ dx: 0, dz: 0, h: 2 }, { dx: 0, dz: 1, h: 2 }, { dx: 1, dz: 0, h: 2 }, { dx: 1, dz: 1, h: 2 }],
    count: 0,
    sprite: 'b-everbattery',
    tab: 'power',
    firstLine: 'first_everbattery',
    rewardLine: 'reward_everbattery',
    power: { store: 500 },
  },
  extender: {
    id: 'extender',
    name: 'Супер-подовжувач',
    about: 'Несе струм на 15 блоків: далі, ніж звичайний стовп.',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 3 }],
    count: 0,
    sprite: 'b-extender',
    tab: 'power',
    firstLine: 'first_extender',
    rewardLine: 'reward_extender',
    power: { reach: 15 },
  },
  lightningrod: {
    id: 'lightningrod',
    name: 'Блискавковідвід',
    about: 'Блискавка героя поруч заряджає батареї мережі.',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 4 }],
    count: 0,
    sprite: 'b-lightningrod',
    tab: 'power',
    firstLine: 'first_lightningrod',
    rewardLine: 'reward_lightningrod',
    rod: { reach: 24, charge: 120 },
    power: {},
  },
  minisun: {
    id: 'minisun',
    name: 'Міні-сонце',
    about: 'Маленьке сонце на щоглі: уночі монстрів немає в радіусі 12. Потрібен струм (−3).',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 3 }],
    count: 0,
    sprite: 'b-minisun',
    tab: 'power',
    firstLine: 'first_minisun',
    rewardLine: 'reward_minisun',
    power: { take: 3, light: 12 },
  },
  neonsign: {
    id: 'neonsign',
    name: 'Неонова вивіска',
    about: 'Світиться котиком і сердечком: уночі монстрів немає в радіусі 10. Потрібен струм (−1).',
    size: [2, 1],
    solid: [{ dx: 0, dz: 0, h: 2 }, { dx: 1, dz: 0, h: 2 }],
    count: 0,
    sprite: 'b-neonsign',
    tab: 'power',
    firstLine: 'first_neonsign',
    rewardLine: 'reward_neonsign',
    power: { take: 1, light: 10 },
  },
  megagarland: {
    id: 'megagarland',
    name: 'Мега-гірлянда',
    about: 'Вогники на весь двір, блимають у такт: уночі монстрів немає в радіусі 14. Потрібен струм (−2).',
    size: [5, 1],
    solid: [{ dx: 0, dz: 0, h: 3 }, { dx: 4, dz: 0, h: 3 }],
    count: 0,
    sprite: 'b-megagarland',
    tab: 'power',
    firstLine: 'first_megagarland',
    rewardLine: 'reward_megagarland',
    power: { take: 2, light: 14 },
  },
  efence: {
    id: 'efence',
    name: 'Електропаркан',
    about: 'Б’є струмом монстрів, які підходять близько. Потрібен струм (−2).',
    size: [3, 1],
    solid: [{ dx: 0, dz: 0, h: 1 }, { dx: 1, dz: 0, h: 1 }, { dx: 2, dz: 0, h: 1 }],
    count: 0,
    sprite: 'b-efence',
    tab: 'power',
    firstLine: 'first_efence',
    rewardLine: 'reward_efence',
    zap: { reach: 3.5, every: 1 },
    power: { take: 2 },
  },
  toastcannon: {
    id: 'toastcannon',
    name: 'Тостер-гармата',
    about: 'Стріляє гарячими тостами в найближчого монстра. Потрібен струм (−2).',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 1 }],
    count: 0,
    sprite: 'b-toastcannon',
    tab: 'power',
    firstLine: 'first_toastcannon',
    rewardLine: 'reward_toastcannon',
    turret: { reach: 11, every: 1.5 },
    power: { take: 2 },
  },
  bigfan: {
    id: 'bigfan',
    name: 'Великий вентилятор',
    about: 'Сильний вітер відносить монстрів подалі. Потрібен струм (−2).',
    size: [2, 1],
    solid: [{ dx: 0, dz: 0, h: 2 }, { dx: 1, dz: 0, h: 2 }],
    count: 0,
    sprite: 'b-bigfan',
    tab: 'power',
    firstLine: 'first_bigfan',
    rewardLine: 'reward_bigfan',
    blast: { reach: 8, every: 0.2, push: 5, wind: true },
    power: { take: 2 },
  },
  bubbler: {
    id: 'bubbler',
    name: 'Машина бульбашок',
    about: 'Ловить монстрів у бульбашки: монстр чекає 3 секунди. Потрібен струм (−1).',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 1 }],
    count: 0,
    sprite: 'b-bubbler',
    tab: 'power',
    firstLine: 'first_bubbler',
    rewardLine: 'reward_bubbler',
    bubble: { reach: 8, every: 2.5, hold: 3 },
    power: { take: 1 },
  },
  monsterwash: {
    id: 'monsterwash',
    name: 'Монстромийка',
    about: 'Монстр заїжджає всередину й виїжджає монетками. Потрібен струм (−2).',
    size: [2, 2],
    solid: [{ dx: 0, dz: 0, h: 2 }, { dx: 0, dz: 1, h: 2 }, { dx: 1, dz: 0, h: 2 }, { dx: 1, dz: 1, h: 2 }],
    count: 0,
    sprite: 'b-monsterwash',
    tab: 'power',
    firstLine: 'first_monsterwash',
    rewardLine: 'reward_monsterwash',
    wash: { reach: 3.5, every: 4 },
    power: { take: 2 },
  },
  weatherpad: {
    id: 'weatherpad',
    name: 'Пульт погоди',
    about: 'Натисни — і погода зміниться: дощ, сніг, сонце чи веселка.',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 1 }],
    count: 0,
    sprite: 'b-weatherpad',
    tab: 'nature',
    firstLine: 'first_weatherpad',
    rewardLine: 'reward_weatherpad',
    tap: 'weather',
  },
  rainbowbridge: {
    id: 'rainbowbridge',
    name: 'Веселка-міст',
    about: 'Веселка через річку: стає впоперек води, і всі йдуть по ній.',
    size: [10, 2],
    solid: [],
    count: 0,
    sprite: 'b-rainbowbridge',
    tab: 'nature',
    firstLine: 'first_rainbowbridge',
    rewardLine: 'reward_rainbowbridge',
    span: true,
  },
  flowerbed: {
    id: 'flowerbed',
    name: 'Клумба',
    about: 'Біля клумби сердечка повертаються швидше.',
    size: [2, 2],
    solid: [],
    count: 0,
    sprite: 'b-flowerbed',
    tab: 'nature',
    firstLine: 'first_flowerbed',
    rewardLine: 'reward_flowerbed',
    shelter: { calm: 0, heal: 7 },
  },
  beehive: {
    id: 'beehive',
    name: 'Вулик',
    about: 'Бджоли дають мед: біля вулика можна поїсти й наповнити сердечка.',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 1 }],
    count: 0,
    sprite: 'b-beehive',
    tab: 'nature',
    firstLine: 'first_beehive',
    rewardLine: 'reward_beehive',
    food: {},
  },
  birdfeeder: {
    id: 'birdfeeder',
    name: 'Годівниця',
    about: 'Прилітають пташки й співають; монстри поруч танцюють.',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 2 }],
    count: 0,
    sprite: 'b-birdfeeder',
    tab: 'nature',
    firstLine: 'first_birdfeeder',
    rewardLine: 'reward_birdfeeder',
    music: { hear: 12, dance: 7, song: 'birds', loud: 0.45 },
  },
  wickerchair: {
    id: 'wickerchair',
    name: 'Плетене крісло',
    about: 'Постій біля нього — герой сяде, а блискавка заряджатиметься швидше.',
    size: [1, 1],
    solid: [],
    count: 0,
    sprite: 'b-wickerchair',
    tab: 'nature',
    firstLine: 'first_wickerchair',
    rewardLine: 'reward_wickerchair',
    swing: { arc: 0.1, pace: 1.6, rate: 3 },
  },
  ferriswheel: {
    id: 'ferriswheel',
    name: 'Колесо огляду',
    about: 'Катає героїв високо вгору, і мапа звідти відкривається ширше. Потрібен струм (−2).',
    size: [5, 3],
    solid: [],
    count: 0,
    sprite: 'b-ferriswheel',
    tab: 'fun',
    firstLine: 'first_ferriswheel',
    rewardLine: 'reward_ferriswheel',
    ride: { on: 3.2 },
    power: { take: 2 },
  },
  toytrain: {
    id: 'toytrain',
    name: 'Дитячий поїзд',
    about: 'Постій на вагончику — поїзд покатає всіх колом; сердечка повертаються. Потрібен струм (−2).',
    size: [7, 7],
    solid: [],
    count: 0,
    sprite: 'b-toytrain',
    tab: 'fun',
    firstLine: 'first_toytrain',
    rewardLine: 'reward_toytrain',
    ride: { on: 4 },
    power: { take: 2 },
  },
  bouncycastle: {
    id: 'bouncycastle',
    name: 'Надувний замок',
    about: 'Надувний батут: стрибає всіх високо-високо. Потрібен струм (−1).',
    size: [3, 3],
    solid: [],
    count: 0,
    sprite: 'b-bouncycastle',
    tab: 'fun',
    firstLine: 'first_bouncycastle',
    rewardLine: 'reward_bouncycastle',
    bounce: { height: 6 },
    power: { take: 1 },
  },
  waterslide: {
    id: 'waterslide',
    name: 'Водяна гірка',
    about: 'Постій біля басейну — герої підіймуться й з’їдуть у воду.',
    size: [3, 5],
    solid: [],
    count: 0,
    sprite: 'b-waterslide',
    tab: 'fun',
    firstLine: 'first_waterslide',
    rewardLine: 'reward_waterslide',
    ride: { on: 3 },
  },
  cinema: {
    id: 'cinema',
    name: 'Кіно під зірками',
    about: 'Натисни на екран — він покаже казку з книжки, яку ви вже пройшли. Потрібен струм (−1).',
    size: [3, 1],
    solid: [{ dx: 0, dz: 0, h: 3 }, { dx: 1, dz: 0, h: 3 }, { dx: 2, dz: 0, h: 3 }],
    count: 0,
    sprite: 'b-cinema',
    tab: 'fun',
    firstLine: 'first_cinema',
    rewardLine: 'reward_cinema',
    tap: 'cinema',
    power: { take: 1 },
  },
  fireworks: {
    id: 'fireworks',
    name: 'Феєрверк-пускач',
    about: 'Натисни — і над двором розквітне салют.',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 1 }],
    count: 0,
    sprite: 'b-fireworks',
    tab: 'fun',
    firstLine: 'first_fireworks',
    rewardLine: 'reward_fireworks',
    tap: 'fireworks',
  },
  scooter: {
    id: 'scooter',
    name: 'Бабусин скутер',
    about: 'Постій на ньому — і поїдеш удвічі швидше; стрибок зсаджує.',
    size: [1, 1],
    solid: [],
    count: 0,
    sprite: 'b-scooter',
    tab: 'fun',
    firstLine: 'first_scooter',
    rewardLine: 'reward_scooter',
    mount: { speed: 2 },
  },
  surprisebox: {
    id: 'surprisebox',
    name: 'Автомат із сюрпризами',
    about: 'За десять монеток дає випадковий подарунок: натисни на нього.',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 2 }],
    count: 0,
    sprite: 'b-surprisebox',
    tab: 'fun',
    firstLine: 'first_surprisebox',
    rewardLine: 'reward_surprisebox',
    tap: 'surprise',
  },
  rocketswing: {
    id: 'rocketswing',
    name: 'Гойдалка-ракета',
    about: 'Гойдалка з ракетою: блискавка заряджається вп’ятеро швидше.',
    size: [2, 1],
    solid: [],
    count: 0,
    sprite: 'b-rocketswing',
    tab: 'fun',
    firstLine: 'first_rocketswing',
    rewardLine: 'reward_rocketswing',
    swing: { arc: 0.85, pace: 2.6, rate: 5 },
  },
  telescope: {
    id: 'telescope',
    name: 'Телескоп',
    about: 'Натисни — і він знайде десь під хмарами нове місце.',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 2 }],
    count: 0,
    sprite: 'b-telescope',
    tab: 'fun',
    firstLine: 'first_telescope',
    rewardLine: 'reward_telescope',
    tap: 'telescope',
  },
  popcorn: {
    id: 'popcorn',
    name: 'Попкорн-машина',
    about: 'Попкорн наповнює сердечка й дає швидкий біг. Потрібен струм (−1).',
    size: [1, 1],
    solid: [{ dx: 0, dz: 0, h: 2 }],
    count: 0,
    sprite: 'b-popcorn',
    tab: 'fun',
    firstLine: 'first_popcorn',
    rewardLine: 'reward_popcorn',
    food: { fast: 20 },
    power: { take: 1 },
  },
  candyfloss: {
    id: 'candyfloss',
    name: 'Солодка вата',
    about: 'Солодка вата наповнює сердечка й дає швидкий біг. Потрібен струм (−1).',
    size: [2, 1],
    solid: [{ dx: 0, dz: 0, h: 1 }, { dx: 1, dz: 0, h: 1 }],
    count: 0,
    sprite: 'b-candyfloss',
    tab: 'fun',
    firstLine: 'first_candyfloss',
    rewardLine: 'reward_candyfloss',
    food: { fast: 20 },
    power: { take: 1 },
  },
  pieoven: {
    id: 'pieoven',
    name: 'Пиріжкова піч',
    about: 'Щоранку випікає новий бабусин пиріжок: він лежить біля печі.',
    size: [2, 1],
    solid: [{ dx: 0, dz: 0, h: 2 }, { dx: 1, dz: 0, h: 2 }],
    count: 0,
    sprite: 'b-pieoven',
    tab: 'fun',
    firstLine: 'first_pieoven',
    rewardLine: 'reward_pieoven',
    daily: { item: 'babusia_pie' },
  },
  garden: {
    id: 'garden',
    name: 'Грядка',
    about: 'Посади картоплю, моркву, вишні чи яблуко, полий — і за день-два збереш утричі більше.',
    size: [3, 2],
    solid: [],
    count: 1,
    sprite: 'b-garden',
    tab: 'home',
    firstLine: 'first_garden',
    rewardLine: 'reward_garden',
  },
  bigchess: {
    id: 'bigchess',
    name: 'Великі шахи',
    about: 'Шаховий килимок із живим конем: стрибни конем до монетки — до п’яти задачок на день.',
    size: [4, 4],
    solid: [],
    count: 0,
    sprite: 'b-bigchess',
    tab: 'fun',
    firstLine: 'first_bigchess',
    board: 4,
  },
} satisfies Record<string, Card>;

/** Defined by the cards: a new building is one card here (and one model in assets/buildings.ts). */
export type BuildingId = keyof typeof CARDS;
export type BuildingCard = Card<BuildingId>;
export const BUILDINGS: Record<BuildingId, BuildingCard> = CARDS as Record<BuildingId, BuildingCard>;

/** A lighthouse by the water (world/landmarks.ts) in the power network. */
export const LIGHTHOUSE_POWER: PowerCard = { take: 2, light: 16 };

/** Order of the kit plate: the cards' order. */
export const KIT_ORDER = Object.keys(CARDS) as BuildingId[];

/** The boombox's music (the smallest speaker): how far it carries and how close monsters dance. */
export const MUSIC = { hear: 18, dance: 9 };

/** The traffic light's cycle in seconds: green, yellow, red. */
export const TRAFFIC = { green: 6, yellow: 1.5, red: 6 };
