import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ColorSwatch, StatCard } from '@/components/ui';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';

import type { SpendingSummary } from '../types';

export function SpendingKpis({ summary }: { summary: SpendingSummary }) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const largest = summary.largestGroup;
  return (
    <View style={styles.grid}>
      <StatCard
        label={t('spending.kpis.total')}
        value={formatCurrency(summary.total)}
        leading={<ColorSwatch shape="square" color={theme.colors.spending} />}
      />
      <StatCard label={t('spending.kpis.averagePerMonth')} value={formatCurrency(summary.averagePerMonth)} />
      <StatCard
        label={t('spending.kpis.largestGroup')}
        value={largest?.label ?? '—'}
        valueLines={2}
        caption={largest ? t('spending.kpis.shareOfSpending', { percent: formatPercent(largest.share) }) : undefined}
      />
      <StatCard label={t('spending.kpis.transactions')} value={formatNumber(summary.transactions)} />
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
