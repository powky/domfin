import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Checkbox, Text, checkboxSize } from '@/components/ui';
import { formatSignedCurrency } from '@/lib/format';

import { formatDay } from '../lib/format';
import type { Transaction, TransactionDay } from '../types';
import { CategoryLabel } from './CategoryLabel';
import { MerchantAvatar } from './MerchantAvatar';

/*
 * The rows of the transactions list. From `md` up they form a table
 * (merchant, category, account, amount); on phones the category becomes a
 * second line and the amount sits at the end of the first. Both layouts come
 * from breakpoints in the styles, and all rows share them so columns line up.
 */

export type TransactionRowProps = {
  transaction: Transaction;
  accountName: string;
  categoryLabels: ReadonlyMap<string, string>;
  selected: boolean;
  onToggle: (id: string, selected: boolean) => void;
  /** The categories that fit the transaction, to pick one from its category. */
  categoryOptions?: readonly { value: string; label: string }[];
  onCategorize?: (transaction: Transaction, categoryId: string | null) => void;
};

export const TransactionRow = memo(function TransactionRow({
  transaction,
  accountName,
  categoryLabels,
  selected,
  onToggle,
  categoryOptions,
  onCategorize,
}: TransactionRowProps) {
  // Memoized, so it subscribes to the language itself: the label and amounts change with it.
  const { t } = useTranslation();
  const amount = formatSignedCurrency(transaction.amount, transaction.currency);
  const amountStyle = [styles.amount, transaction.amount > 0 && styles.amountIn];
  return (
    <View style={[styles.row, selected && styles.rowSelected]}>
      <Checkbox
        checked={selected}
        onChange={(checked) => onToggle(transaction.id, checked)}
        accessibilityLabel={t(
          transaction.needsReview ? 'transactions.row.selectNeedsReview' : 'transactions.row.select',
          { merchant: transaction.merchant, amount },
        )}
      />
      <View style={styles.content}>
        <View style={[styles.merchantLine, styles.merchantColumn]}>
          {transaction.needsReview ? <View style={styles.reviewDot} /> : null}
          <MerchantAvatar transaction={transaction} />
          <Text numberOfLines={1} style={styles.merchant}>
            {transaction.merchant}
          </Text>
          <View style={styles.phoneOnly}>
            <Text numberOfLines={1} align="right" style={amountStyle}>
              {amount}
            </Text>
          </View>
        </View>
        <View style={styles.categoryColumn}>
          <CategoryLabel
            transaction={transaction}
            categoryLabels={categoryLabels}
            options={categoryOptions}
            onChange={onCategorize ? (categoryId) => onCategorize(transaction, categoryId) : undefined}
          />
        </View>
        {/* Hidden columns are Views: `display: flex` on a Text would break its alignment and ellipsis on web. */}
        <View style={[styles.accountColumn, styles.desktopOnly]}>
          <Text numberOfLines={1} style={styles.account}>
            {accountName}
          </Text>
        </View>
        <View style={[styles.amountColumn, styles.desktopOnly]}>
          <Text numberOfLines={1} align="right" style={amountStyle}>
            {amount}
          </Text>
        </View>
      </View>
    </View>
  );
});

export type TransactionTableHeaderProps = {
  checked: boolean;
  indeterminate: boolean;
  onToggleAll: (checked: boolean) => void;
};

/** Column titles, desktop only. */
export function TransactionTableHeader({ checked, indeterminate, onToggleAll }: TransactionTableHeaderProps) {
  const { t } = useTranslation();
  return (
    <View style={[styles.row, styles.headerRow, styles.desktopOnly]}>
      <Checkbox
        checked={checked}
        indeterminate={indeterminate}
        onChange={onToggleAll}
        accessibilityLabel={t('transactions.table.selectAll')}
      />
      <View style={styles.content}>
        <Text style={[styles.columnTitle, styles.merchantColumn]}>{t('transactions.table.merchant')}</Text>
        <Text style={[styles.columnTitle, styles.categoryColumn]}>{t('transactions.table.category')}</Text>
        <Text style={[styles.columnTitle, styles.accountColumn]}>{t('transactions.table.account')}</Text>
        <Text align="right" style={[styles.columnTitle, styles.amountColumn]}>
          {t('transactions.table.amount')}
        </Text>
      </View>
    </View>
  );
}

