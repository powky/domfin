import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Card, ColorSwatch, ProgressBar, SegmentedControl, Text, type SegmentedOption } from '@/components/ui';
import { formatCurrency, formatPercent } from '@/lib/format';

import type { FlowItem } from '../types';

export type BreakdownCardProps<T extends string> = {
  title: string;
  items: FlowItem[];
  total: number;
  modes: readonly SegmentedOption<T>[];
  mode: T;
  onModeChange: (mode: T) => void;
};

export function BreakdownCard<T extends string>({ title, items, total, modes, mode, onModeChange }: BreakdownCardProps<T>) {
  const { t } = useTranslation();
  const sorted = [...items].sort((a, b) => b.amount - a.amount);
  return (
    <Card
      title={title}
      style={styles.card}
      actions={
        <SegmentedControl
          options={modes}
          value={mode}
          onChange={onModeChange}
          accessibilityLabel={t('cashFlow.breakdownView', { title })}
        />
      }
    >
      <View style={styles.list}>
        {sorted.map((item) => (
          <BreakdownRow key={item.id} item={item} share={item.amount / total} />
        ))}
      </View>
    </Card>
  );
}

function BreakdownRow({ item, share }: { item: FlowItem; share: number }) {
  const { theme } = useUnistyles();
  const color = theme.colors.chart[item.color];
  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <View style={styles.name}>
          <ColorSwatch color={color} />
          <Text variant="bodyMedium" numberOfLines={1} style={styles.label}>
            {item.label}
          </Text>
        </View>
        <View style={styles.values}>
          <Text variant="bodyStrong">{formatCurrency(item.amount)}</Text>
          <Text variant="body" tone="secondary" align="right" style={styles.percent}>
            {formatPercent(share)}
          </Text>
        </View>
      </View>
      <ProgressBar value={share} color={color} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    flex: { xs: undefined, lg: 1 },
    minWidth: 0,
  },
  list: {
    gap: theme.space[4],
  },
  row: {
    gap: theme.space[2],
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space[3],
  },
  name: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2],
    flexShrink: 1,
  },
  label: {
    flexShrink: 1,
  },
  values: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: theme.space[2],
  },
  percent: {
    minWidth: 48,
  },
}));
