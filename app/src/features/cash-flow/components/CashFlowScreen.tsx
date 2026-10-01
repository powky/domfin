import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { DataNotice } from '@/components/DataNotice';
import { PeriodHeader, usePeriod } from '@/components/PeriodHeader';
import { Screen } from '@/components/Screen';

import { useCashFlow } from '../api/useCashFlow';
import { BreakdownCard } from './BreakdownCard';
import { WhereMoneyWentCard } from './WhereMoneyWentCard';

const incomeModeValues = ['category', 'merchant'] as const;

const expenseModeValues = ['group', 'category', 'merchant'] as const;

type IncomeMode = (typeof incomeModeValues)[number];
type ExpenseMode = (typeof expenseModeValues)[number];

export function CashFlowScreen() {
  const { t } = useTranslation();
  const { preset, range, setPreset, setRange } = usePeriod('ytd');
  const { data, status, latestStatement } = useCashFlow(range);
  const empty = data.income.total === 0 && data.expenses.total === 0;
  const [incomeMode, setIncomeMode] = useState<IncomeMode>('category');
  const [expenseMode, setExpenseMode] = useState<ExpenseMode>('group');

  const incomeModes = incomeModeValues.map((value) => ({ value, label: t(`cashFlow.modes.${value}`) }));
  const expenseModes = expenseModeValues.map((value) => ({ value, label: t(`cashFlow.modes.${value}`) }));

  const incomeItems = incomeMode === 'category' ? data.income.byCategory : data.income.byMerchant;
  const expenseItems =
    expenseMode === 'group'
      ? data.expenses.byGroup
      : expenseMode === 'category'
        ? data.expenses.byGroup.flatMap((group) => group.categories)
        : data.expenses.byMerchant;

  return (
    <Screen
      header={
        <PeriodHeader
          title={t('nav.cash-flow')}
          range={range}
          preset={preset}
          onRangeChange={setRange}
          onPresetChange={setPreset}
          latestStatement={latestStatement}
        />
      }
    >
      {empty ? (
        <DataNotice status={status} />
      ) : (
        <>
          <WhereMoneyWentCard summary={data} />
          <View style={styles.breakdowns}>
        <BreakdownCard
          title={t('cashFlow.income')}
          items={incomeItems}
          total={data.income.total}
          modes={incomeModes}
          mode={incomeMode}
          onModeChange={setIncomeMode}
        />
        <BreakdownCard
          title={t('cashFlow.expenses')}
          items={expenseItems}
          total={data.expenses.total}
          modes={expenseModes}
          mode={expenseMode}
          onModeChange={setExpenseMode}
        />
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create((theme) => ({
  breakdowns: {
    flexDirection: { xs: 'column', lg: 'row' },
    alignItems: { xs: 'stretch', lg: 'flex-start' },
    gap: theme.space[4],
  },
}));
