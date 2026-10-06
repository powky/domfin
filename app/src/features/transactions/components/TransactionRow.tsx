import { Check } from 'lucide-react-native';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Checkbox, Text, checkboxSize } from '@/components/ui';
import { dotSeparator, formatSignedCurrency } from '@/lib/format';

import { formatDay } from '../lib/format';
import type { Transaction, TransactionDay } from '../types';
import { CategoryLabel } from './CategoryLabel';
import { MerchantAvatar } from './MerchantAvatar';

/*
 * The rows of the transactions list. From `md` up they form a table
 * (checkbox, merchant, category, account, amount). On phones the merchant's
 * logo leads the row, the merchant and amount share the first line and the
 * category and account the second; there is no checkbox column: the logo
 * selects the row, and so does a long press. The list says which layout to
 * use, and each row renders only that one: a layout hidden with
 * `display: 'none'` can crash React Native's layout in debug builds.
 */

export type TransactionRowProps = {
  transaction: Transaction;
  accountName: string;
  categoryLabels: ReadonlyMap<string, string>;
  selected: boolean;
  /** Some row is selected: on phones, tapping a row then selects it too. */
  selecting: boolean;
  /** The phone layout (below `md`), from `usePhoneLayout`. */
  phone: boolean;
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
  selecting,
  phone,
  onToggle,
  categoryOptions,
  onCategorize,
}: TransactionRowProps) {
  // Memoized, so it subscribes to the language itself: the label and amounts change with it.
  const { t } = useTranslation();
  const amount = formatSignedCurrency(transaction.amount, transaction.currency);
  const amountStyle = [styles.amount, transaction.amount > 0 && styles.amountIn];
  const selectLabel = t(transaction.needsReview ? 'transactions.row.selectNeedsReview' : 'transactions.row.select', {
    merchant: transaction.merchant,
    amount,
  });
  const toggle = () => onToggle(transaction.id, !selected);
  const category = (
    <CategoryLabel
      transaction={transaction}
      categoryLabels={categoryLabels}
      options={categoryOptions}
      onChange={onCategorize ? (categoryId) => onCategorize(transaction, categoryId) : undefined}
    />
  );
  const reviewDot = transaction.needsReview ? <View style={styles.reviewDot} /> : null;
  // What was added by hand says so, and why it asks for a look when its
  // statement came without it: first, so a long account name is what's cut.
  const origin = transaction.missing
    ? t('transactions.row.notInStatement')
    : transaction.manual
      ? t('transactions.row.byHand')
      : null;
  const account = origin ? `${origin}${dotSeparator}${accountName}` : accountName;

  if (phone) {
    return (
      <Pressable
        style={[styles.row, selected && styles.rowSelected]}
        onPress={selecting ? toggle : undefined}
        onLongPress={toggle}
        accessible={false}
      >
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={selectLabel}
          accessibilityState={{ checked: selected }}
          hitSlop={8}
          onPress={toggle}
        >
          {/* The button takes the touch, not what's drawn in it (an icon's SVG can keep it on Android). */}
          <View pointerEvents="none">
            {selected ? <SelectedMark /> : <MerchantAvatar transaction={transaction} size="md" />}
          </View>
        </Pressable>
        <View style={styles.lines}>
          <View style={styles.line}>
            {reviewDot}
            <Text numberOfLines={1} style={styles.merchant}>
              {transaction.merchant}
            </Text>
            <Text numberOfLines={1} align="right" style={amountStyle}>
              {amount}
            </Text>
          </View>
          <View style={styles.line}>
            <View style={styles.categoryCell}>{category}</View>
            <Text variant="caption" tone="secondary" numberOfLines={1} align="right" style={styles.phoneAccount}>
              {account}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={[styles.row, selected && styles.rowSelected]}>
      <Checkbox checked={selected} onChange={toggle} accessibilityLabel={selectLabel} />
      <View style={styles.columns}>
        <View style={[styles.line, styles.merchantColumn]}>
          <MerchantAvatar transaction={transaction} />
          {reviewDot}
          <Text numberOfLines={1} style={styles.merchant}>
            {transaction.merchant}
          </Text>
        </View>
        <View style={styles.categoryColumn}>{category}</View>
        <View style={styles.accountColumn}>
          <Text numberOfLines={1} style={styles.account}>
            {account}
          </Text>
        </View>
        <View style={styles.amountColumn}>
          <Text numberOfLines={1} align="right" style={amountStyle}>
            {amount}
          </Text>
        </View>
      </View>
    </View>
  );
});

/** Stands in for the logo of a selected row on phones. */
function SelectedMark() {
  const { theme } = useUnistyles();
  return (
    <View style={styles.selectedMark}>
      <Check size={16} strokeWidth={3} color={theme.colors.accent.onAccent} />
    </View>
  );
}

export type TransactionTableHeaderProps = {
  checked: boolean;
  indeterminate: boolean;
  onToggleAll: (checked: boolean) => void;
};

/** Column titles, for the table (`md` up). */
export function TransactionTableHeader({ checked, indeterminate, onToggleAll }: TransactionTableHeaderProps) {
  const { t } = useTranslation();
  return (
    <View style={[styles.row, styles.headerRow]}>
      <Checkbox
        checked={checked}
        indeterminate={indeterminate}
        onChange={onToggleAll}
        accessibilityLabel={t('transactions.table.selectAll')}
      />
      <View style={styles.columns}>
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

/**
 * Gray band that opens each day, with the day's net on the right. In the
 * table the date lines up with the merchants; on phones, with the logos.
 */
export function TransactionDayHeader({ day, phone }: { day: TransactionDay; phone: boolean }) {
  return (
    <View style={[styles.row, styles.dayRow]}>
      {phone ? null : <View style={styles.checkboxSpace} />}
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
    gap: { xs: theme.space[3], md: theme.space[4], lg: theme.space[6] },
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
  // Phones: the two lines next to the logo.
  lines: {
    flex: 1,
    minWidth: 0,
    gap: theme.space[1],
  },
  // The table's columns.
  columns: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: { xs: theme.space[4], lg: theme.space[6] },
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: { xs: theme.space[2], md: theme.space[2.5] },
    minWidth: 0,
  },
  // It takes the room the account leaves: sized by its content, the category's
  // negative margins would make it a little too narrow and cut its name on the web.
  categoryCell: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  phoneAccount: {
    flexShrink: 1,
    maxWidth: '45%',
  },
  selectedMark: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accent.default,
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
    flex: 2.2,
  },
  categoryColumn: {
    flex: 1.6,
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
}));
