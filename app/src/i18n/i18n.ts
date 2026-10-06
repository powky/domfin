// Hermes has no Intl.PluralRules, which i18next needs for plurals; this only loads where it's missing.
import 'intl-pluralrules';

import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { Platform } from 'react-native';

import { DomfinEngine } from '../../modules/domfin-engine';
import { LANGUAGES, isLanguage, systemLanguage, updateFormatLocale } from './locale';
import { en } from './locales/en';
import { phone as enPhone } from './locales/en/phone';
import { es } from './locales/es';
import { phone as esPhone } from './locales/es/phone';
import { withOverrides } from './locales/types';

const i18n = createInstance();

// Where Domfin runs inside the app (iOS and Android), the phone's texts
// (locales/en/phone.ts) replace the ones about domfin-api and the computer.
const onPhone = DomfinEngine !== null;

export const resources = {
  en: { translation: onPhone ? withOverrides(en, enPhone) : en },
  es: { translation: onPhone ? withOverrides(es, esPhone) : es },
} as const;

// Registered before init so the first language sets the formats too.
i18n.on('languageChanged', (language) => {
  if (!isLanguage(language)) return;
  updateFormatLocale(language);
  if (Platform.OS === 'web' && typeof document !== 'undefined') document.documentElement.lang = language;
});

// The saved preference replaces the system language once it loads (see ./preference).
i18n.use(initReactI18next).init({
  resources,
  lng: systemLanguage(),
  fallbackLng: 'en',
  supportedLngs: LANGUAGES,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
  initAsync: false,
});

export default i18n;
