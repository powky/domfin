import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Card, Text } from '@/components/ui';
import { useDisplayCurrency } from '@/features/currency';
import { formatDate } from '@/lib/dates';
import { formatCurrency, formatPercent } from '@/lib/format';

const pad = (value: number) => String(value).padStart(2, '0');

/** Sample amount, date and percentage in the current language and region. */
export function FormatPreviewCard() {
  const { t } = useTranslation();
  // Subscribes, so the sample amount follows a change of display currency on this same screen.
  const currency = useDisplayCurrency();
  const now = new Date();
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const samples = [
    { label: t('settings.format.amount'), value: formatCurrency(1234.56, currency) },
    { label: t('settings.format.date'), value: formatDate(today) },
    { label: t('settings.format.percent'), value: formatPercent(0.125) },
  ];

  return (
    <Card title={t('settings.format.title')}>
      <Text tone="secondary" style={styles.description}>
        {t('settings.format.description')}
      </Text>
      <View>
        {samples.map((sample) => (
          <View key={sample.label} style={styles.row}>
            <Text tone="secondary">{sample.label}</Text>
            <Text variant="bodyMedium">{sample.value}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create((theme) => ({
  description: {
    marginTop: -theme.space[2],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space[3],
    minHeight: 40,
    borderTopWidth: theme.layout.hairline,
    borderTopColor: theme.colors.border,
  },
}));