/** Gray band that opens each day: the date lines up with the merchants, the day's net sits on the right. */
export function TransactionDayHeader({ day }: { day: TransactionDay }) {
  return (
    <View style={[styles.row, styles.dayRow]}>
      <View style={styles.checkboxSpace} />
      <View style={styles.dayContent}>
        <Text style={styles.dayText}>{formatDay(day.date)}</Text>
        <Text style={[styles.dayText, styles.tabular]}>{formatSignedCurrency(day.total)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: { xs: theme.space[4], lg: theme.space[6] },
    minHeight: { xs: 68, md: 52 },
    paddingHorizontal: { xs: theme.space[4], md: theme.space[5], lg: theme.space[6] },
    paddingVertical: { xs: theme.space[3], md: theme.space[2] },
    borderBottomWidth: theme.layout.hairline,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    _web: {
      _hover: {
        backgroundColor: theme.colors.surfaceHover,
      },
    },
  },
  rowSelected: {
    backgroundColor: theme.colors.accent.subtle,
    _web: {
      _hover: {
        backgroundColor: theme.colors.accent.subtle,
      },
    },
  },
  headerRow: {
    minHeight: 40,
    _web: {
      _hover: {
        backgroundColor: theme.colors.surface,
      },
    },
  },
  dayRow: {
    minHeight: 0,
    paddingVertical: theme.space[2],
    backgroundColor: theme.colors.surfaceMuted,
    _web: {
      _hover: {
        backgroundColor: theme.colors.surfaceMuted,
      },
    },
  },
  content: {
    flex: 1,
    minWidth: 0,
    flexDirection: { xs: 'column', md: 'row' },
    alignItems: { xs: 'stretch', md: 'center' },
    gap: { xs: theme.space[1], md: theme.space[4], lg: theme.space[6] },
  },
  merchantLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2.5],
    minWidth: 0,
  },
  reviewDot: {
    width: 6,
    height: 6,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accent.default,
  },
  merchant: {
    flex: 1,
    minWidth: 0,
    fontFamily: { xs: theme.font.family.medium, md: theme.font.family.regular },
    fontSize: theme.font.size.lg,
    lineHeight: theme.font.lineHeight.lg,
  },
  account: {
    fontSize: theme.font.size.lg,
    lineHeight: theme.font.lineHeight.lg,
    color: theme.colors.text.secondary,
  },
  amount: {
    fontFamily: { xs: theme.font.family.semibold, md: theme.font.family.medium },
    fontSize: theme.font.size.lg,
    lineHeight: theme.font.lineHeight.lg,
    fontVariant: ['tabular-nums'],
  },
  amountIn: {
    color: theme.colors.positive,
  },
  columnTitle: {
    fontSize: theme.font.size.md,
    lineHeight: theme.font.lineHeight.md,
    color: theme.colors.text.secondary,
  },
  merchantColumn: {
    flex: { xs: undefined, md: 2.2 },
  },
  categoryColumn: {
    flex: { xs: undefined, md: 1.6 },
    minWidth: 0,
  },
  accountColumn: {
    flex: 1.2,
    minWidth: 0,
  },
  // The same width in every row, so the columns line up: ten ems hold
  // -RD$99,999,999.99 in the amount's 16 px with tabular figures.
  amountColumn: {
    width: 10 * theme.font.size.lg,
  },
  checkboxSpace: {
    width: checkboxSize,
  },
  dayContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space[3],
  },
  dayText: {
    fontFamily: theme.font.family.semibold,
    fontSize: { xs: theme.font.size.base, md: theme.font.size.md },
    lineHeight: { xs: theme.font.lineHeight.base, md: theme.font.lineHeight.md },
    color: theme.colors.text.secondary,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  phoneOnly: {
    display: { xs: 'flex', md: 'none' },
  },
  desktopOnly: {
    display: { xs: 'none', md: 'flex' },
  },
}));
