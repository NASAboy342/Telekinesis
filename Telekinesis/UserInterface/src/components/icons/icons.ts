/**
 * The icon set: 24×24, stroke-based (stroke="currentColor", 2 px, round caps), drawn in the Lucide style so
 * they follow the text colour and both themes. Each icon is plain data (no markup strings → no v-html).
 * Add an icon = add one entry here; `IconName` is derived from the keys, so a typo is a compile error.
 */
type Attrs = Record<string, string | number>
export type IconShape = readonly [
  tag: 'path' | 'circle' | 'rect' | 'line' | 'ellipse' | 'polyline',
  attrs: Attrs,
]

const path = (d: string): IconShape => ['path', { d }]
const circle = (cx: number, cy: number, r: number): IconShape => ['circle', { cx, cy, r }]
const ellipse = (cx: number, cy: number, rx: number, ry: number): IconShape => [
  'ellipse',
  { cx, cy, rx, ry },
]
const rect = (x: number, y: number, width: number, height: number, rx = 0): IconShape => [
  'rect',
  { x, y, width, height, rx },
]
const line = (x1: number, y1: number, x2: number, y2: number): IconShape => [
  'line',
  { x1, y1, x2, y2 },
]
const poly = (points: string): IconShape => ['polyline', { points }]

export const ICONS = {
  // navigation / pages
  dashboard: [
    rect(3, 3, 7, 9, 1),
    rect(14, 3, 7, 5, 1),
    rect(14, 12, 7, 9, 1),
    rect(3, 16, 7, 5, 1),
  ],
  database: [
    ellipse(12, 5, 9, 3),
    path('M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5'),
    path('M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3'),
  ],
  // theme
  sun: [
    circle(12, 12, 4),
    path('M12 2v2'),
    path('M12 20v2'),
    path('M4.9 4.9l1.4 1.4'),
    path('M17.7 17.7l1.4 1.4'),
    path('M2 12h2'),
    path('M20 12h2'),
    path('M4.9 19.1l1.4-1.4'),
    path('M17.7 6.3l1.4-1.4'),
  ],
  moon: [path('M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z')],
  // connection
  plug: [path('M9 2v6'), path('M15 2v6'), path('M6 8h12v4a6 6 0 0 1-12 0z'), path('M12 18v4')],
  stop: [rect(6, 6, 12, 12, 2)],
  power: [path('M12 2v10'), path('M18.4 6.6a9 9 0 1 1-12.8 0')],
  activity: [poly('22 12 18 12 15 21 9 3 6 12 2 12')],
  loader: [path('M12 3a9 9 0 1 0 9 9')],
  key: [circle(8, 15, 4), path('m10.8 12.2 9.7-9.7'), path('m17 6 3 3'), path('m14.5 8.5 2.5 2.5')],
  user: [circle(12, 8, 4), path('M4 21a8 8 0 0 1 16 0')],
  flask: [
    path('M9 2h6'),
    path('M10 2v6L4 20a1 1 0 0 0 .9 1.5h14.2A1 1 0 0 0 20 20l-6-12V2'),
    path('M7 15h10'),
  ],
  // data / actions
  download: [path('M12 3v12'), path('m7 10 5 5 5-5'), path('M4 21h16')],
  trash: [
    path('M3 6h18'),
    path('M8 6V4h8v2'),
    path('M6 6l1 14h10l1-14'),
    line(10, 11, 10, 17),
    line(14, 11, 14, 17),
  ],
  target: [circle(12, 12, 10), circle(12, 12, 6), circle(12, 12, 2)],
  layers: [path('m12 2 10 5-10 5L2 7z'), path('m2 17 10 5 10-5'), path('m2 12 10 5 10-5')],
  calendar: [rect(3, 4, 18, 18, 2), line(16, 2, 16, 6), line(8, 2, 8, 6), line(3, 10, 21, 10)],
  // feedback
  check: [path('m5 12 5 5 9-10')],
  'check-circle': [circle(12, 12, 10), path('m8 12 3 3 5-6')],
  alert: [circle(12, 12, 10), line(12, 8, 12, 13), line(12, 16, 12.01, 16)],
  info: [circle(12, 12, 10), line(12, 16, 12, 12), line(12, 8, 12.01, 8)],
  // markets / numbers
  candles: [
    path('M7 3v3'),
    rect(5, 6, 4, 10, 1),
    path('M7 16v4'),
    path('M17 2v4'),
    rect(15, 6, 4, 7, 1),
    path('M17 13v5'),
  ],
  coins: [circle(9, 9, 6), circle(15, 15, 6)],
  swap: [path('M7 7h13'), path('m16 3 4 4-4 4'), path('M17 17H4'), path('m8 13-4 4 4 4')],
  'trending-up': [poly('22 7 13.5 15.5 8.5 10.5 2 17'), poly('16 7 22 7 22 13')],
  'trending-down': [poly('22 17 13.5 8.5 8.5 13.5 2 7'), poly('16 17 22 17 22 11')],
  'arrow-up': [line(12, 19, 12, 5), poly('5 12 12 5 19 12')],
  'arrow-down': [line(12, 5, 12, 19), poly('19 12 12 19 5 12')],
  'arrow-right': [line(5, 12, 19, 12), poly('12 5 19 12 12 19')],
  'chevron-down': [poly('6 9 12 15 18 9')],
  // timeline / tools
  clock: [circle(12, 12, 10), poly('12 6 12 12 16 14')],
  crosshair: [
    circle(12, 12, 10),
    line(22, 12, 18, 12),
    line(6, 12, 2, 12),
    line(12, 6, 12, 2),
    line(12, 22, 12, 18),
  ],
  'move-horizontal': [poly('18 8 22 12 18 16'), poly('6 8 2 12 6 16'), line(2, 12, 22, 12)],
  plus: [path('M12 5v14'), path('M5 12h14')],
  minus: [path('M5 12h14')],
  terminal: [poly('4 17 10 11 4 5'), line(12, 19, 20, 19)],
  // AI / forms
  cpu: [
    rect(6, 6, 12, 12, 2),
    rect(9, 9, 6, 6, 1),
    line(9, 2, 9, 6),
    line(15, 2, 15, 6),
    line(9, 18, 9, 22),
    line(15, 18, 15, 22),
    line(2, 9, 6, 9),
    line(2, 15, 6, 15),
    line(18, 9, 22, 9),
    line(18, 15, 22, 15),
  ],
  play: [poly('6 3 20 12 6 21 6 3')],
  refresh: [
    path('M3 12a9 9 0 0 1 15.5-6.2'),
    poly('21 3 21 9 15 9'),
    path('M21 12a9 9 0 0 1-15.5 6.2'),
    poly('3 21 3 15 9 15'),
  ],
  copy: [rect(9, 9, 13, 13, 2), path('M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1')],
  save: [
    path('M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z'),
    poly('17 21 17 13 7 13 7 21'),
    poly('7 3 7 8 15 8'),
  ],
  sliders: [
    line(4, 21, 4, 14),
    line(4, 10, 4, 3),
    line(12, 21, 12, 12),
    line(12, 8, 12, 3),
    line(20, 21, 20, 16),
    line(20, 12, 20, 3),
    line(1, 14, 7, 14),
    line(9, 8, 15, 8),
    line(17, 16, 23, 16),
  ],
  'chart-line': [path('M3 3v18h18'), poly('7 14 11 10 15 13 20 7')],
  edit: [path('M12 20h9'), path('M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z')],
  x: [path('M18 6 6 18'), path('m6 6 12 12')],
  zap: [poly('13 2 3 14 12 14 11 22 21 10 12 10 13 2')],
  list: [
    line(8, 6, 21, 6),
    line(8, 12, 21, 12),
    line(8, 18, 21, 18),
    line(3, 6, 3.01, 6),
    line(3, 12, 3.01, 12),
    line(3, 18, 3.01, 18),
  ],
  hash: [line(4, 9, 20, 9), line(4, 15, 20, 15), line(10, 3, 8, 21), line(16, 3, 14, 21)],
  percent: [line(19, 5, 5, 19), circle(6.5, 6.5, 2.5), circle(17.5, 17.5, 2.5)],
  'git-branch': [
    line(6, 3, 6, 15),
    circle(18, 6, 3),
    circle(6, 18, 3),
    path('M18 9a9 9 0 0 1-9 9'),
  ],
  eye: [path('M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z'), circle(12, 12, 3)],
  network: [
    circle(5, 6, 2),
    circle(5, 18, 2),
    circle(19, 12, 2),
    line(7, 6.8, 17, 11.2),
    line(7, 17.2, 17, 12.8),
  ],
  shuffle: [
    poly('16 3 21 3 21 8'),
    line(4, 20, 21, 3),
    poly('21 16 21 21 16 21'),
    line(15, 15, 21, 21),
    line(4, 4, 9, 9),
  ],
  // learning / content sites (home, book, bulb, math, language switcher, quiz states)
  home: [path('M3 11 12 3l9 8'), path('M5 10v10h14V10'), path('M10 20v-6h4v6')],
  book: [
    path('M4 19.5A2.5 2.5 0 0 1 6.5 17H20'),
    path('M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'),
  ],
  bulb: [
    path(
      'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5',
    ),
    path('M9 18h6'),
    path('M10 22h4'),
  ],
  sigma: [path('M18 7V4H6l6 8-6 8h12v-3')],
  languages: [
    path('m5 8 6 6'),
    path('m4 14 6-6 2-3'),
    path('M2 5h12'),
    path('M7 2h1'),
    path('m22 22-5-10-5 10'),
    path('M14 18h6'),
  ],
  'arrow-left': [line(19, 12, 5, 12), poly('12 19 5 12 12 5')],
  'chevron-right': [poly('9 6 15 12 9 18')],
  circle: [circle(12, 12, 10)],
  'circle-dot': [circle(12, 12, 10), circle(12, 12, 3)],
  'x-circle': [circle(12, 12, 10), path('m15 9-6 6'), path('m9 9 6 6')],
  star: [
    poly(
      '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2',
    ),
  ],
  flame: [
    path(
      'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z',
    ),
  ],
  // game / camera (added with Telekinesis)
  camera: [
    path(
      'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z',
    ),
    circle(12, 13, 3),
  ],
  'camera-off': [
    path(
      'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z',
    ),
    line(2, 2, 22, 22),
  ],
  hand: [
    path('M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2'),
    path('M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2'),
    path('M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8'),
    path(
      'M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15',
    ),
  ],
  'fingers-two': [
    path('M9 3v10'),
    path('M15 3v10'),
    path('M9 13a3 3 0 0 0-3 3v1a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4v-3a3 3 0 0 0-3-3h-2'),
  ],
  'mouse-pointer': [path('M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z')],
  // sound (added with the Arena)
  'volume-2': [
    poly('11 5 6 9 2 9 2 15 6 15 11 19 11 5'),
    path('M15.54 8.46a5 5 0 0 1 0 7.07'),
    path('M19.07 4.93a10 10 0 0 1 0 14.14'),
  ],
  'volume-x': [poly('11 5 6 9 2 9 2 15 6 15 11 19 11 5'), line(22, 9, 16, 15), line(16, 9, 22, 15)],
  triangle: [path('M12 3 2 21h20z')],
  flag: [path('M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z'), line(4, 22, 4, 15)],
} satisfies Record<string, IconShape[]>

export type IconName = keyof typeof ICONS
