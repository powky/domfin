import { StyleSheet } from 'react-native-unistyles';

import { breakpoints } from './breakpoints';
import { appThemes } from './themes';

type AppBreakpoints = typeof breakpoints;
type AppThemes = typeof appThemes;

/* eslint-disable @typescript-eslint/no-empty-object-type -- Unistyles type augmentation */
declare module 'react-native-unistyles' {
  export interface UnistylesThemes extends AppThemes {}
  export interface UnistylesBreakpoints extends AppBreakpoints {}
}

// Light mode only for now. To add dark mode: add `dark` to appThemes and
// switch to `adaptiveThemes: true`.
StyleSheet.configure({
  themes: appThemes,
  breakpoints,
  settings: {
    initialTheme: 'light',
  },
});
