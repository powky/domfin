import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ColorSwatch, Text } from '@/components/ui';
import { formatCurrency, formatPercent } from '@/lib/format';

import type { CashFlowSummary } from '../types';

export function ProfitLossTable({ summary }: { summary: CashFlowSummary }) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const [incomeOpen, setIncomeOpen] = useState(true);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  // What each row's amount measures, by row: the amount column is as wide as
  // the widest one shown, so no amount wraps and every row lines up.
  const [amountWidths, setAmountWidths] = useState<Record<string, number>>({});
  const total = summary.income.total;
  const share = (amount: number) => formatPercent(amount / total);

  const toggleGroup = (id: string) => setOpenGroups((current) => ({ ...current, [id]: !current[id] }));
  const measureAmount = useCallback(
    (key: string, width: number) =>
      setAmountWidths((current) => (current[key] === width ? current : { ...current, [key]: width })),
    [],
  );
  const swatch = (color: keyof typeof theme.colors.chart) => (
    <ColorSwatch shape="square" color={theme.colors.chart[color]} />
  );

  const rows: RowSpec[] = [
    {
      key: 'income',
      expandable: true,
      expanded: incomeOpen,
      onPress: () => setIncomeOpen((open) => !open),
      label: t('cashFlow.income'),
      amount: formatCurrency(total),
      strong: true,
    },
  ];
  if (incomeOpen) {
    for (const item of summary.income.byCategory) {
      rows.push({
        key: `income:${item.id}`,
        depth: 1,
        label: item.label,
        leading: swatch(item.color),
        percent: share(item.amount),
        amount: formatCurrency(item.amount),
      });
    }
  }
  rows.push({
    key: 'expenses',
    label: t('cashFlow.expenses'),
    percent: share(summary.expenses.total),
    amount: formatCurrency(-summary.expenses.total),
    strong: true,
    muted: true,
  });
  for (const group of summary.expenses.byGroup) {
    const expanded = !!openGroups[group.id];
    rows.push({
      key: `group:${group.id}`,
      expandable: true,
      expanded,
      onPress: () => toggleGroup(group.id),
      label: group.label,
      leading: swatch(group.color),
      percent: share(group.amount),
      amount: formatCurrency(-group.amount),
    });
    if (expanded) {
      for (const category of group.categories) {
        rows.push({
          key: `category:${group.id}:${category.id}`,
          depth: 2,
          label: category.label,
          percent: share(category.amount),
          amount: formatCurrency(-category.amount),
        });
      }
    }
  }
  rows.push({
    key: 'net',
    label: t('cashFlow.netSavings'),
    percent: share(summary.net),
    amount: formatCurrency(summary.net),
    strong: true,
    total: true,
  });
  if (summary.investments.total !== 0) {
    rows.push({
      key: 'investments',
      label: t('cashFlow.investments'),
      percent: share(summary.investments.total),
      amount: formatCurrency(-summary.investments.total),
      strong: true,
      muted: true,
    });
    for (const item of summary.investments.byDestination) {
      rows.push({
        key: `investment:${item.id}`,
        depth: 1,
        label: item.label,
        leading: swatch(item.color),
        percent: share(item.amount),
        amount: formatCurrency(-item.amount),
      });
    }
    rows.push({
      key: 'kept',
      label: t('cashFlow.kept'),
      percent: share(summary.kept),
      amount: formatCurrency(summary.kept),
      strong: true,
      total: true,
    });
  }

  const widest = Math.max(0, ...rows.map((row) => amountWidths[row.key] ?? 0));
  // Never narrower than the column's own width; wider when an amount needs it.
  const amountWidth = widest > 0 ? { minWidth: Math.ceil(widest) } : null;

  return (
    <View accessibilityRole="list">
      <View style={styles.headerRow}>
        <Text variant="caption" tone="secondary" style={styles.categoryCol}>
          {t('cashFlow.table.category')}
        </Text>
        <Text variant="caption" tone="secondary" align="right" style={styles.percentCol}>
          {t('cashFlow.table.percentOfIncome')}
        </Text>
        <Text variant="caption" tone="secondary" align="right" style={[styles.amountCol, amountWidth]}>
          {t('cashFlow.table.amount')}
        </Text>
      </View>
      {rows.map(({ key, ...row }) => (
        <Row key={key} {...row} amountWidth={amountWidth} onAmountWidth={(width) => measureAmount(key, width)} />
      ))}
    </View>
  );
}

