/**
 * Raw color palette. Never use these directly in components:
 * go through the semantic tokens exposed by the theme.
 */
export const palette = {
  white: '#FFFFFF',
  black: '#000000',
  neutral: {
    25: '#FBFAF8',
    50: '#F7F6F3',
    100: '#F1F0EC',
    150: '#ECEAE6',
    200: '#E3E1DC',
    300: '#CFCCC6',
    400: '#A9A6A0',
    500: '#85827C',
    600: '#6B6B6B',
    700: '#4A4A4A',
    800: '#2E2E2E',
    900: '#1F1F1F',
  },
  /**
   * The warm grays of the dark theme, numbered like `neutral` (the higher,
   * the darker): 950 is its background and 50 its text.
   */
  neutralDark: {
    50: '#EDEBE7',
    300: '#B4B1AA',
    400: '#99968F',
    500: '#77746E',
    700: '#3D3B38',
    750: '#2F2E2B',
    800: '#252421',
    900: '#1B1A18',
    950: '#121110',
  },
  orange: {
    50: '#FDEBE3',
    100: '#FBD9C9',
    400: '#F57C4C',
    500: '#E8622C',
    600: '#CF5222',
    // The accent's tints on the dark theme's surfaces.
    800: '#63331F',
    900: '#3A251B',
  },
  green: {
    50: '#E6F2EB',
    100: '#CFE8D8',
    400: '#68B369',
    500: '#4C9F70',
    700: '#2E7D32',
    // green[500] at a quarter, on the dark theme's surface: green[100] is the same on white.
    900: '#273B2E',
  },
  blue: {
    50: '#E7EEFB',
    500: '#3B6FD8',
  },
  amber: {
    50: '#FBF1DD',
    500: '#E0A030',
  },
  pink: {
    50: '#F9E8ED',
    500: '#D9738F',
  },
  red: {
    50: '#FBE9E7',
    500: '#D9453B',
  },
  slate: {
    300: '#B8BCC2',
    400: '#9AA0A6',
    // The dark theme's: darker, so they stay quiet on its dark surfaces.
    500: '#7B8187',
    600: '#6D7278',
  },
  purple: {
    50: '#F0EBFA',
    500: '#8A63D2',
  },
  // Muted hues so every group of a chart has its own color.
  teal: { 500: '#2A9D8F' },
  sky: { 500: '#3A9BC8' },
  // 400s: lighter, so they read on the dark theme's surfaces.
  navy: { 400: '#56749C', 500: '#3D5A80' },
  olive: { 500: '#8A9A3B' },
  brown: { 500: '#9C6B4E' },
  magenta: { 500: '#B84D9E' },
  indigo: { 500: '#5B5BD6' },
  plum: { 400: '#936293', 500: '#7E4E7E' },
  gold: { 500: '#C9A227' },
} as const;
