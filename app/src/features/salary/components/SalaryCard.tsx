import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button, Card, Select, Text, TextField } from '@/components/ui';
import { Field } from '@/features/ledger';
import { parseCents, toInput } from '@/lib/amount';
import { currencySymbols } from '@/lib/currency';
import { formatLongMonthYear } from '@/lib/dates';
import { dotSeparator, formatCurrency, keepTogether } from '@/lib/format';

import { saveSalarySettings } from '../api/salary';
import { useSalaryView, type SalaryView } from '../api/useSalaryView';
import { firstUnpaidMonth, monthsOf, type MonthBreakdown } from '../lib/salary';
import { deductionsByLaw } from '../lib/tax';
import type { SalaryEntry } from '../types';

/** Pay stubs are in pesos, and so is the salary set by hand. */
const money = (cents: number) => formatCurrency(cents / 100, 'DOP');

/** "julio de 2026" → "Julio de 2026". */
const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const payKinds = ['salary', 'overtime', 'bonus', 'christmas', 'benefit', 'other'] as const;
const deductionKinds = ['isr', 'afp', 'sfs', 'other'] as const;
const lawKinds = ['isr', 'afp', 'sfs'] as const;

/**
 * The gross salary in `month`, from the pay stubs or set by hand, and the
 * month's pay: what the stubs paid and took, or the salary set by hand with
 * its deductions. Without either, how to give it.
 */
export function SalaryCard({ month }: { month: string }) {
  const { t } = useTranslation();
  const view = useSalaryView(month);
  const [editing, setEditing] = useState(false);
  if (view.status !== 'ready') return null;
  const { current, breakdown } = view;

  if (editing) {
    return (
      <Card title={t('salary.title')}>
        <SalaryForm view={view} month={month} onDone={() => setEditing(false)} />
      </Card>
    );
  }
  if (!current && !breakdown) {
    return (
      <Card title={t('salary.title')}>
        <Text tone="secondary" style={styles.intro}>
          {t('salary.intro')}
        </Text>
        <View style={styles.actions}>
          <Button variant="primary" label={t('salary.set')} onPress={() => setEditing(true)} />
        </View>
      </Card>
    );
  }

  return (
    <Card title={t('salary.title')} actions={<Button label={t('salary.change')} onPress={() => setEditing(true)} />}>
      {current ? (
        <View>
          <Text variant="kpi">{money(current.amount)}</Text>
          <Text tone="secondary">
            {[
              t('salary.gross'),
              t('salary.since', { month: formatLongMonthYear(current.since) }),
              t(`salary.from.${current.source}`),
            ]
              .map(keepTogether)
              .join(dotSeparator)}
          </Text>
        </View>
      ) : null}
      {breakdown ? <Breakdown breakdown={breakdown} view={view} /> : null}
    </Card>
  );
}

/** A month's pay, its net, and the year's ISR, AFP and SFS so far; what the law figured, with "≈". */
function Breakdown({ breakdown, view }: { breakdown: MonthBreakdown; view: SalaryView }) {
  const { t } = useTranslation();
  const year = Number(breakdown.month.slice(0, 4));
  const estimated = breakdown.estimated.length > 0;
  const approx = (kind: string, text: string) => ((breakdown.estimated as string[]).includes(kind) ? `≈ ${text}` : text);
  const { yearToDate } = view;
  return (
    <View style={styles.breakdown}>
      <Text variant="overline" tone="tertiary">
        {breakdown.source === 'payslips'
          ? t('salary.breakdown', { month: formatLongMonthYear(breakdown.month) })
          : t('salary.manualBreakdown', { month: formatLongMonthYear(breakdown.month) })}
      </Text>
      {payKinds
        .filter((kind) => breakdown.pay[kind] > 0)
        .map((kind) => (
          <Row key={kind} label={t(`salary.pay.${kind}`)} value={money(breakdown.pay[kind])} />
        ))}
      {deductionKinds
        .filter((kind) => breakdown.deductions[kind] > 0)
        .map((kind) => (
          <Row key={`-${kind}`} label={t(`salary.deductions.${kind}`)} value={approx(kind, `−${money(breakdown.deductions[kind])}`)} />
        ))}
      <View style={styles.total}>
        <Row label={t('salary.net')} value={estimated ? `≈ ${money(breakdown.net)}` : money(breakdown.net)} strong />
      </View>
      {yearToDate ? (
        <Text variant="caption" tone="tertiary">
          {t(yearToDate.estimated ? 'salary.yearToDateEstimated' : 'salary.yearToDate', {
            year,
            deductions: lawKinds
              .map((kind) => keepTogether(`${t(`salary.deductions.${kind}`)} ${money(yearToDate[kind])}`))
              .join(dotSeparator),
          })}
        </Text>
      ) : null}
      {estimated ? (
        <Text variant="caption" tone="tertiary">
          {t('salary.byLaw')}
        </Text>
      ) : null}
    </View>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text variant={strong ? 'bodyStrong' : 'body'} tone={strong ? 'primary' : 'secondary'} style={styles.grow}>
        {label}
      </Text>
      <Text variant="bodyStrong">{value}</Text>
    </View>
  );
}