type RowProps = {
  label: string;
  amount: string;
  percent?: string;
  leading?: ReactNode;
  depth?: 0 | 1 | 2;
  strong?: boolean;
  muted?: boolean;
  total?: boolean;
  expandable?: boolean;
  expanded?: boolean;
  onPress?: () => void;
  amountWidth: { minWidth: number } | null;
  onAmountWidth: (width: number) => void;
};

type RowSpec = Omit<RowProps, 'amountWidth' | 'onAmountWidth'> & { key: string };

function Row({
  label,
  amount,
  percent,
  leading,
  depth = 0,
  strong,
  muted,
  total,
  expandable,
  expanded,
  onPress,
  amountWidth,
  onAmountWidth,
}: RowProps) {
  const { theme } = useUnistyles();
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const textVariant = strong ? 'bodyStrong' : 'body';

  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={expandable ? 'button' : undefined}
      accessibilityState={expandable ? { expanded } : undefined}
      style={[styles.row, muted && styles.rowMuted, total && styles.rowTotal]}
    >
      <View style={[styles.categoryCol, styles.labelCell, styles.indent(depth)]}>
        <View style={styles.chevron}>
          {expandable ? <Chevron size={16} strokeWidth={2} color={theme.colors.text.secondary} /> : null}
        </View>
        {leading}
        <Text variant={textVariant} numberOfLines={1} style={[styles.label, styles.cellText]}>
          {label}
        </Text>
      </View>
      <Text variant="body" tone="secondary" align="right" numberOfLines={1} style={[styles.percentCol, styles.cellText]}>
        {percent ?? ''}
      </Text>
      <Text variant={textVariant} align="right" numberOfLines={1} style={[styles.amountCol, styles.cellText, amountWidth]}>
        {amount}
      </Text>
      {/* The amount again, unseen and at its own width: what the column measures. */}
      <View pointerEvents="none" aria-hidden style={styles.measure}>
        <Text
          variant={textVariant}
          numberOfLines={1}
          style={styles.cellText}
          onLayout={(event) => onAmountWidth(event.nativeEvent.layout.width)}
        >
          {amount}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: { xs: theme.space[1], md: theme.space[2] },
    paddingBottom: theme.space[2],
    borderBottomWidth: theme.layout.hairline,
    borderBottomColor: theme.colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: { xs: theme.space[1], md: theme.space[2] },
    borderBottomWidth: theme.layout.hairline,
    borderBottomColor: theme.colors.border,
  },
  rowMuted: {
    backgroundColor: theme.colors.surfaceMuted,
  },
  rowTotal: {
    borderBottomWidth: 0,
  },
  indent: (depth: number) => ({
    paddingLeft: {
      xs: depth * theme.space[3],
      md: depth * theme.space[5],
    },
  }),
  labelCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: { xs: theme.space[1.5], md: theme.space[2] },
  },
  chevron: {
    width: 16,
  },
  cellText: {
    fontSize: { xs: theme.font.size.md, md: theme.font.size.base },
  },
  label: {
    flexShrink: 1,
  },
  categoryCol: {
    flex: 1,
    minWidth: 0,
  },
  percentCol: {
    width: { xs: 56, md: 110 },
  },
  amountCol: {
    width: { xs: 92, md: 140 },
  },
  measure: {
    position: 'absolute',
    opacity: 0,
  },
}));
