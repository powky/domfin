import { X } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { LineChart, type LineSeries } from '@/components/charts';
import { Card, ColorSwatch, SegmentedControl, Select, Text, Touchable } from '@/components/ui';
import { formatCompactCurrency, formatCurrency } from '@/lib/format';

import { monthAxisLabels, shortMonthYear } from '../lib/months';
import { chartSeries } from '../lib/series';
import type { ChartMode, ChartScope, NetWorthSummary, SelectedAccount } from '../types';

/** Their names are the `netWorth.chart.modes` translations. */
const chartModes = ['netWorth', 'byType'] as const satisfies readonly ChartMode[];

/** Their names are the `netWorth.chart.scopes` translations. */
const chartScopes = ['all', 'assets', 'liabilities'] as const satisfies readonly ChartScope[];

export type NetWorthChartCardProps = {
  summary: NetWorthSummary;
  /** Accounts picked in the lists; when present they replace the view's lines. */
  selected: SelectedAccount[];
  onToggleAccount: (id: string) => void;
  onClearSelection: () => void;
};

export function NetWorthChartCard({ summary, selected, onToggleAccount, onClearSelection }: NetWorthChartCardProps) {
  const { t } = useTranslation();
  const { theme, rt } = useUnistyles();
  const [mode, setMode] = useState<ChartMode>('netWorth');
  const [scope, setScope] = useState<ChartScope>('all');

  const series: LineSeries[] = chartSeries(summary, { mode, scope, selected }).map((spec) => ({
    ...spec,
    color: spec.color === 'accent' ? theme.colors.accent.default : theme.colors.chart[spec.color],
  }));
  const compact = rt.breakpoint === 'xs' || rt.breakpoint === 'sm';
  const modeOptions = chartModes.map((value) => ({ value, label: t(`netWorth.chart.modes.${value}`) }));
  const scopeOptions = chartScopes.map((value) => ({ value, label: t(`netWorth.chart.scopes.${value}`) }));

  // Changing the view charts it right away, so it drops the picked accounts.
  const changeMode = (next: ChartMode) => {
    setMode(next);
    onClearSelection();
  };
  const changeScope = (next: ChartScope) => {
    setScope(next);
    onClearSelection();
  };

  return (
    <Card
      title={t('netWorth.chart.title')}
      actions={
        <>
          <SegmentedControl
            options={modeOptions}
            value={mode}
            onChange={changeMode}
            accessibilityLabel={t('netWorth.chart.view')}
          />
          <Select
            options={scopeOptions}
            value={scope}
            onChange={changeScope}
            accessibilityLabel={t('netWorth.chart.scopeLabel')}
          />
        </>
      }
    >
      {selected.length > 0 ? (
        <View style={styles.legend}>
          {series.map((line) => (
            <Touchable
              key={line.id}
              onPress={() => onToggleAccount(line.id)}
              accessibilityRole="button"
              accessibilityLabel={t('netWorth.chart.stopCharting', { name: line.label })}
              surfaceStyle={styles.chip}
              hoverStyle={styles.chipHovered}
            >
              <ColorSwatch shape="square" color={line.color} />
              <Text variant="label">{line.label}</Text>
              <X size={14} strokeWidth={2} color={theme.colors.text.tertiary} />
            </Touchable>
          ))}
          <Touchable onPress={onClearSelection} accessibilityRole="button" surfaceStyle={styles.clear}>
            <Text variant="label" tone="accent">
              {t('netWorth.chart.clear')}
            </Text>
          </Touchable>
        </View>
      ) : (
        <View style={styles.intro}>
          <Text tone="secondary">{compact ? t('netWorth.chart.introTap') : t('netWorth.chart.introClick')}</Text>
          {series.length > 1 ? (
            <View style={styles.legend}>
              {series.map((line) => (
                <View key={line.id} style={styles.legendItem}>
                  <ColorSwatch shape="square" color={line.color} />
                  <Text variant="caption" tone="secondary">
                    {line.label}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      )}
      <LineChart
        labels={monthAxisLabels(summary.months)}
        series={series}
        area={series.length === 1}
        formatTick={formatCompactCurrency}
        formatValue={formatCurrency}
        formatTitle={(index) => shortMonthYear(summary.months[index])}
        accessibilityLabel={t('netWorth.chart.label')}
      />
    </Card>
  );
}

const styles = StyleSheet.create((theme) => ({
  intro: {
    marginTop: -theme.space[2],
    gap: theme.space[3],
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: theme.space[3],
    rowGap: theme.space[2],
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[1.5],
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[1.5],
    height: 30,
    paddingLeft: theme.space[2.5],
    paddingRight: theme.space[2],
    borderRadius: theme.radius.full,
    borderWidth: theme.layout.hairline,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  chipHovered: {
    backgroundColor: theme.colors.surfaceHover,
  },
  clear: {
    paddingVertical: theme.space[1],
  },
}));
