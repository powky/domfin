import { Check, Eye, EyeOff, Link2, Tag, Trash2, X } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button, Select, Text } from '@/components/ui';
import { dotSeparator, formatCurrency, formatNumber, keepTogether } from '@/lib/format';
import { usePhoneLayout } from '@/theme';

import type { TransactionsSummary as Summary } from '../types';

/**
 * "757 transactions · $250,906.78 in · $130,731.27 out · 9 need review". On
 * phones it takes two lines, the count and the money, so no line ends on a dot.
 */
export function TransactionsSummary({ summary }: { summary: Summary }) {
  const { t } = useTranslation();
  const phone = usePhoneLayout();
  const count = keepTogether(
    t('transactions.summary.count', { count: summary.count, formatted: formatNumber(summary.count) }),
  );
  const inflow = (
    <Text style={styles.inflow}>
      {keepTogether(t('transactions.summary.inflow', { amount: formatCurrency(summary.inflow) }))}
    </Text>
  );
  const outflow = `${dotSeparator}${keepTogether(t('transactions.summary.outflow', { amount: formatCurrency(summary.outflow) }))}`;
  const review =
    summary.needsReview > 0 ? (
      <>
        {dotSeparator}
        <Text tone="accent">
          {keepTogether(
            t('transactions.summary.needsReview', {
              count: summary.needsReview,
              formatted: formatNumber(summary.needsReview),
            }),
          )}
        </Text>
      </>
    ) : null;
  if (phone) {
    return (
      <View style={styles.phoneLines}>
        <Text tone="secondary" style={styles.summary}>
          {count}
          {review}
        </Text>
        <Text tone="secondary" style={styles.summary}>
          {inflow}
          {outflow}
        </Text>
      </View>
    );
  }
  return (
    <Text tone="secondary" style={styles.summary}>
      {count}
      {dotSeparator}
      {inflow}
      {outflow}
      {review}
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
  /** Deletes the selection, when it's all added by hand; it asks first. */
  onDelete?: () => void;
  onClear: () => void;
};

/** Stands for "back to automatic" among the category choices, and for "unlink" among the investments. */
const AUTOMATIC = '__automatic__';
const UNLINK = '__unlink__';

/**
 * Replaces the summary while transactions are selected. On phones it stays
 * about as tall as the summary, so the list hardly moves under the finger:
 * the count on top, then one row of actions, the rarer ones as icons.
 */
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
  onDelete,
  onClear,
}: SelectionBarProps) {
  const { t } = useTranslation();
  const phone = usePhoneLayout();
  // How many were selected when Delete asked: selecting others asks again.
  const [confirming, setConfirming] = useState<number | null>(null);
  const markReviewed = t('transactions.selection.markReviewed', { count: selectedCount });
  const hide = hidden ? t('transactions.selection.unhide') : t('transactions.selection.hide');
  const remove = t('transactions.selection.delete');

  const count = (
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
  );
  const actions = (
    <>
      <Select
        icon={phone ? undefined : Tag}
        placeholder={t('transactions.selection.categorize')}
        value=""
        options={[{ value: AUTOMATIC, label: t('transactions.selection.automatic') }, ...categoryChoices]}
        onChange={(value) => onCategorize(value === AUTOMATIC ? null : value)}
        accessibilityLabel={t('transactions.selection.categorize')}
      />
      {assetChoices.length > 0 ? (
        <Select
          icon={Link2}
          iconOnly={phone}
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
          iconOnly={phone}
          label={phone ? undefined : markReviewed}
          onPress={onMarkReviewed}
          accessibilityLabel={markReviewed}
        />
      ) : null}
      <Button
        icon={hidden ? Eye : EyeOff}
        iconOnly={phone}
        label={phone ? undefined : hide}
        onPress={onToggleHidden}
        accessibilityLabel={hide}
      />
      {onDelete ? (
        <Button
          icon={Trash2}
          iconOnly={phone}
          label={phone ? undefined : remove}
          onPress={() => setConfirming(selectedCount)}
          accessibilityLabel={remove}
        />
      ) : null}
    </>
  );
  const clear = <Button icon={X} iconOnly onPress={onClear} accessibilityLabel={t('transactions.selection.clear')} />;

  if (onDelete && confirming === selectedCount) {
    const question = (
      <Text variant="bodyStrong">
        {t('transactions.selection.deleteConfirm', { count: selectedCount, formatted: formatNumber(selectedCount) })}
      </Text>
    );
    const confirm = (
      <Button
        icon={Trash2}
        label={t('transactions.selection.deleteYes', { count: selectedCount })}
        onPress={() => {
          setConfirming(null);
          onDelete();
        }}
      />
    );
    return (
      <View style={phone ? styles.phoneSelection : styles.selection}>
        {question}
        <View style={styles.actions}>
          {confirm}
          <View style={phone ? styles.clear : undefined}>{clear}</View>
        </View>
      </View>
    );
  }

  if (phone) {
    return (
      <View style={styles.phoneSelection}>
        {count}
        <View style={styles.actions}>
          {actions}
          <View style={styles.clear}>{clear}</View>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.selection}>
      {count}
      <View style={[styles.actions, styles.wrap]}>
        {actions}
        {clear}
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
  phoneLines: {
    gap: theme.space[0.5],
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
  phoneSelection: {
    gap: theme.space[2],
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2],
  },
  wrap: {
    flexWrap: 'wrap',
  },
  // The way out, at the far end of the row.
  clear: {
    marginLeft: 'auto',
  },
}));
