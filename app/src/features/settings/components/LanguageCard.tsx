import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Card, SegmentedControl, Text } from '@/components/ui';
import { LANGUAGES, LANGUAGE_NAMES, useLanguagePreference, type LanguagePreference } from '@/i18n';

/** The app language: the device's by default, or one picked and saved on this device. */
export function LanguageCard() {
  const { t } = useTranslation();
  const { preference, language, setPreference } = useLanguagePreference();
  const options: { value: LanguagePreference; label: string }[] = [
    { value: 'system', label: t('settings.language.system') },
    ...LANGUAGES.map((value) => ({ value, label: LANGUAGE_NAMES[value] })),
  ];

  return (
    <Card title={t('settings.language.title')}>
      <Text tone="secondary" style={styles.description}>
        {t('settings.language.description')}
      </Text>
      <View style={styles.control}>
        <SegmentedControl
          options={options}
          value={preference}
          onChange={setPreference}
          accessibilityLabel={t('settings.language.title')}
        />
        <Text variant="caption" tone="secondary">
          {preference === 'system'
            ? t('settings.language.systemHint', { language: LANGUAGE_NAMES[language] })
            : t('settings.language.savedHint')}
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
