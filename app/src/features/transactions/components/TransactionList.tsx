import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button, Text } from '@/components/ui';
import { formatNumber } from '@/lib/format';
import { usePhoneLayout } from '@/theme';

import type { Transaction, TransactionDay } from '../types';
import { TransactionDayHeader, TransactionRow, TransactionTableHeader } from './TransactionRow';

export type TransactionListProps = {
  days: TransactionDay[];
  accountNames: ReadonlyMap<string, string>;
  categoryLabels: ReadonlyMap<string, string>;
  selectedIds: ReadonlySet<string>;
  onToggle: (id: string, selected: boolean) => void;
  allSelected: boolean;
  someSelected: boolean;
  onToggleAll: (selected: boolean) => void;
  shownCount: number;
  totalCount: number;
  onShowMore: () => void;
  /** Offered in the empty state when search or filters are narrowing the list. */
  onClearFilters?: () => void;
  /** The categories that fit a transaction, to pick one from its row. */
  categoryOptionsFor?: (transaction: Transaction) => readonly { value: string; label: string }[];
  onCategorize?: (transaction: Transaction, categoryId: string | null) => void;
};

export function TransactionList({
  days,
  accountNames,
  categoryLabels,
  selectedIds,
  onToggle,
  allSelected,
  someSelected,
  onToggleAll,
  shownCount,
  totalCount,
  onShowMore,
  onClearFilters,
  categoryOptionsFor,
  onCategorize,
}: TransactionListProps) {
  const { t } = useTranslation();
  const phone = usePhoneLayout();
  if (totalCount === 0) {
    return (
      <View style={styles.empty}>
        <Text variant="heading">{t('transactions.list.empty')}</Text>
        <Text tone="secondary" align="center">
          {onClearFilters ? t('transactions.list.emptyFiltered') : t('transactions.list.emptyPeriod')}
        </Text>
        {onClearFilters ? <Button label={t('transactions.filters.clear')} onPress={onClearFilters} /> : null}
      </View>
    );
  }

  return (
    <View>
      {phone ? null : (
        <TransactionTableHeader
          checked={allSelected}
          indeterminate={someSelected && !allSelected}
          onToggleAll={onToggleAll}
        />
      )}
      {days.map((day) => (
        <View key={day.date}>
          <TransactionDayHeader day={day} phone={phone} />
          {day.transactions.map((transaction) => (
            <TransactionRow
              key={transaction.id}
              transaction={transaction}
              accountName={accountNames.get(transaction.accountId) ?? transaction.accountId}
              categoryLabels={categoryLabels}
              selected={selectedIds.has(transaction.id)}
              selecting={selectedIds.size > 0}
              phone={phone}
              onToggle={onToggle}
              categoryOptions={categoryOptionsFor?.(transaction)}
              onCategorize={onCategorize}
            />
          ))}
        </View>
      ))}
      {shownCount < totalCount ? (
        <View style={styles.footer}>
          <Text variant="caption" tone="secondary">
            {t('transactions.list.showing', {
              count: totalCount,
              shown: formatNumber(shownCount),
              total: formatNumber(totalCount),
            })}
          </Text>
          <Button label={t('transactions.list.showMore')} onPress={onShowMore} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  footer: {
    alignItems: 'center',
    gap: theme.space[2],
    paddingVertical: theme.space[5],
  },
  empty: {
    alignItems: 'center',
    gap: theme.space[2],
    paddingVertical: theme.space[12],
    paddingHorizontal: theme.space[6],
  },
}));
