import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { DataNotice } from '@/components/DataNotice';
import { PageHeader } from '@/components/PageHeader';
import { formatLatestStatement } from '@/components/PeriodHeader';
import { Screen } from '@/components/Screen';
import { Button, Text } from '@/components/ui';
import { SalaryCard, YearEndCard } from '@/features/salary';
import { addMonths, formatDateValue } from '@/lib/dates';
import { LATEST_MONTH, LEDGER_MONTHS } from '@/lib/period';

import { useBudgetView } from '../api/useBudgetView';
import { BudgetKpis } from './BudgetKpis';
import { FixedCostsCard } from './FixedCostsCard';
import { MonthPlanCard } from './MonthPlanCard';
import { SuggestionsCard } from './SuggestionsCard';

/** The months the budget can show: the ledger's, and the next one to plan ahead. */
const MONTHS = [...LEDGER_MONTHS, addMonths(LEDGER_MONTHS[LATEST_MONTH], 1)];

/**
 * The monthly budget: what you pay every month no matter what, found in your
 * statements, and the month planned around it; the salary, and what the
 * year's end brings besides it.
 */
export function BudgetScreen() {
  const { t } = useTranslation();
  // This month, to start with.
  const [index, setIndex] = useState(LATEST_MONTH);
  const month = MONTHS[index];
  const view = useBudgetView(month);

  return (
    <Screen
      header={
        <PageHeader
          title={t('nav.budget')}
          subtitle={formatLatestStatement(view.through || undefined)}
          actions={<MonthStepper index={index} onChange={setIndex} />}
        />
      }
    >
      {view.status !== 'ready' ? (
        <DataNotice status={view.status === 'empty' ? 'ready' : view.status} />
      ) : (
        <>
          <BudgetKpis view={view} month={month} />
          <MonthPlanCard view={view} month={month} />
          <FixedCostsCard view={view} month={month} />
          <SalaryCard month={month} />
          <YearEndCard month={month} />
          <SuggestionsCard view={view} />
        </>
      )}
    </Screen>
  );
}

/** "‹ October 2026 ›" */
function MonthStepper({ index, onChange }: { index: number; onChange: (index: number) => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.stepper} accessibilityLabel={t('budget.month.label')}>
      <Button
        icon={ChevronLeft}
        iconOnly
        disabled={index === 0}
        onPress={() => onChange(index - 1)}
        accessibilityLabel={t('budget.month.previous')}
      />
      <Text variant="bodyStrong" style={styles.label} numberOfLines={1}>
        {capitalized(formatDateValue(MONTHS[index], { month: 'long', year: 'numeric' }))}
      </Text>
      <Button
        icon={ChevronRight}
        iconOnly
        disabled={index === MONTHS.length - 1}
        onPress={() => onChange(index + 1)}
        accessibilityLabel={t('budget.month.next')}
      />
    </View>
  );
}

/** "octubre de 2026" → "Octubre de 2026": only the first letter, as a sentence starts. */
const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const styles = StyleSheet.create((theme) => ({
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: { xs: theme.space[1.5], md: theme.space[2] },
  },
  label: {
    minWidth: 128,
    textAlign: 'center',
  },
}));
