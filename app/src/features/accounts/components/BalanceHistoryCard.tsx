import { useTranslation } from 'react-i18next';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { LineChart } from '@/components/charts';
import { Card, Text } from '@/components/ui';
import { formatMonthYear } from '@/lib/dates';
import { formatCompactCurrency, formatCurrency } from '@/lib/format';
import { shortMonthLabel } from '@/lib/period';

import type { AccountSummary } from '../types';

/** Month-end balances in the period, drawn like the net worth line. */
export function BalanceHistoryCard({ account, months }: { account: AccountSummary; months: string[] }) {
  const { theme, rt } = useUnistyles();
  const { t } = useTranslation();
  const tap = rt.breakpoint === 'xs' || rt.breakpoint === 'sm';
  const liability = account.class === 'liability';
  const title = liability ? t('accounts.history.owedTitle') : t('accounts.history.balanceTitle');
  const label = liability ? t('accounts.history.owed') : t('accounts.history.balance');
  const hint = t(tap ? 'accounts.history.balanceHintTap' : 'accounts.history.balanceHintHover');

  return (
    <Card title={title}>
      <Text variant="body" tone="secondary" style={styles.hint}>
        {hint}
      </Text>
      <LineChart
        labels={months.map(shortMonthLabel)}
        series={[{ id: account.id, label, color: theme.colors.accent.default, values: account.history }]}
        formatTick={(value) => formatCompactCurrency(value, 2, account.currency)}
        formatValue={(value) => formatCurrency(value, account.currency)}
        formatTitle={(index) => t('accounts.history.endOf', { month: formatMonthYear(months[index]) })}
        area
        accessibilityLabel={t('accounts.history.label', { title, name: account.name })}
      />
    </Card>
  );
}

const styles = StyleSheet.create((theme) => ({
  hint: {
    marginTop: -theme.space[2],
  },
}));
