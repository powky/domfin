import { useState } from 'react';
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
  const total = summary.income.total;
  const share = (amount: number) => formatPercent(amount / total);

  const toggleGroup = (id: string) => setOpenGroups((current) => ({ ...current, [id]: !current[id] }));

  return (
    <View accessibilityRole="list">
      <View style={styles.headerRow}>
        <Text variant="caption" tone="secondary" style={styles.categoryCol}>
          {t('cashFlow.table.category')}
        </Text>
        <Text variant="caption" tone="secondary" align="right" style={styles.percentCol}>
          {t('cashFlow.table.percentOfIncome')}
        </Text>
        <Text variant="caption" tone="secondary" align="right" style={styles.amountCol}>
          {t('cashFlow.table.amount')}
        </Text>
      </View>

      <Row
        expandable
        expanded={incomeOpen}
        onPress={() => setIncomeOpen((open) => !open)}
        label={t('cashFlow.income')}
        amount={formatCurrency(total)}
        strong
      />
      {incomeOpen &&
        summary.income.byCategory.map((item) => (
          <Row
            key={item.id}
            depth={1}
            label={item.label}
            leading={<ColorSwatch shape="square" color={theme.colors.chart[item.color]} />}
            percent={share(item.amount)}
            amount={formatCurrency(item.amount)}
          />
        ))}

      <Row
        label={t('cashFlow.expenses')}
        percent={share(summary.expenses.total)}
        amount={formatCurrency(-summary.expenses.total)}
        strong
        muted
      />
      {summary.expenses.byGroup.map((group) => {
        const expanded = !!openGroups[group.id];
        return (
          <View key={group.id}>
            <Row
              expandable
              expanded={expanded}
              onPress={() => toggleGroup(group.id)}
              label={group.label}
              leading={<ColorSwatch shape="square" color={theme.colors.chart[group.color]} />}
              percent={share(group.amount)}
              amount={formatCurrency(-group.amount)}
            />
            {expanded &&
              group.categories.map((category) => (
                <Row
                  key={category.id}
                  depth={2}
                  label={category.label}
                  percent={share(category.amount)}
                  amount={formatCurrency(-category.amount)}
                />
              ))}
          </View>
        );
      })}

      <Row label={t('cashFlow.netSavings')} percent={share(summary.net)} amount={formatCurrency(summary.net)} strong total />
      {summary.investments.total !== 0 ? (
        <>
          <Row
            label={t('cashFlow.investments')}
            percent={share(summary.investments.total)}
            amount={formatCurrency(-summary.investments.total)}
            strong
            muted
          />
          {summary.investments.byDestination.map((item) => (
            <Row
              key={item.id}
              depth={1}
              label={item.label}
              leading={<ColorSwatch shape="square" color={theme.colors.chart[item.color]} />}
              percent={share(item.amount)}
              amount={formatCurrency(-item.amount)}
            />
          ))}
          <Row label={t('cashFlow.kept')} percent={share(summary.kept)} amount={formatCurrency(summary.kept)} strong total />
        </>
      ) : null}
    </View>
  );
}

type RowProps = {
  label: string;
  amount: string;
  percent?: string;
  leading?: React.ReactNode;
  depth?: 0 | 1 | 2;
  strong?: boolean;
  muted?: boolean;
  total?: boolean;
  expandable?: boolean;
  expanded?: boolean;
  onPress?: () => void;
};

function Row({ label, amount, percent, leading, depth = 0, strong, muted, total, expandable, expanded, onPress }: RowProps) {
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
      <Text variant="body" tone="secondary" align="right" style={[styles.percentCol, styles.cellText]}>
        {percent ?? ''}
      </Text>
      <Text variant={textVariant} align="right" style={[styles.amountCol, styles.cellText]}>
        {amount}
      </Text>
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
}));
