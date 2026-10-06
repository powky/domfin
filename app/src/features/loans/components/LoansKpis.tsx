import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { StatCard } from '@/components/ui';
import { formatLongMonthYear } from '@/lib/dates';
import { formatCurrency } from '@/lib/format';

import type { LoansOverview } from '../types';

export function LoansKpis({ overview }: { overview: LoansOverview }) {
  const { t } = useTranslation();
  return (
    <View style={styles.grid}>
      <StatCard
        label={t('loans.kpis.totalOwed')}
        value={formatCurrency(overview.totalOwed)}
        caption={
          overview.change <= 0
            ? t('loans.kpis.down', { amount: formatCurrency(-overview.change) })
            : t('loans.kpis.up', { amount: formatCurrency(overview.change) })
        }
      />
      <StatCard
        label={t('loans.kpis.paid')}
        value={formatCurrency(overview.paidInPeriod)}
        caption={t('loans.kpis.payments', { count: overview.paymentsInPeriod })}
      />
      {overview.planned > 0 ? (
        <StatCard
          label={t('loans.kpis.interestLeft')}
          value={formatCurrency(overview.interestLeft)}
          caption={
            overview.debtFree
              ? t('loans.kpis.debtFree', { month: formatLongMonthYear(overview.debtFree) })
              : t('loans.kpis.planned', { planned: overview.planned, total: overview.loans.length })
          }
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: { xs: theme.space[3], md: theme.space[4] },
  },
}));
