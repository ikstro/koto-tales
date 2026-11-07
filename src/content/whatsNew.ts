import type { LineId } from './lines';

/**
 * «Що нового»: after an update, the first start shows what came into the game since the save last
 * looked (DESIGN.md «What's new»). A release is a list of new things, each with a picture and a
 * voiced line; `save.whatsNew` is the id of the last release the player has seen. A new game has
 * seen them all; an older save sees every release after its own.
 */
export interface NewThing {
  id: string;
  /** The HUD sprite the card and «Зміст гри» show (ui/hudSprites.ts). */
  pic: string;
  /** Пупся says what it is and where to find it (on the card's tap). */
  line: LineId;
  /** A word or two under the card's picture (for the parents, as in the guide). */
  caption: string;
  /** For the parents («Зміст гри»): the thing's name and one plain sentence. */
  name: string;
  about: string;
}

export interface Release {
  /** Grows by one per published update that brings something worth showing. */
  id: number;
  things: NewThing[];
}

export const RELEASES: Release[] = [
  {
    id: 1,
    things: [
      {
        id: 'flight',
        caption: 'Летюча хатка',
        pic: 'new-bhouse',
        line: 'new_flight',
        name: 'Летюча хатка бабусь',
        about: 'Щоночі хатка бабусь перелітає на нове місце, а господині міняються. Заночуй у них — і полетиш разом із хаткою над хмарами.',
      },
      {
        id: 'garden',
        caption: 'Грядка',
        pic: 'b-garden',
        line: 'new_garden',
        name: 'Грядка',
        about: 'Будівля в скриньці: посади картоплю, моркву, вишню чи яблуко, полий — і наступного ранку збирай урожай.',
      },
      {
        id: 'sirko',
        caption: 'Сірко',
        pic: 'b-doghouse',
        line: 'new_sirko',
        name: 'Миска Сірка',
        about: 'Щоранку Сірко голодний: торкнись миски, і він з’їсть пиріжок, яйце, моркву чи яблуко з того, що ви несете, а потім принесе монетки або продукт.',
      },
      {
        id: 'fish',
        caption: 'Рибки',
        pic: 'new-aquarium',
        line: 'new_fish',
        name: 'Годування рибок',
        about: 'Торкнись акваріума вдома — рибки отримають корм і попливуть до нього; перше годування за день дає 2 монетки.',
      },
      {
        id: 'postbox',
        caption: 'Пошта',
        pic: 'new-postbox',
        line: 'new_postbox',
        name: 'Поштова скринька',
        about: 'Синя скринька біля дверей дому: коли піднято прапорець, там чекає лист-казка, посилка з нагородою скриньки або подарунок гостей.',
      },
      {
        id: 'guests',
        caption: 'Гості',
        pic: 'new-campfire',
        line: 'new_guests',
        name: 'Гості біля вогнища',
        about: 'Увечері сядь на колоду біля вогнища вдома — приходять старійшини знайомих сіл або бабуся, розповідають про своє життя й дарують подарунок.',
      },
      {
        id: 'pantry',
        caption: 'Своя страва',
        pic: 'ask-pot',
        line: 'new_pantry',
        name: 'Комора і власна страва',
        about: 'У бабусиній кухні можна самим покласти в каструлю один-три продукти без рецепта — вийде «власна страва» з невеликою силою.',
      },
      {
        id: 'news',
        caption: 'Новини',
        pic: 'new-tv',
        line: 'new_news',
        name: 'Новини про монстрів',
        about: 'Торкнись телевізора в домі бабусь — покажуть новини про монстрів, яких ви вже зустрічали.',
      },
    ],
  },
  {
    id: 2,
    things: [
      {
        id: 'bighouse',
        caption: 'Ігрова',
        pic: 'map-house',
        line: 'new_bighouse',
        name: 'Великий дім з ігровою',
        about: 'Дім героїв став більшим: ліворуч з’явилася ігрова кімната з іграшками.',
      },
      {
        id: 'slide',
        caption: 'Гірка',
        pic: 'new-slide',
        line: 'new_slide',
        name: 'Гірка в басейн з кульками',
        about: 'В ігровій кімнаті: підійди до драбинки — герой вилізе на гірку і з’їде в басейн із кольоровими кульками.',
      },
      {
        id: 'chess',
        caption: 'Шахи',
        pic: 'new-chess',
        line: 'new_chess',
        name: 'Шаховий куточок',
        about: 'В ігровій кімнаті: сядь на пуфик біля шахівниці — фігурки самі стрибають клітинками, а гра завжди закінчується весело внічию.',
      },
      {
        id: 'easel',
        caption: 'Мольберт',
        pic: 'new-easel',
        line: 'new_easel',
        name: 'Мольберт',
        about: 'В ігровій кімнаті: торкнись аркуша на мольберті — з’явиться новий малюнок.',
      },
      {
        id: 'hometv',
        caption: 'Телевізор',
        pic: 'new-tv',
        line: 'new_hometv',
        name: 'Телевізор удома',
        about: 'Тепер і вдома, в ігровій кімнаті, є телевізор із новинами про монстрів, як у бабусь.',
      },
    ],
  },
  {
    id: 3,
    things: [
      {
        id: 'chess_kingdom',
        caption: 'Шахи',
        pic: 'new-chess-kingdom',
        line: 'new_chess_kingdom',
        name: 'Шахове королівство',
        about: 'Далеко від дому є королівство живих шахових фігур: Білий Король дає сім уроків, і дитина вчиться, як ходить кожна фігура.',
      },
    ],
  },
];

/** The newest release (a new game starts here, seeing nothing as new). */
export const LATEST_RELEASE = RELEASES.reduce((m, r) => Math.max(m, r.id), 0);

/** Everything that came after release `seen`, in release order (the child's cards). */
export const unseenThings = (seen: number): NewThing[] => RELEASES.filter((r) => r.id > seen).flatMap((r) => r.things);

/** The last `n` releases, newest first (the «Що нового» section of «Зміст гри»). */
export const latestReleases = (n: number): Release[] => [...RELEASES].sort((a, b) => b.id - a.id).slice(0, n);
