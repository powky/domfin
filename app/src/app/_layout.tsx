import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useDisplayCurrencyReady } from '@/features/currency';
import { useLanguageReady, useSystemLocaleSync } from '@/i18n';
import { useAmountsPreferenceReady } from '@/lib/privacy';

// The splash screen (expo-splash-screen in app.json) stays until the app can
// draw its first screen. On the web there is none.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontsFailed] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const languageReady = useLanguageReady();
  const currencyReady = useDisplayCurrencyReady();
  const amountsReady = useAmountsPreferenceReady();
  useSystemLocaleSync();
  // Without Inter the app still opens, in the system's font.
  const ready = (fontsLoaded || fontsFailed !== null) && languageReady && currencyReady && amountsReady;

  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}
