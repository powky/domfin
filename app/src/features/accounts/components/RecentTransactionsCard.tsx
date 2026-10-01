import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Card, Text } from '@/components/ui';
import { MerchantAvatar } from '@/features/transactions';
import { formatShortDate } from '@/lib/dates';
import { formatCurrency, formatSignedCurrency } from '@/lib/format';

import type { AccountDetail, AccountTransaction } from '../types';

const MAX_ROWS = 8;

/** The period's latest movements; the statements list every one. */
export function RecentTransactionsCard({ detail }: { detail: AccountDetail }) {
  const { t } = useTranslation();
  const { transactions } = detail;

  return (
    <Card title={t('accounts.recent.title')}>
      {transactions.length === 0 ? (
        <Text tone="secondary">{t('accounts.recent.empty')}</Text>
      ) : (
        <View accessibilityRole="list">
          {transactions.slice(0, MAX_ROWS).map((transaction, index) => (
            <TransactionRow key={transaction.id} transaction={transaction} divider={index > 0} />
          ))}
        </View>
      )}
    </Card>
  );
}

function TransactionRow({ transaction, divider }: { transaction: AccountTransaction; divider: boolean }) {
  const inflow = transaction.amount > 0;

  return (
    <View style={[styles.row, divider && styles.divider]}>
      {/* Leads a two-line row, like the institution avatars in the account list. */}
      <MerchantAvatar transaction={transaction} size="md" />
      <View style={styles.info}>
        <Text variant="bodyMedium" numberOfLines={1}>
          {transaction.merchant}
        </Text>
        <Text variant="caption" tone="secondary" numberOfLines={1}>
          {formatShortDate(transaction.date)} · {transaction.category}
        </Text>
      </View>
      <Text variant="bodyStrong" tone={inflow ? 'positive' : 'primary'}>
        {inflow
          ? formatSignedCurrency(transaction.amount, transaction.currency)
          : formatCurrency(transaction.amount, transaction.currency)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[3],
    paddingVertical: theme.space[2.5],
  },
  divider: {
    borderTopWidth: theme.layout.hairline,
    borderTopColor: theme.colors.border,
  },
  info: {
    flex: 1,
    minWidth: 0,
    gap: theme.space[0.5],
  },
}));
