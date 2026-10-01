import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useDisplayCurrencyReady } from '@/features/currency';
import { useLanguageReady, useSystemLocaleSync } from '@/i18n';
import { useAmountsPreferenceReady } from '@/lib/privacy';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const languageReady = useLanguageReady();
  const currencyReady = useDisplayCurrencyReady();
  const amountsReady = useAmountsPreferenceReady();
  useSystemLocaleSync();

  if (!fontsLoaded || !languageReady || !currencyReady || !amountsReady) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}
