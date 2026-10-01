import {
  fontFamily,
  fontSize,
  gap,
  layout,
  letterSpacing,
  lineHeight,
  motion,
  palette,
  radius,
  space,
} from './tokens';

/**
 * Semantic tokens. Components only read from here, so adding a dark theme
 * later means adding another object with the same shape.
 */
const lightColors = {
  background: palette.neutral[50],
  surface: palette.white,
  surfaceMuted: palette.neutral[100],
  surfaceHover: palette.neutral[100],
  border: palette.neutral[150],
  borderStrong: palette.neutral[200],

  text: {
    primary: palette.neutral[900],
    secondary: palette.neutral[600],
    tertiary: palette.neutral[400],
    inverse: palette.white,
    accent: palette.orange[500],
    positive: palette.green[500],
  },

  accent: {
    default: palette.orange[500],
    pressed: palette.orange[600],
    subtle: palette.orange[50],
    muted: palette.orange[100],
    onAccent: palette.white,
  },

  track: palette.neutral[150],
  overlay: 'rgba(31, 31, 31, 0.08)',

  spending: palette.red[500],

  /** Gains and losses, e.g. the change of net worth in a period. */
  positive: palette.green[700],
  negative: palette.red[500],

  chart: {
    income: palette.green[500],
    incomeLink: palette.green[100],
    savings: palette.green[500],
    blue: palette.blue[500],
    amber: palette.amber[500],
    darkGreen: palette.green[700],
    pink: palette.pink[500],
    slate: palette.slate[400],
    slateLight: palette.slate[300],
    purple: palette.purple[500],
    red: palette.red[500],
    orange: palette.orange[500],
    teal: palette.teal[500],
    sky: palette.sky[500],
    navy: palette.navy[500],
    olive: palette.olive[500],
    brown: palette.brown[500],
    magenta: palette.magenta[500],
    indigo: palette.indigo[500],
    plum: palette.plum[500],
    gold: palette.gold[500],
  },

  /** Outline of form controls (checkboxes), stronger than `border` so they read as interactive. */
  control: palette.neutral[400],

  /**
   * Avatars: brand-colored stand-ins for logos. `neutral` is a gray circle and
   * `outline` a white one with a gray ring (merchants without a logo).
   */
  avatar: {
    neutral: { background: palette.neutral[150], foreground: palette.neutral[600], border: palette.neutral[150] },
    outline: { background: palette.white, foreground: palette.neutral[600], border: palette.neutral[200] },
    red: { background: palette.red[500], foreground: palette.white, border: palette.red[500] },
    orange: { background: palette.orange[500], foreground: palette.white, border: palette.orange[500] },
    amber: { background: palette.amber[500], foreground: palette.neutral[900], border: palette.amber[500] },
    green: { background: palette.green[500], foreground: palette.white, border: palette.green[500] },
    darkGreen: { background: palette.green[700], foreground: palette.white, border: palette.green[700] },
    blue: { background: palette.blue[500], foreground: palette.white, border: palette.blue[500] },
    pink: { background: palette.pink[500], foreground: palette.white, border: palette.pink[500] },
    dark: { background: palette.neutral[800], foreground: palette.white, border: palette.neutral[800] },
  },
} as const;

const base = {
  space,
  gap,
  radius,
  font: { family: fontFamily, size: fontSize, lineHeight, letterSpacing },
  layout,
  motion,
} as const;

export const lightTheme = {
  ...base,
  colors: lightColors,
} as const;

export type AppTheme = typeof lightTheme;
export type ChartColor = keyof AppTheme['colors']['chart'];
export type AvatarTone = keyof AppTheme['colors']['avatar'];

export const appThemes = {
  light: lightTheme,
} as const;
