import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Card, SegmentedControl, Text } from '@/components/ui';
import { useAppearancePreference, type AppearancePreference } from '@/theme';

/** Light or dark: the device's mode by default, or one picked and saved on this device. */
export function AppearanceCard() {
  const { t } = useTranslation();
  const { preference, theme, setPreference } = useAppearancePreference();
  const options: { value: AppearancePreference; label: string }[] = [
    { value: 'system', label: t('settings.appearance.system') },
    { value: 'light', label: t('settings.appearance.light') },
    { value: 'dark', label: t('settings.appearance.dark') },
  ];

  return (
    <Card title={t('settings.appearance.title')}>
      <Text tone="secondary" style={styles.description}>
        {t('settings.appearance.description')}
      </Text>
      <View style={styles.control}>
        <SegmentedControl
          options={options}
          value={preference}
          onChange={setPreference}
          accessibilityLabel={t('settings.appearance.title')}
        />
        <Text variant="caption" tone="secondary">
          {preference !== 'system'
            ? t('settings.appearance.savedHint')
            : theme === 'dark'
              ? t('settings.appearance.systemDarkHint')
              : t('settings.appearance.systemLightHint')}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create((theme) => ({
  description: {
    marginTop: -theme.space[2],
  },
  control: {
    gap: theme.space[2],
  },
}));
