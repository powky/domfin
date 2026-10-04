import { StyleSheet } from 'react-native-unistyles';

import { systemTheme } from './appearance';
import { breakpoints } from './breakpoints';
import { appThemes } from './themes';

type AppBreakpoints = typeof breakpoints;
type AppThemes = typeof appThemes;

/* eslint-disable @typescript-eslint/no-empty-object-type -- Unistyles type augmentation */
declare module 'react-native-unistyles' {
  export interface UnistylesThemes extends AppThemes {}
  export interface UnistylesBreakpoints extends AppBreakpoints {}
}

// Starts in the device's mode; the theme picked in Settings, if any, comes
// from storage before the first screen. appearance.ts follows the device
// itself instead of Unistyles' `adaptiveThemes`: turning those on and off at
// runtime, as a picked theme needs, can leave the web page's theme class
// behind.
StyleSheet.configure({
  themes: appThemes,
  breakpoints,
  settings: {
    initialTheme: systemTheme,
  },
});