/**
 * A gross salary from a month on, with the deductions its stub says: the
 * ones left empty are figured by law. It counts until a pay stub says
 * otherwise. One set for the same month is replaced, or taken out.
 */
function SalaryForm({ view, month, onDone }: { view: SalaryView; month: string; onDone: () => void }) {
  const { t } = useTranslation();
  const { settings, current } = view;
  // A salary counts until a stub says otherwise: by default, from the first month no stub pays.
  const [since, setSince] = useState(current?.source === 'manual' ? current.since : (firstUnpaidMonth(view.pay) ?? month));
  const editing = settings.entries.find((entry) => entry.since === since);
  const [amount, setAmount] = useState(current ? toInput(current.amount) : '');
  const initial = (kind: (typeof deductionKinds)[number]) => (editing?.[kind] !== undefined ? toInput(editing[kind]) : '');
  const [deductions, setDeductions] = useState(() => Object.fromEntries(deductionKinds.map((kind) => [kind, initial(kind)])));
  const [state, setState] = useState<'idle' | 'saving' | 'failed'>('idle');
  const cents = parseCents(amount);
  const law = cents > 0 ? deductionsByLaw(cents) : undefined;
  const given = Object.fromEntries(
    deductionKinds.filter((kind) => deductions[kind].trim() !== '').map((kind) => [kind, parseCents(deductions[kind])]),
  ) as Partial<Record<(typeof deductionKinds)[number], number>>;
  const taken = Object.values(given).reduce((total, value) => total + value, 0);
  const valid = cents > 0 && Object.values(given).every((value) => value >= 0) && taken <= cents;

  const year = Number(month.slice(0, 4));
  const options = [...monthsOf(year - 1), ...monthsOf(year), ...monthsOf(year + 1)].map((value) => ({
    value,
    label: capitalized(formatLongMonthYear(value)),
  }));
  const others = settings.entries.filter((entry) => entry.since !== since);

  const save = (entries: SalaryEntry[]) => {
    setState('saving');
    saveSalarySettings({ ...settings, entries })
      .then(() => {
        setState('idle');
        onDone();
      })
      .catch(() => setState('failed'));
  };
  const submit = () => {
    if (valid) save([...others, { since, amount: cents, currency: 'DOP', ...given }]);
  };

  return (
    <View style={styles.form}>
      <View style={styles.fields}>
        <Field label={t('salary.form.amount')} hint={t('salary.form.amountHint')} style={styles.wide}>
          <TextField
            value={amount}
            onChangeText={setAmount}
            placeholder={currencySymbols.DOP}
            accessibilityLabel={t('salary.form.amount')}
            keyboardType="decimal-pad"
            onSubmitEditing={submit}
          />
        </Field>
        <Field label={t('salary.form.since')}>
          <Select options={options} value={since} onChange={setSince} accessibilityLabel={t('salary.form.since')} />
        </Field>
      </View>
      <View style={styles.deductions}>
        <Text variant="captionStrong" tone="secondary">
          {t('salary.form.deductions')}
        </Text>
        <View style={styles.fields}>
          {deductionKinds.map((kind) => (
            <Field key={kind} label={t(`salary.deductions.${kind}`)} style={styles.deduction}>
              <TextField
                value={deductions[kind]}
                onChangeText={(text) => setDeductions((before) => ({ ...before, [kind]: text }))}
                placeholder={law && kind !== 'other' ? `≈ ${toInput(law[kind])}` : currencySymbols.DOP}
                accessibilityLabel={t(`salary.deductions.${kind}`)}
                keyboardType="decimal-pad"
                onSubmitEditing={submit}
              />
            </Field>
          ))}
        </View>
        <Text variant="caption" tone="tertiary">
          {t('salary.form.deductionsHint')}
        </Text>
      </View>
      {cents > 0 && taken > cents ? <Text tone="accent">{t('salary.form.tooMuch')}</Text> : null}
      {state === 'failed' ? <Text tone="accent">{t('salary.failed')}</Text> : null}
      <View style={styles.actions}>
        {editing ? <Button label={t('salary.form.remove')} onPress={() => save(others)} disabled={state === 'saving'} /> : null}
        <Button label={t('salary.form.cancel')} onPress={onDone} />
        <Button variant="primary" label={t('salary.form.save')} onPress={submit} disabled={!valid || state === 'saving'} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  intro: {
    marginTop: -theme.space[2],
  },
  breakdown: {
    gap: theme.space[2],
    paddingTop: theme.space[3],
    borderTopWidth: theme.layout.hairline,
    borderTopColor: theme.colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2],
  },
  grow: {
    flex: 1,
    minWidth: 0,
  },
  total: {
    paddingTop: theme.space[2],
    borderTopWidth: theme.layout.hairline,
    borderTopColor: theme.colors.border,
  },
  form: {
    gap: theme.space[4],
  },
  fields: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: theme.space[3],
  },
  wide: {
    flexGrow: 1,
    flexBasis: 220,
  },
  deductions: {
    gap: theme.space[2],
  },
  deduction: {
    flexGrow: 1,
    flexBasis: 120,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: theme.space[2],
  },
}));
