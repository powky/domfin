import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocales } from 'expo-localization';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

import i18n from './i18n';
import { isLanguage, systemLanguage, updateFormatLocale, type Language } from './locale';

/** A language picked in Settings, or `system` to follow the device. */
export type LanguagePreference = Language | 'system';

const STORAGE_KEY = 'domfin.language';

let preference: LanguagePreference = 'system';
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = () => preference;

const resolve = (value: LanguagePreference): Language => (value === 'system' ? systemLanguage() : value);

function apply(next: LanguagePreference) {
  preference = next;
  listeners.forEach((listener) => listener());
  return i18n.changeLanguage(resolve(next));
}

// Read once at startup, before the first screen renders (see useLanguageReady).
const loading = AsyncStorage.getItem(STORAGE_KEY)
  .then((saved) => (saved === 'system' || isLanguage(saved) ? apply(saved) : undefined))
  .catch(() => undefined);

/** Saves the choice on this device and switches the app to it. */
export function setLanguagePreference(next: LanguagePreference) {
  AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  return apply(next);
}

/** The saved choice and the language it resolves to (the device's, for `system`). */
export function useLanguagePreference() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const { i18n: instance } = useTranslation();
  return { preference: current, language: instance.language as Language, setPreference: setLanguagePreference };
}

/** False until the saved language is applied, so the app never flashes the other one. */
export function useLanguageReady() {
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

/** Follows changes to the device's language or region while the app is open. */
export function useSystemLocaleSync() {
  const locales = useLocales();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (preference === 'system') i18n.changeLanguage(systemLanguage());
    else updateFormatLocale(preference);
  }, [locales]);
}
