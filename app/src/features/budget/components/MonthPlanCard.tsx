import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Button, Card, ColorSwatch, StackedBar, Text, TextField } from '@/components/ui';
import { useDisplayCurrency } from '@/features/currency';
import { parseCents, toInput } from '@/lib/amount';
import { currencySymbols } from '@/lib/currency';
import { formatDateValue } from '@/lib/dates';
import { formatCurrency } from '@/lib/format';

import { setPlannedIncome } from '../api/budget';
import type { BudgetView } from '../api/useBudgetView';

/**
 * The month on one bar: the income, split into the fixed costs paid and to
 * pay, what went to everything else, and what's left. Below, the income it's
 * planned with, which the user can set.
 */
export function MonthPlanCard({ view, month }: { view: BudgetView; month: string }) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const { plan } = view;
  const name = formatDateValue(month, { month: 'long' });
  const over = plan.left < 0;
  const colors = { paid: theme.colors.chart.navy, pending: theme.colors.chart.sky, variable: theme.colors.chart.amber };
  const rows = [
    { id: 'paid', label: t('budget.plan.fixedPaid'), value: plan.fixedPaid, color: colors.paid },
    { id: 'pending', label: t('budget.plan.fixedPending'), value: plan.fixedPending, color: colors.pending },
    { id: 'variable', label: t('budget.plan.variable'), value: plan.variable, color: colors.variable },
  ];

  return (
    <Card title={t('budget.plan.title', { month: name })}>
      <Text tone="secondary" style={styles.description}>
        {t('budget.plan.description')}
      </Text>
      <StackedBar
        segments={[
          ...rows.map(({ id, value, color }) => ({ id, value, color })),
          // What's left shows as the empty part of the bar.
          { id: 'left', value: Math.max(plan.left, 0), color: 'transparent' },
        ]}
      />
      <View style={styles.legend}>
        {rows.map((row) => (
          <View key={row.id} style={styles.legendRow}>
            <ColorSwatch shape="square" color={row.color} />
            <Text tone="secondary" style={styles.legendLabel}>
              {row.label}
            </Text>
            <Text variant="bodyStrong">{formatCurrency(row.value / 100)}</Text>
          </View>
        ))}
        <View style={[styles.legendRow, styles.total]}>
          <Text variant="bodyStrong" style={styles.legendLabel}>
            {over ? t('budget.plan.over') : t('budget.plan.left')}
          </Text>
          <Text variant="bodyStrong" tone={over ? 'accent' : 'positive'}>
            {formatCurrency(Math.abs(plan.left) / 100)}
          </Text>
        </View>
      </View>
      <IncomeLine view={view} monthName={name} />
    </Card>
  );
}

/** The income the month is planned with, where it comes from, and a way to set it. */
function IncomeLine({ view, monthName }: { view: BudgetView; monthName: string }) {
  const { t } = useTranslation();
  const currency = useDisplayCurrency();
  const { plan } = view;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [failed, setFailed] = useState(false);
  const cents = parseCents(text);

  const save = (income: Parameters<typeof setPlannedIncome>[0]) => {
    setFailed(false);
    setPlannedIncome(income)
      .then(() => setEditing(false))
      .catch(() => setFailed(true));
  };

  if (editing) {
    return (
      <View style={styles.income}>
        <Text variant="captionStrong" tone="secondary">
          {t('budget.plan.incomeLabel')}
        </Text>
        <View style={styles.incomeEdit}>
          <TextField
            value={text}
            onChangeText={setText}
            placeholder={currencySymbols[currency]}
            accessibilityLabel={t('budget.plan.incomeLabel')}
            keyboardType="decimal-pad"
            onSubmitEditing={() => cents > 0 && save({ amount: cents, currency })}
            containerStyle={styles.incomeField}
          />
          <Button label={t('budget.form.cancel')} onPress={() => setEditing(false)} />
          <Button
            variant="primary"
            label={t('budget.form.save')}
            onPress={() => save({ amount: cents, currency })}
            disabled={!(cents > 0)}
          />
        </View>
        {failed ? <Text tone="accent">{t('budget.form.failed')}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.income}>
      <View style={styles.incomeRow}>
        <Text tone="secondary" style={styles.legendLabel}>
          {t('budget.plan.income', {
            amount: formatCurrency(plan.income / 100),
            source: t(`budget.kpis.incomeFrom.${plan.incomeSource}`).toLowerCase(),
          })}
        </Text>
        <View style={styles.incomeActions}>
          {plan.incomeSource === 'set' ? (
            <Button label={t('budget.plan.useSalary')} onPress={() => save(undefined)} />
          ) : null}
          <Button
            label={t('budget.plan.change')}
            onPress={() => {
              setText(plan.income > 0 ? toInput(plan.income) : '');
              setEditing(true);
            }}
          />
        </View>
      </View>
      {plan.received > 0 ? (
        <Text variant="caption" tone="tertiary">
          {t('budget.plan.received', { amount: formatCurrency(plan.received / 100), month: monthName })}
        </Text>
      ) : null}
      {failed ? <Text tone="accent">{t('budget.form.failed')}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  description: {
    marginTop: -theme.space[2],
  },
  legend: {
    gap: theme.space[2],
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2],
  },
  legendLabel: {
    flex: 1,
    minWidth: 0,
  },
  total: {
    paddingTop: theme.space[2],
    borderTopWidth: theme.layout.hairline,
    borderTopColor: theme.colors.border,
  },
  income: {
    gap: theme.space[2],
    paddingTop: theme.space[3],
    borderTopWidth: theme.layout.hairline,
    borderTopColor: theme.colors.border,
  },
  incomeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.space[2],
  },
  incomeActions: {
    flexDirection: 'row',
    gap: theme.space[2],
  },
  incomeEdit: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.space[2],
  },
  incomeField: {
    flexGrow: 1,
    flexBasis: 160,
  },
}));
