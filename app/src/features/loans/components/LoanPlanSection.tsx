import { Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Button, Card, ProgressBar, SegmentedControl, StatCard, Text, TextField } from '@/components/ui';
import { Field } from '@/features/ledger';
import { parseCents, parseDecimal, toInput } from '@/lib/amount';
import { currencySymbols, type Currency } from '@/lib/currency';
import { formatLongMonthYear } from '@/lib/dates';
import { decimalSeparator, formatCurrency, formatPercent } from '@/lib/format';

import { saveLoanPlan } from '../api/plans';
import { useLoanPlan, type LoanPlan } from '../api/useLoanPlan';
import type { LoanTerms, Payoff } from '../lib/payoff';

type Payer = 'you' | 'part' | 'all';
const payers = ['you', 'part', 'all'] as const satisfies readonly Payer[];

/** "marzo de 2029" → "Marzo de 2029": only the first letter, as a sentence starts. */
const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** 0.125 → "12.5%": as many decimals as the rate has, up to two. */
function ratePercent(rate: number) {
  const hundredths = Math.round(rate * 10_000);
  return formatPercent(rate, hundredths % 100 === 0 ? 0 : hundredths % 10 === 0 ? 1 : 2);
}

/** 0.125 → "12.5", as the user types it back. */
const rateInput = (rate: number) => String(Math.round(rate * 10_000) / 100).replace('.', decimalSeparator());

/**
 * When a loan ends and what it costs, on its account's page: from the rate
 * and installment the user gives it, or from a debt's installment schedule.
 * Without them, the form to give them.
 */
export function LoanPlanSection({ accountId, currency }: { accountId: string; currency: Currency }) {
  const { plan, status } = useLoanPlan(accountId);
  const [editing, setEditing] = useState(false);
  if (!plan || status !== 'ready') return null;
  const editable = plan.source !== 'schedule';
  if (editable && (editing || !plan.terms)) {
    return (
      <TermsForm
        plan={plan}
        currency={currency}
        onDone={() => setEditing(false)}
        onCancel={plan.terms ? () => setEditing(false) : undefined}
      />
    );
  }
  if (!plan.terms || !plan.payoff) return null;
  return (
    <Projection
      plan={plan}
      terms={plan.terms}
      payoff={plan.payoff}
      currency={currency}
      onChange={editable ? () => setEditing(true) : undefined}
    />
  );
}

