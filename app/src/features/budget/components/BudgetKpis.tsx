import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { StatCard } from '@/components/ui';
import { formatDateValue } from '@/lib/dates';
import { formatCurrency, formatPercent } from '@/lib/format';

import type { BudgetView } from '../api/useBudgetView';

/** What the fixed costs add up to, the income, what's left for the rest and what's paid in `month`. */
export function BudgetKpis({ view, month }: { view: BudgetView; month: string }) {
  const { t } = useTranslation();
  const { plan } = view;
  const count = plan.items.length;
  const paid = plan.items.filter((row) => row.paid > 0).length;
  const rest = plan.income - plan.fixed;
  return (
    <View style={styles.grid}>
      <StatCard
        label={t('budget.kpis.fixed')}
        value={formatCurrency(plan.fixed / 100)}
        caption={t('budget.kpis.count', { count })}
      />
      <StatCard
        label={t('budget.kpis.income')}
        value={formatCurrency(plan.income / 100)}
        caption={t(`budget.kpis.incomeFrom.${plan.incomeSource}`)}
      />
      <StatCard
        label={t('budget.kpis.rest')}
        value={formatCurrency(rest / 100)}
        caption={
          plan.income <= 0 || plan.fixed <= 0
            ? undefined
            : rest < 0
              ? t('budget.kpis.restOver')
              : t('budget.kpis.restShare', { percent: formatPercent(plan.fixed / plan.income, 0) })
        }
      />
      <StatCard
        label={t('budget.kpis.paid', { month: formatDateValue(month, { month: 'long' }) })}
        value={formatCurrency(plan.fixedPaid / 100)}
        caption={
          count === 0
            ? t('budget.kpis.paidNone')
            : paid === count
              ? t('budget.kpis.paidAll', { count })
              : t('budget.kpis.paidSome', { paid, count, pending: formatCurrency(plan.fixedPending / 100) })
        }
      />
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
