/**
 * Inline SVG icon catalog.
 *
 * Every glyph is stroke-based on a 24x24 grid and inherits `currentColor`, so
 * icons never trigger an extra network request and always match the active
 * theme. Category records persist icon names from this catalog, therefore the
 * union is the contract between stored data and rendering.
 */

export const ICON_NAMES = [
  'plus',
  'minus',
  'arrow-left-right',
  'check',
  'x',
  'trash',
  'edit',
  'settings',
  'pie-chart',
  'wallet',
  'calendar',
  'tag',
  'chevron-down',
  'chevron-left',
  'chevron-right',
  'list',
  'target',
  'wifi-off',
  'alert-circle',
  'delete',
  'search',
  'camera',
  'download',
  'upload',
  'shopping-cart',
  'utensils',
  'car',
  'home',
  'film',
  'activity',
  'dollar-sign',
  'briefcase',
  'trending-up',
  'repeat',
  'help-circle',
  'filter',
  'receipt',
  'sun',
  'moon',
  'smartphone',
  'database',
  'refresh',
  'lock',
  'clock',
  'info'
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export interface IconCircle {
  cx: number;
  cy: number;
  r: number;
}

export interface IconRect {
  x: number;
  y: number;
  width: number;
  height: number;
  rx?: number;
}

export interface IconDefinition {
  /** Stroke path data, drawn with `stroke-linecap: round`. */
  paths: string[];
  circles?: IconCircle[];
  rects?: IconRect[];
}

export const FALLBACK_ICON_NAME: IconName = 'help-circle';

export const ICONS: Record<IconName, IconDefinition> = {
  plus: { paths: ['M12 5v14', 'M5 12h14'] },
  minus: { paths: ['M5 12h14'] },
  'arrow-left-right': { paths: ['M8 3 4 7l4 4', 'M4 7h16', 'M16 21l4-4-4-4', 'M20 17H4'] },
  check: { paths: ['M20 6 9 17l-5-5'] },
  x: { paths: ['M18 6 6 18', 'M6 6l12 12'] },
  trash: {
    paths: [
      'M3 6h18',
      'M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2',
      'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
      'M10 11v6',
      'M14 11v6'
    ]
  },
  edit: { paths: ['M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z'] },
  settings: {
    paths: [
      'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z'
    ],
    circles: [{ cx: 12, cy: 12, r: 3 }]
  },
  'pie-chart': { paths: ['M21.21 15.89A10 10 0 1 1 8 2.83', 'M22 12A10 10 0 0 0 12 2v10Z'] },
  wallet: { paths: ['M21 12V7H5a2 2 0 0 1 0-4h14v4', 'M3 5v14a2 2 0 0 0 2 2h16v-5', 'M18 12a2 2 0 0 0 0 4h4v-4Z'] },
  calendar: {
    paths: ['M16 2v4', 'M8 2v4', 'M3 10h18'],
    rects: [{ x: 3, y: 4, width: 18, height: 18, rx: 2 }]
  },
  tag: { paths: ['M20.59 13.41 12.42 21.58a2 2 0 0 1-2.83 0L2 14V2h12l6.59 6.59a2 2 0 0 1 0 2.82Z', 'M7 7h.01'] },
  'chevron-down': { paths: ['m6 9 6 6 6-6'] },
  'chevron-left': { paths: ['m15 18-6-6 6-6'] },
  'chevron-right': { paths: ['m9 18 6-6-6-6'] },
  list: { paths: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'] },
  target: {
    paths: [],
    circles: [{ cx: 12, cy: 12, r: 10 }, { cx: 12, cy: 12, r: 6 }, { cx: 12, cy: 12, r: 2 }]
  },
  'wifi-off': {
    paths: [
      'M1 1l22 22',
      'M16.72 11.06A10.94 10.94 0 0 1 19 12.55',
      'M5 12.55a10.94 10.94 0 0 1 5.17-2.39',
      'M10.71 5.05A16 16 0 0 1 22.58 9',
      'M1.42 9a15.91 15.91 0 0 1 4.7-2.88',
      'M8.53 16.11a6 6 0 0 1 6.95 0',
      'M12 20h.01'
    ]
  },
  'alert-circle': { paths: ['M12 8v4', 'M12 16h.01'], circles: [{ cx: 12, cy: 12, r: 10 }] },
  delete: { paths: ['M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z', 'M18 9l-6 6', 'M12 9l6 6'] },
  search: { paths: ['M21 21l-4.35-4.35'], circles: [{ cx: 11, cy: 11, r: 8 }] },
  camera: {
    paths: ['M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z'],
    circles: [{ cx: 12, cy: 13, r: 4 }]
  },
  download: { paths: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'] },
  upload: { paths: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12'] },
  'shopping-cart': {
    paths: ['M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6'],
    circles: [{ cx: 9, cy: 21, r: 1 }, { cx: 20, cy: 21, r: 1 }]
  },
  utensils: { paths: ['M6 3v7a3 3 0 0 0 6 0V3', 'M9 3v18', 'M18 3c-2.2 2-3.5 4.6-3.5 7.3 0 1.6 1.1 2.7 3.5 2.7', 'M18 3v18'] },
  car: {
    paths: ['M3 12l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5v5a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-1H7v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z'],
    circles: [{ cx: 7.5, cy: 13.5, r: 1 }, { cx: 16.5, cy: 13.5, r: 1 }]
  },
  home: { paths: ['M3 10l9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z', 'M9 22V12h6v10'] },
  film: {
    paths: ['M7 2v20', 'M17 2v20', 'M2 12h20', 'M2 7h5', 'M2 17h5', 'M17 17h5', 'M17 7h5'],
    rects: [{ x: 2, y: 2, width: 20, height: 20, rx: 2 }]
  },
  activity: { paths: ['M22 12h-4l-3 9L9 3l-3 9H2'] },
  'dollar-sign': { paths: ['M12 1v22', 'M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'] },
  briefcase: {
    paths: ['M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16'],
    rects: [{ x: 2, y: 7, width: 20, height: 14, rx: 2 }]
  },
  'trending-up': { paths: ['M23 6l-9.5 9.5-5-5L1 18', 'M17 6h6v6'] },
  repeat: { paths: ['M17 1l4 4-4 4', 'M3 11V9a4 4 0 0 1 4-4h14', 'M7 23l-4-4 4-4', 'M21 13v2a4 4 0 0 1-4 4H3'] },
  'help-circle': { paths: ['M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3', 'M12 17h.01'], circles: [{ cx: 12, cy: 12, r: 10 }] },
  filter: { paths: ['M22 3H2l8 9.46V19l4 2v-8.54L22 3Z'] },
  receipt: {
    paths: ['M6 2h12v20l-3-2-3 2-3-2-3 2Z', 'M9 7h6', 'M9 11h6', 'M9 15h4']
  },
  sun: {
    paths: [
      'M12 1v2',
      'M12 21v2',
      'M4.22 4.22l1.42 1.42',
      'M18.36 18.36l1.42 1.42',
      'M1 12h2',
      'M21 12h2',
      'M4.22 19.78l1.42-1.42',
      'M18.36 5.64l1.42-1.42'
    ],
    circles: [{ cx: 12, cy: 12, r: 4 }]
  },
  moon: { paths: ['M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z'] },
  smartphone: { paths: ['M12 18h.01'], rects: [{ x: 5, y: 2, width: 14, height: 20, rx: 3 }] },
  database: {
    paths: [
      'M3 5c0-1.66 4.03-3 9-3s9 1.34 9 3-4.03 3-9 3-9-1.34-9-3Z',
      'M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5',
      'M21 12c0 1.66-4.03 3-9 3s-9-1.34-9-3'
    ]
  },
  refresh: { paths: ['M23 4v6h-6', 'M1 20v-6h6', 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10', 'M1 14l4.64 4.36A9 9 0 0 0 20.49 15'] },
  lock: { paths: ['M7 11V7a5 5 0 0 1 10 0v4'], rects: [{ x: 4, y: 11, width: 16, height: 10, rx: 2 }] },
  clock: { paths: ['M12 6v6l4 2'], circles: [{ cx: 12, cy: 12, r: 10 }] },
  info: { paths: ['M12 16v-4', 'M12 8h.01'], circles: [{ cx: 12, cy: 12, r: 10 }] }
};

/** Safe lookup used by every icon consumer, including restored user data. */
export const resolveIconName = (name: string): IconName =>
  (ICON_NAMES as readonly string[]).includes(name) ? (name as IconName) : FALLBACK_ICON_NAME;

export const getIconDefinition = (name: string): IconDefinition =>
  ICONS[resolveIconName(name)];
