import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ColorSwatch, StatCard } from '@/components/ui';
import { formatLongMonthYear, formatMonthYear } from '@/lib/dates';
import { formatCurrency, formatPercent, formatSignedCurrency } from '@/lib/format';

import { isFavorable } from '../lib/accountTypes';
import type { AccountDetail } from '../types';

/** Balance and change for every account, then two numbers that matter for its type. */
export function AccountDetailKpis({ detail }: { detail: AccountDetail }) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const { account, months } = detail;
  const favorable = isFavorable(account);

  return (
    <View style={styles.grid}>
      <StatCard
        label={account.class === 'liability' ? t('accounts.detail.balanceOwed') : t('accounts.detail.balance')}
        value={formatCurrency(account.balance, account.currency)}
        caption={t('accounts.detail.asOf', { month: formatLongMonthYear(months[months.length - 1]) })}
      />
      <StatCard
        label={t('accounts.detail.change')}
        value={formatSignedCurrency(account.change, account.currency)}
        caption={t('accounts.detail.since', { month: formatLongMonthYear(months[0]) })}
        leading={favorable ? <ColorSwatch shape="square" color={theme.colors.chart.income} /> : undefined}
      />
      <TypeKpis detail={detail} />
    </View>
  );
}

function TypeKpis({ detail }: { detail: AccountDetail }) {
  const { t } = useTranslation();
  const { account, months, moneyOut } = detail;

  switch (account.type) {
    case 'credit-card': {
      const limit = account.creditLimit ?? 0;
      return (
        <>
          <StatCard
            label={t('accounts.detail.creditLimit')}
            value={formatCurrency(limit, account.currency)}
            caption={t('accounts.detail.used', { percent: formatPercent(limit > 0 ? account.balance / limit : 0) })}
          />
          <StatCard
            label={t('accounts.detail.availableCredit')}
            value={formatCurrency(Math.max(limit - account.balance, 0), account.currency)}
            caption={t('accounts.detail.charged', { amount: formatCurrency(moneyOut, account.currency) })}
          />
        </>
      );
    }
    case 'investment': {
      const peakIndex = account.history.indexOf(Math.max(...account.history));
      return (
        <>
          <StatCard
            label={t('accounts.detail.growth')}
            value={formatPercent(account.startBalance > 0 ? account.change / account.startBalance : 0)}
            caption={t('accounts.detail.growthCaption')}
          />
          <StatCard
            label={t('accounts.detail.highestBalance')}
            value={formatCurrency(account.history[peakIndex] ?? account.balance, account.currency)}
            caption={t('accounts.detail.endOf', {
              month: formatMonthYear(months[peakIndex] ?? months[months.length - 1]),
            })}
          />
        </>
      );
    }
    default: {
      // From balances rather than transactions, so they agree with the change above.
      const lowestIndex = account.history.indexOf(Math.min(...account.history));
      const average = account.history.reduce((sum, value) => sum + value, 0) / Math.max(account.history.length, 1);
      return (
        <>
          <StatCard
            label={t('accounts.detail.averageBalance')}
            value={formatCurrency(average, account.currency)}
            caption={t('accounts.detail.averageCaption')}
          />
          <StatCard
            label={t('accounts.detail.lowestBalance')}
            value={formatCurrency(account.history[lowestIndex] ?? account.balance, account.currency)}
            caption={t('accounts.detail.endOf', {
              month: formatMonthYear(months[lowestIndex] ?? months[months.length - 1]),
            })}
          />
        </>
      );
    }
  }
}

const styles = StyleSheet.create((theme) => ({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: { xs: theme.space[3], md: theme.space[4] },
  },
}));
