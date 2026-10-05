import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { DonutChart } from '@/components/charts';
import { Odometer } from '@/components/motion';
import { Card, ColorSwatch, ProgressBar, SegmentedControl, Text, Touchable } from '@/components/ui';
import { formatCurrency, formatPercent, formatWholeCurrency } from '@/lib/format';
import { usePhoneLayout } from '@/theme';

import type { BreakdownMode, SpendingItem, SpendingSummary } from '../types';

const modeValues = ['groups', 'categories', 'merchants'] as const satisfies readonly BreakdownMode[];

const COLLAPSED_ROWS = 11;

const DONUT_SIZE = 240;
const DONUT_THICKNESS = 44;
/** Widest the total can be inside the donut's hole, leaving some air before the ring. */
const TOTAL_MAX_WIDTH = DONUT_SIZE - 2 * DONUT_THICKNESS - 16;

export type SpendingBreakdownCardProps = {
  summary: SpendingSummary;
  mode: BreakdownMode;
  onModeChange: (mode: BreakdownMode) => void;
  selectedIds: string[];
  onToggleItem: (id: string) => void;
};

export function SpendingBreakdownCard({ summary, mode, onModeChange, selectedIds, onToggleItem }: SpendingBreakdownCardProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const phone = usePhoneLayout();
  const [expanded, setExpanded] = useState(false);
  const items = summary[mode];
  const visible = expanded ? items : items.slice(0, COLLAPSED_ROWS);
  const max = items[0]?.amount ?? 0;
  const chartGroups = donutOrder(summary.groups);
  const modeOptions = modeValues.map((value) => ({ value, label: t(`spending.breakdown.modes.${value}`) }));

  return (
    <Card
      title={t('spending.breakdown.title')}
      actions={
        <SegmentedControl
          options={modeOptions}
          value={mode}
          onChange={onModeChange}
          accessibilityLabel={t('spending.breakdown.by')}
        />
      }
    >
      <View style={styles.body}>
        <View style={styles.chartColumn}>
          <DonutChart
            size={DONUT_SIZE}
            thickness={DONUT_THICKNESS}
            segments={chartGroups.map((group) => ({
              id: group.id,
              value: group.amount,
              color: theme.colors.chart[group.color],
            }))}
          >
            <Text variant="body" tone="secondary">
              {t('spending.breakdown.total')}
            </Text>
            <DonutTotal value={formatWholeCurrency(summary.total)} />
          </DonutChart>
          <View style={styles.legend}>
            {chartGroups.map((group) => (
              <View key={group.id} style={styles.legendItem}>
                <ColorSwatch shape="square" color={theme.colors.chart[group.color]} />
                <Text variant="caption" tone="secondary">
                  {group.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.list}>
          {visible.map((item) => (
            <BreakdownRow
              key={item.id}
              item={item}
              barValue={max > 0 ? item.amount / max : 0}
              selected={selectedIds.includes(item.id)}
              phone={phone}
              onPress={() => onToggleItem(item.id)}
            />
          ))}
          {items.length > COLLAPSED_ROWS ? (
            <Touchable onPress={() => setExpanded((value) => !value)} surfaceStyle={styles.more} accessibilityRole="button">
              <Text variant="label" tone="accent">
                {expanded ? t('spending.breakdown.showLess') : t('spending.breakdown.showAll', { count: items.length })}
              </Text>
            </Touchable>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

/**
 * The total in the donut's hole. Peso totals run long ("RD$4,459,684"), wider
 * than the hole at KPI size, so a long one is scaled down to fit.
 */
function DonutTotal({ value }: { value: string }) {
  const [width, setWidth] = useState(0);
  const scale = width > TOTAL_MAX_WIDTH ? TOTAL_MAX_WIDTH / width : 1;
  return (
    <View style={{ transform: [{ scale }] }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <Odometer variant="kpi" value={value} />
    </View>
  );
}

/** Colored groups first (largest first), neutral gray groups after. */
function donutOrder(groups: SpendingItem[]) {
  const isNeutral = (item: SpendingItem) => item.color === 'slate' || item.color === 'slateLight';
  return [...groups.filter((group) => !isNeutral(group)), ...groups.filter(isNeutral)];
}

function BreakdownRow({
  item,
  barValue,
  selected,
  phone,
  onPress,
}: {
  item: SpendingItem;
  barValue: number;
  selected: boolean;
  /** Phones put the group under the name, so neither is cut. */
  phone: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const color = theme.colors.chart[item.color];
  return (
    <Touchable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityHint={t('spending.breakdown.rowHint')}
      surfaceStyle={[styles.row, selected && styles.rowSelected]}
      hoverStyle={selected ? undefined : styles.rowHovered}
    >
      <View style={styles.rowHeader}>
        <View style={styles.name}>
          <View style={styles.swatch}>
            <ColorSwatch color={color} />
          </View>
          {phone ? (
            <View style={styles.nameText}>
              <Text variant="bodyStrong" numberOfLines={2}>
                {item.label}
              </Text>
              {item.context ? (
                <Text variant="caption" tone="secondary" numberOfLines={1}>
                  {item.context}
                </Text>
              ) : null}
            </View>
          ) : (
            <Text numberOfLines={1} style={styles.nameText}>
              <Text variant="bodyStrong">{item.label}</Text>
              {item.context ? <Text tone="secondary"> · {item.context}</Text> : null}
            </Text>
          )}
        </View>
        <View style={styles.values}>
          <Text variant="bodyStrong">{formatCurrency(item.amount)}</Text>
          <Text tone="secondary" align="right" style={styles.percent}>
            {formatPercent(item.share)}
          </Text>
        </View>
      </View>
      <ProgressBar value={barValue} color={color} />
    </Touchable>
  );
}

const styles = StyleSheet.create((theme) => ({
  body: {
    flexDirection: { xs: 'column', lg: 'row' },
    gap: { xs: theme.space[5], lg: theme.space[8] },
  },
  chartColumn: {
    width: { xs: '100%', lg: 300 },
    alignItems: 'center',
    gap: theme.space[5],
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: theme.space[3],
    rowGap: theme.space[2],
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[1.5],
  },
  list: {
    flex: { xs: undefined, lg: 1 },
    minWidth: 0,
    gap: theme.space[1],
  },
  row: {
    gap: theme.space[2],
    paddingVertical: theme.space[2],
    paddingHorizontal: theme.space[2],
    marginHorizontal: -theme.space[2],
    borderRadius: theme.radius.md,
  },
  rowHovered: {
    backgroundColor: theme.colors.surfaceHover,
  },
  rowSelected: {
    backgroundColor: theme.colors.accent.subtle,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: { xs: 'flex-start', md: 'center' },
    justifyContent: 'space-between',
    gap: theme.space[3],
  },
  name: {
    flexDirection: 'row',
    alignItems: { xs: 'flex-start', md: 'center' },
    gap: theme.space[2],
    flexShrink: 1,
  },
  // As tall as the name's first line, so the dot stays beside it when the group goes under.
  swatch: {
    height: theme.font.lineHeight.base,
    justifyContent: 'center',
  },
  nameText: {
    flexShrink: 1,
  },
  values: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: theme.space[2],
  },
  percent: {
    minWidth: 44,
  },
  more: {
    alignSelf: 'flex-start',
    paddingVertical: theme.space[2],
  },
}));
