import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { BarChart } from '@/components/charts';
import { Card, SegmentedControl, Text } from '@/components/ui';
import { formatCompactCurrency, formatCurrency } from '@/lib/format';

import { shortMonthLabel } from '@/lib/period';
import type { SpendingItem, SpendingSummary } from '../types';

type TrendView = 'monthly' | 'cumulative';

const viewValues = ['monthly', 'cumulative'] as const satisfies readonly TrendView[];

const cumulative = (values: number[]) => {
  let running = 0;
  return values.map((value) => (running += value));
};

const formatTick = (value: number) => formatCompactCurrency(value, 1);

export type SpendingTrendCardProps = {
  summary: SpendingSummary;
  /** Items picked in the breakdown; when empty the chart stacks by group. */
  selected: SpendingItem[];
};

export function SpendingTrendCard({ summary, selected }: SpendingTrendCardProps) {
  const { t } = useTranslation();
  const { theme, rt } = useUnistyles();
  const tap = rt.breakpoint === 'xs' || rt.breakpoint === 'sm';
  const [view, setView] = useState<TrendView>('monthly');
  const viewOptions = viewValues.map((value) => ({ value, label: t(`spending.trend.views.${value}`) }));

  // Largest at the bottom of the stack.
  const source = selected.length > 0 ? selected : summary.groups;
  const series = [...source].map((item) => ({
    id: item.id,
    color: theme.colors.chart[item.color],
    values: view === 'monthly' ? item.monthly : cumulative(item.monthly),
  }));

  return (
    <Card
      title={t('spending.trend.title')}
      actions={
        <SegmentedControl
          options={viewOptions}
          value={view}
          onChange={setView}
          accessibilityLabel={t('spending.trend.view')}
        />
      }
    >
      <Text variant="body" tone="secondary" style={styles.hint}>
        {selected.length > 0
          ? t(tap ? 'spending.trend.showingTap' : 'spending.trend.showing', {
              items: selected.map((item) => item.label).join(', '),
            })
          : t(tap ? 'spending.trend.hintTap' : 'spending.trend.hint')}
      </Text>
      <BarChart
        labels={summary.months.map(shortMonthLabel)}
        series={series}
        formatTick={formatTick}
        onBarPress={(index) => router.push({ pathname: '/transactions', params: { month: summary.months[index] } })}
        accessibilityLabelForBar={(index, total) =>
          t('spending.trend.bar', { month: shortMonthLabel(summary.months[index]), amount: formatCurrency(total) })
        }
      />
    </Card>
  );
}

const styles = StyleSheet.create((theme) => ({
  hint: {
    marginTop: -theme.space[2],
  },
}));
