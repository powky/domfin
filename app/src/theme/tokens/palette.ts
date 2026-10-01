/**
 * Raw color palette. Never use these directly in components:
 * go through the semantic tokens exposed by the theme.
 */
export const palette = {
  white: '#FFFFFF',
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
  orange: {
    50: '#FDEBE3',
    100: '#FBD9C9',
    500: '#E8622C',
    600: '#CF5222',
  },
  green: {
    50: '#E6F2EB',
    100: '#CFE8D8',
    500: '#4C9F70',
    700: '#2E7D32',
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
    400: '#9AA0A6',
    300: '#B8BCC2',
  },
  purple: {
    50: '#F0EBFA',
    500: '#8A63D2',
  },
  // Muted hues so every group of a chart has its own color.
  teal: { 500: '#2A9D8F' },
  sky: { 500: '#3A9BC8' },
  navy: { 500: '#3D5A80' },
  olive: { 500: '#8A9A3B' },
  brown: { 500: '#9C6B4E' },
  magenta: { 500: '#B84D9E' },
  indigo: { 500: '#5B5BD6' },
  plum: { 500: '#7E4E7E' },
  gold: { 500: '#C9A227' },
} as const;
