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
 * Semantic tokens. Components only read from here: each theme gives every
 * token its own color, so a component looks right in both without knowing
 * which one is on. `npm run contrast` checks that what goes together reads.
 */
const lightColors = {
  background: palette.neutral[50],
  surface: palette.white,
  /** What sits over the rest: menus, tooltips, the thumb of a segmented control. */
  surfaceRaised: palette.white,
  surfaceMuted: palette.neutral[100],
  surfaceHover: palette.neutral[100],
  border: palette.neutral[150],
  borderStrong: palette.neutral[200],

  text: {
    primary: palette.neutral[900],
    secondary: palette.neutral[600],
    tertiary: palette.neutral[400],
    /** On the accent and on chart colors, like a primary button's label. */
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

  /** The logo: an orange square with a white D in every theme, like the app's icon. */
  brand: { mark: palette.orange[500], letter: palette.white },
};

/** The light theme's tokens, each one free to take any color: what every theme fills in. */
type Colors<T> = { [K in keyof T]: T[K] extends string ? string : Colors<T[K]> };
export type ThemeColors = Colors<typeof lightColors>;

/**
 * Warm dark grays, with the cards lighter than the background as in the light
 * theme. The accent keeps the brand's orange: labels and checks go dark on it,
 * and its text is a lighter orange. Charts and brand avatars keep their colors,
 * except the few too dark to read on these surfaces.
 */
const darkColors: ThemeColors = {
  background: palette.neutralDark[950],
  surface: palette.neutralDark[900],
  surfaceRaised: palette.neutralDark[750],
  surfaceMuted: palette.neutralDark[800],
  surfaceHover: palette.neutralDark[800],
  border: palette.neutralDark[750],
  borderStrong: palette.neutralDark[700],

  text: {
    primary: palette.neutralDark[50],
    secondary: palette.neutralDark[300],
    tertiary: palette.neutralDark[400],
    inverse: palette.neutralDark[950],
    accent: palette.orange[400],
    positive: palette.green[400],
  },

  accent: {
    default: palette.orange[500],
    pressed: palette.orange[400],
    subtle: palette.orange[900],
    muted: palette.orange[800],
    onAccent: palette.neutralDark[950],
  },

  track: palette.neutralDark[750],
  overlay: 'rgba(0, 0, 0, 0.32)',

  spending: palette.red[500],

  positive: palette.green[400],
  negative: palette.red[500],

  chart: {
    ...lightColors.chart,
    incomeLink: palette.green[900],
    slate: palette.slate[500],
    slateLight: palette.slate[600],
    navy: palette.navy[400],
    plum: palette.plum[400],
  },

  control: palette.neutralDark[500],

  avatar: {
    ...lightColors.avatar,
    neutral: { background: palette.neutralDark[750], foreground: palette.neutralDark[300], border: palette.neutralDark[750] },
    outline: { background: palette.neutralDark[900], foreground: palette.neutralDark[300], border: palette.neutralDark[700] },
    dark: { background: palette.neutral[700], foreground: palette.white, border: palette.neutral[700] },
  },

  brand: lightColors.brand,
};

const base = {
  space,
  gap,
  radius,
  font: { family: fontFamily, size: fontSize, lineHeight, letterSpacing },
  layout,
  motion,
} as const;

export type AppTheme = typeof base & { colors: ThemeColors };
export type ChartColor = keyof ThemeColors['chart'];
export type AvatarTone = keyof ThemeColors['avatar'];

export const lightTheme: AppTheme = { ...base, colors: lightColors };
export const darkTheme: AppTheme = { ...base, colors: darkColors };

/** The names are Unistyles' and the system's: `light` and `dark`. */
export const appThemes = {
  light: lightTheme,
  dark: darkTheme,
} as const;

export type ThemeName = keyof typeof appThemes;