function TermsForm({
  plan,
  currency,
  onDone,
  onCancel,
}: {
  plan: LoanPlan;
  currency: Currency;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const { terms } = plan;
  // The latest payment is usually the installment: it starts there.
  const suggested = plan.history.lastPayment?.amount;
  const [rate, setRate] = useState(terms ? rateInput(terms.rate) : '');
  const [installment, setInstallment] = useState(
    terms ? toInput(terms.installment) : suggested ? toInput(suggested) : '',
  );
  const [payer, setPayer] = useState<Payer>(
    !terms?.subsidy ? 'you' : terms.subsidy >= terms.installment ? 'all' : 'part',
  );
  const [subsidy, setSubsidy] = useState(
    terms?.subsidy && terms.subsidy < terms.installment ? toInput(terms.subsidy) : '',
  );
  const [state, setState] = useState<'idle' | 'saving' | 'failed'>('idle');

  const percent = parseDecimal(rate);
  const cents = parseCents(installment);
  const theirs = payer === 'all' ? cents : payer === 'part' ? parseCents(subsidy) : 0;
  const valid = percent >= 0 && percent < 100 && cents > 0 && (payer !== 'part' || (theirs > 0 && theirs <= cents));

  const run = (action: () => Promise<unknown>) => {
    setState('saving');
    action()
      .then(() => {
        setState('idle');
        onDone();
      })
      .catch(() => setState('failed'));
  };
  const save = () => {
    if (!valid) return;
    const next: LoanTerms = { rate: percent / 100, installment: cents };
    if (theirs > 0) next.subsidy = theirs;
    run(() => saveLoanPlan(plan.accountId, next));
  };

  const installmentHint = [
    t('loans.plan.installmentHint'),
    suggested ? t('loans.plan.lastPayment', { amount: formatCurrency(suggested / 100, currency) }) : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Card title={t('loans.plan.title')}>
      {terms ? null : (
        <Text tone="secondary" style={styles.intro}>
          {t('loans.plan.intro')}
        </Text>
      )}
      <View style={styles.fields}>
        <Field label={t('loans.plan.rate')} style={styles.rate}>
          <View style={styles.inputRow}>
            <TextField
              value={rate}
              onChangeText={setRate}
              placeholder={t('loans.plan.ratePlaceholder')}
              accessibilityLabel={t('loans.plan.rate')}
              keyboardType="decimal-pad"
              onSubmitEditing={save}
              containerStyle={styles.grow}
            />
            <Text tone="secondary">%</Text>
          </View>
        </Field>
        <Field label={t('loans.plan.installment')} hint={installmentHint} style={styles.installment}>
          <TextField
            value={installment}
            onChangeText={setInstallment}
            placeholder={currencySymbols[currency]}
            accessibilityLabel={t('loans.plan.installment')}
            keyboardType="decimal-pad"
            onSubmitEditing={save}
          />
        </Field>
        <Field label={t('loans.plan.payer')} hint={t('loans.plan.payerHint')} style={styles.payer}>
          <SegmentedControl
            options={payers.map((value) => ({ value, label: t(`loans.plan.payers.${value}`) }))}
            value={payer}
            onChange={setPayer}
            accessibilityLabel={t('loans.plan.payer')}
          />
        </Field>
        {payer === 'part' ? (
          <Field label={t('loans.plan.subsidy')} style={styles.installment}>
            <TextField
              value={subsidy}
              onChangeText={setSubsidy}
              placeholder={currencySymbols[currency]}
              accessibilityLabel={t('loans.plan.subsidy')}
              keyboardType="decimal-pad"
              onSubmitEditing={save}
            />
          </Field>
        ) : null}
      </View>
      {state === 'failed' ? <Text tone="accent">{t('loans.plan.failed')}</Text> : null}
      <View style={styles.actions}>
        {terms ? (
          <View style={styles.remove}>
            <Button
              icon={Trash2}
              label={t('loans.plan.remove')}
              onPress={() => run(() => saveLoanPlan(plan.accountId, null))}
              disabled={state === 'saving'}
            />
          </View>
        ) : null}
        {onCancel ? <Button label={t('loans.plan.cancel')} onPress={onCancel} /> : null}
        <Button
          variant="primary"
          label={terms ? t('loans.plan.save') : t('loans.plan.calculate')}
          onPress={save}
          disabled={!valid || state === 'saving'}
        />
      </View>
    </Card>
  );
}

/** When it ends, what's left and its interest; then the year by year. */
function Projection({
  plan,
  terms,
  payoff,
  currency,
  onChange,
}: {
  plan: LoanPlan;
  terms: LoanTerms;
  payoff: Payoff;
  currency: Currency;
  onChange?: () => void;
}) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const money = (cents: number) => formatCurrency(cents / 100, currency);
  const shared = (terms.subsidy ?? 0) > 0 && (terms.subsidy ?? 0) < terms.installment;
  const termsLine = shared
    ? t('loans.plan.termsShared', {
        rate: ratePercent(terms.rate),
        installment: money(terms.installment),
        theirs: money(terms.subsidy ?? 0),
      })
    : t('loans.plan.terms', { rate: ratePercent(terms.rate), installment: money(terms.installment) });

  const header = (
    <View style={styles.termsRow}>
      <View style={styles.grow}>
        <Text tone="secondary">{termsLine}</Text>
        {plan.source === 'schedule' ? (
          <Text variant="caption" tone="tertiary">
            {t('loans.plan.fromSchedule')}
          </Text>
        ) : null}
      </View>
      {onChange ? <Button label={t('loans.plan.change')} onPress={onChange} /> : null}
    </View>
  );

  if (payoff.status !== 'ends') {
    return (
      <Card title={t('loans.plan.title')}>
        {header}
        <Text tone={payoff.status === 'never' ? 'accent' : 'secondary'}>
          {payoff.status === 'never'
            ? t('loans.plan.never', { installment: money(terms.installment), interest: money(payoff.interest) })
            : t('loans.plan.paid')}
        </Text>
      </Card>
    );
  }

  const interestPaid = plan.history.interestPaid;
  return (
    <>
      <View style={styles.grid}>
        {/* A bank loan's page shows what's owed already; a debt's schedule doesn't. */}
        {plan.source === 'schedule' ? <StatCard label={t('loans.plan.owed')} value={money(payoff.principal)} /> : null}
        <StatCard
          label={t('loans.plan.ends')}
          value={capitalized(formatLongMonthYear(payoff.last))}
          caption={t('loans.plan.payments', { count: payoff.payments })}
        />
        <StatCard
          label={t('loans.plan.left')}
          value={money(payoff.total)}
          caption={t('loans.plan.leftDetail', { interest: money(payoff.interest) })}
        />
        <StatCard
          label={t('loans.plan.interest')}
          value={money(interestPaid + payoff.interest)}
          caption={
            interestPaid > 0
              ? t('loans.plan.interestDetail', { paid: money(interestPaid) })
              : t('loans.plan.interestLeftOnly')
          }
        />
        {payoff.theirs > 0 ? (
          <StatCard
            label={t('loans.plan.yours')}
            value={money(payoff.yours)}
            caption={
              payoff.yours === 0 ? t('loans.plan.allTheirs') : t('loans.plan.theirs', { amount: money(payoff.theirs) })
            }
          />
        ) : null}
      </View>
      <Card title={t('loans.plan.title')}>
        {header}
        {plan.progress ? (
          <View style={styles.progress}>
            <Text variant="bodyMedium">{t('loans.plan.progress', { percent: formatPercent(plan.progress, 0) })}</Text>
            <ProgressBar value={plan.progress} color={theme.colors.positive} />
          </View>
        ) : null}
        <View>
          <Text variant="overline" tone="tertiary">
            {t('loans.plan.byYear')}
          </Text>
          <View accessibilityRole="list">
            {payoff.years.map((year, index) => (
              <View key={year.year} style={[styles.row, index > 0 && styles.divider]}>
                <View style={styles.rowText}>
                  <Text variant="bodyStrong">{year.year}</Text>
                  <Text variant="caption" tone="secondary">
                    {t('loans.plan.yearDetail', { interest: money(year.interest), principal: money(year.principal) })}
                  </Text>
                </View>
                <Text variant="bodyMedium" tone={year.balance === 0 ? 'positive' : 'secondary'}>
                  {year.balance === 0 ? t('loans.plan.paidOff') : t('loans.plan.remaining', { amount: money(year.balance) })}
                </Text>
              </View>
            ))}
          </View>
        </View>
        <Text variant="caption" tone="tertiary">
          {t('loans.plan.note')}
        </Text>
      </Card>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  intro: {
    marginTop: -theme.space[2],
  },
  fields: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: theme.space[3],
  },
  rate: {
    flexGrow: 1,
    flexBasis: { xs: '100%', md: 160 },
  },
  installment: {
    flexGrow: 1,
    flexBasis: { xs: '100%', md: 200 },
  },
  payer: {
    flexGrow: 2,
    flexBasis: { xs: '100%', md: 320 },
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2],
  },
  grow: {
    flex: 1,
    minWidth: 0,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: theme.space[2],
  },
  // On the far left, away from Save.
  remove: {
    marginRight: 'auto',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: { xs: theme.space[3], md: theme.space[4] },
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[3],
    marginTop: -theme.space[2],
  },
  progress: {
    gap: theme.space[2],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[3],
    paddingVertical: theme.space[3],
  },
  divider: {
    borderTopWidth: theme.layout.hairline,
    borderTopColor: theme.colors.border,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: theme.space[0.5],
  },
}));
