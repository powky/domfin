import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Card, SegmentedControl, Text } from '@/components/ui';
import { CURRENCIES, currencySymbols } from '@/lib/currency';
import { formatDate } from '@/lib/dates';

import { chooseDisplayCurrency } from '../api/preference';
import { useDisplayCurrency } from '../api/useConverter';
import { useExchangeRate } from '../api/useExchangeRate';
import { formatCheckedAt, formatRate } from '../lib/format';
import { midRate } from '../lib/rates';

/** Display currency, and the BCRD dollar rate that converts every total to it. */
export function CurrencyCard() {
  const { t } = useTranslation();
  const currency = useDisplayCurrency();
  const { rate, status, fetchedAt } = useExchangeRate();
  const options = CURRENCIES.map((value) => ({
    value,
    label: `${currencySymbols[value]} ${t(`currency.names.${value}`)}`,
  }));
  const rows = [
    { label: t('currency.rate.date'), value: formatDate(rate.date) },
    { label: t('currency.rate.buy'), value: formatRate(rate.buy) },
    { label: t('currency.rate.sell'), value: formatRate(rate.sell) },
    { label: t('currency.rate.midpoint'), value: formatRate(midRate(rate)) },
  ];

  return (
    <Card title={t('currency.title')}>
      <Text tone="secondary" style={styles.description}>
        {t('currency.description')}
      </Text>
      <View style={styles.control}>
        <SegmentedControl
          options={options}
          value={currency}
          onChange={chooseDisplayCurrency}
          accessibilityLabel={t('currency.label')}
        />
        <Text variant="caption" tone="secondary">
          {t('currency.savedHint')}
        </Text>
      </View>
      <View>
        <Text variant="bodyStrong" style={styles.heading}>
          {t('currency.rate.title')}
        </Text>
        {rows.map((row) => (
          <View key={row.label} style={styles.row}>
            <Text tone="secondary">{row.label}</Text>
            <Text variant="bodyMedium" style={styles.value} revealAmounts>
              {row.value}
            </Text>
          </View>
        ))}
      </View>
      <Text variant="caption" tone="secondary">
        {t(`currency.rate.status.${status}`)}
        {status === 'live' && fetchedAt ? ` ${t('currency.rate.updated', { time: formatCheckedAt(fetchedAt) })}` : ''}
      </Text>
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
  heading: {
    paddingBottom: theme.space[2],
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
  value: {
    fontVariant: ['tabular-nums'],
  },
}));
