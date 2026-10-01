import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ColorSwatch, StatCard } from '@/components/ui';
import { formatCurrency, formatSignedCurrency } from '@/lib/format';

import { longMonthYear } from '../lib/months';
import type { NetWorthSummary } from '../types';

export function NetWorthKpis({ summary }: { summary: NetWorthSummary }) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const changeColor = summary.change >= 0 ? theme.colors.positive : theme.colors.negative;
  return (
    <View style={styles.grid}>
      <StatCard
        label={t('netWorth.kpis.netWorth')}
        value={formatCurrency(summary.netWorth)}
        caption={t('netWorth.kpis.asOf', { month: longMonthYear(summary.endMonth) })}
      />
      <StatCard
        label={t('netWorth.kpis.change')}
        value={formatSignedCurrency(summary.change)}
        caption={t('netWorth.kpis.since', { month: longMonthYear(summary.startMonth) })}
        leading={<ColorSwatch shape="square" color={changeColor} />}
      />
      <StatCard label={t('netWorth.kpis.assets')} value={formatCurrency(summary.assets.total)} />
      <StatCard label={t('netWorth.kpis.liabilities')} value={formatCurrency(summary.liabilities.total)} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: { xs: theme.space[3], md: theme.space[4] },
  },
}));
