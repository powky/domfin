import { Check, Eye, EyeOff, Link2, Tag, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button, Select, Text } from '@/components/ui';
import { formatCurrency, formatNumber } from '@/lib/format';

import type { TransactionsSummary as Summary } from '../types';

/** Non-breaking spaces keep each part whole, so the line only wraps between parts. */
const keepTogether = (text: string) => text.replace(/ /g, '\u00A0');

/** "757 transactions · $250,906.78 in · $130,731.27 out · 9 need review" */
export function TransactionsSummary({ summary }: { summary: Summary }) {
  const { t } = useTranslation();
  const review = t('transactions.summary.needsReview', {
    count: summary.needsReview,
    formatted: formatNumber(summary.needsReview),
  });
  return (
    <Text tone="secondary" style={styles.summary}>
      {keepTogether(t('transactions.summary.count', { count: summary.count, formatted: formatNumber(summary.count) }))}
      {' · '}
      <Text style={styles.inflow}>
        {keepTogether(t('transactions.summary.inflow', { amount: formatCurrency(summary.inflow) }))}
      </Text>
      {` · ${keepTogether(t('transactions.summary.outflow', { amount: formatCurrency(summary.outflow) }))}`}
      {summary.needsReview > 0 ? (
        <>
          {' · '}
          <Text tone="accent">{keepTogether(review)}</Text>
        </>
      ) : null}
    </Text>
  );
}

export type SelectionBarProps = {
  selectedCount: number;
  totalCount: number;
  canMarkReviewed: boolean;
  /** Selection comes from the Hidden list, so the action unhides. */
  hidden: boolean;
  /** Categories to file the selection under. */
  categoryChoices: readonly { value: string; label: string }[];
  onSelectAll: () => void;
  /** `null` gives them back to the automatic classification. */
  onCategorize: (categoryId: string | null) => void;
  /** Investments to link the selection to. */
  assetChoices: readonly { value: string; label: string }[];
  /** `null` unlinks them. */
  onLink: (assetId: string | null) => void;
  onMarkReviewed: () => void;
  onToggleHidden: () => void;
  onClear: () => void;
};

/** Stands for "back to automatic" among the category choices, and for "unlink" among the investments. */
const AUTOMATIC = '__automatic__';
const UNLINK = '__unlink__';

/** Replaces the summary while transactions are selected. */
export function SelectionBar({
  selectedCount,
  totalCount,
  canMarkReviewed,
  hidden,
  categoryChoices,
  onSelectAll,
  onCategorize,
  assetChoices,
  onLink,
  onMarkReviewed,
  onToggleHidden,
  onClear,
}: SelectionBarProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.selection}>
      <View style={styles.selectionText}>
        <Text variant="bodyStrong">
          {t('transactions.selection.selected', { count: selectedCount, formatted: formatNumber(selectedCount) })}
        </Text>
        {selectedCount < totalCount ? (
          <Text tone="accent" variant="bodyMedium" onPress={onSelectAll} accessibilityRole="button" style={styles.link}>
            {t('transactions.selection.selectAll', { formatted: formatNumber(totalCount) })}
          </Text>
        ) : null}
      </View>
      <View style={styles.actions}>
        <Select
          icon={Tag}
          placeholder={t('transactions.selection.categorize')}
          value=""
          options={[{ value: AUTOMATIC, label: t('transactions.selection.automatic') }, ...categoryChoices]}
          onChange={(value) => onCategorize(value === AUTOMATIC ? null : value)}
          accessibilityLabel={t('transactions.selection.categorize')}
        />
        {assetChoices.length > 0 ? (
          <Select
            icon={Link2}
            placeholder={t('assets.link.action')}
            value=""
            options={[...assetChoices, { value: UNLINK, label: t('assets.link.unlink') }]}
            onChange={(value) => onLink(value === UNLINK ? null : value)}
            accessibilityLabel={t('assets.link.action')}
          />
        ) : null}
        {canMarkReviewed ? (
          <Button
            icon={Check}
            label={t('transactions.selection.markReviewed', { count: selectedCount })}
            onPress={onMarkReviewed}
          />
        ) : null}
        <Button
          icon={hidden ? Eye : EyeOff}
          label={hidden ? t('transactions.selection.unhide') : t('transactions.selection.hide')}
          onPress={onToggleHidden}
        />
        <Button icon={X} iconOnly onPress={onClear} accessibilityLabel={t('transactions.selection.clear')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  summary: {
    fontSize: { xs: theme.font.size.md, md: theme.font.size.base },
    lineHeight: { xs: theme.font.lineHeight.md, md: theme.font.lineHeight.base },
  },
  inflow: {
    color: theme.colors.positive,
  },
  selection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    rowGap: theme.space[2],
    columnGap: theme.space[4],
  },
  selectionText: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: theme.space[3],
  },
  link: {
    _web: {
      cursor: 'pointer',
    },
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.space[2],
  },
}));
