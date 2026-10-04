import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Appearance, Platform } from 'react-native';
import { UnistylesRuntime, useUnistyles } from 'react-native-unistyles';

import type { ThemeName } from './themes';

/** A theme picked in Settings, or `system` to follow the device's light or dark mode. */
export type AppearancePreference = ThemeName | 'system';

const STORAGE_KEY = 'domfin.appearance';

const isPreference = (value: unknown): value is AppearancePreference =>
  value === 'system' || value === 'light' || value === 'dark';

/** The device's mode. Unistyles starts with it (see unistyles.ts). */
export const systemTheme = (): ThemeName => (Appearance.getColorScheme() === 'dark' ? 'dark' : 'light');

let preference: AppearancePreference = 'system';
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = () => preference;

function apply(next: AppearancePreference) {
  preference = next;
  // On iOS and Android, what the system draws in the app (the keyboard on
  // iOS, scroll bars) follows the app's theme too. Back on `system`, the
  // device's mode arrives as a change below.
  if (Platform.OS !== 'web') Appearance.setColorScheme(next === 'system' ? 'unspecified' : next);
  UnistylesRuntime.setTheme(next === 'system' ? systemTheme() : next);
  listeners.forEach((listener) => listener());
}

// The device switched between light and dark (at sunset, say): follow it,
// unless a theme was picked here.
Appearance.addChangeListener(({ colorScheme }) => {
  if (preference === 'system') UnistylesRuntime.setTheme(colorScheme === 'dark' ? 'dark' : 'light');
});

// Read once at startup, before the first screen renders (see useAppearanceReady).
const loading = AsyncStorage.getItem(STORAGE_KEY)
  .then((saved) => {
    if (isPreference(saved) && saved !== 'system') apply(saved);
  })
  .catch(() => undefined);

/** Saves the choice on this device and switches the app to it. */
export function setAppearancePreference(next: AppearancePreference) {
  AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  apply(next);
}

/** The saved choice and the theme on screen (the device's, for `system`). */
export function useAppearancePreference() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const { rt } = useUnistyles();
  const theme: ThemeName = rt.themeName === 'dark' ? 'dark' : 'light';
  return { preference: current, theme, setPreference: setAppearancePreference };
}

/** False until the saved theme is applied, so the app never flashes the other one. */
export function useAppearanceReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    loading.then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);
  return ready;
}

/**
 * Paints what lies outside the app's views with the theme: the root view,
 * seen behind screens as they move and past the edges of a web page, and on
 * the web the browser's scroll bars and form controls. Returns the status
 * bar's style, light on the dark theme.
 */
export function useThemeChrome() {
  const { theme, rt } = useUnistyles();
  const background = theme.colors.background;
  const dark = rt.themeName === 'dark';
  useEffect(() => {
    UnistylesRuntime.setRootViewBackgroundColor(background);
    if (Platform.OS === 'web') document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  }, [background, dark]);
  return dark ? 'light' : 'dark';
}
