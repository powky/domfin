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
import { firstUnpaidMonth, monthsOf, yearPay, type MonthPay } from '../lib/salary';

/** Pay stubs are in pesos, and so is the salary set by hand. */
const money = (cents: number) => formatCurrency(cents / 100, 'DOP');

/** "julio de 2026" → "Julio de 2026". */
const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const payKinds = ['salary', 'overtime', 'bonus', 'christmas', 'benefit', 'other'] as const;
const deductionKinds = ['isr', 'afp', 'sfs', 'other'] as const;

/**
 * The gross salary in `month`, from the pay stubs or set by hand, and what
 * the stubs of the month paid and took. Without either, how to give it.
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
      {breakdown ? <Breakdown pay={breakdown} all={view.pay} /> : null}
    </Card>
  );
}

/** What a month's stubs paid and took, the net, and the year's ISR, AFP and SFS so far. */
function Breakdown({ pay, all }: { pay: MonthPay; all: MonthPay[] }) {
  const { t } = useTranslation();
  const year = Number(pay.month.slice(0, 4));
  const { deductions } = yearPay(
    all.filter((other) => other.month <= pay.month),
    year,
  );
  return (
    <View style={styles.breakdown}>
      <Text variant="overline" tone="tertiary">
        {t('salary.breakdown', { month: formatLongMonthYear(pay.month) })}
      </Text>
      {payKinds
        .filter((kind) => pay.pay[kind] > 0)
        .map((kind) => (
          <Row key={kind} label={t(`salary.pay.${kind}`)} value={money(pay.pay[kind])} />
        ))}
      {deductionKinds
        .filter((kind) => pay.deductions[kind] > 0)
        .map((kind) => (
          <Row key={`-${kind}`} label={t(`salary.deductions.${kind}`)} value={`−${money(pay.deductions[kind])}`} />
        ))}
      <View style={styles.total}>
        <Row label={t('salary.net')} value={money(pay.net)} strong />
      </View>
      <Text variant="caption" tone="tertiary">
        {t('salary.yearToDate', {
          year,
          deductions: (['isr', 'afp', 'sfs'] as const)
            .map((kind) => keepTogether(`${t(`salary.deductions.${kind}`)} ${money(deductions[kind])}`))
            .join(dotSeparator),
        })}
      </Text>
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
 * A gross salary from a month on: it counts until a pay stub says
 * otherwise. One set for the same month is replaced, or taken out.
 */
function SalaryForm({ view, month, onDone }: { view: SalaryView; month: string; onDone: () => void }) {
  const { t } = useTranslation();
  const { settings, current } = view;
  const [amount, setAmount] = useState(current ? toInput(current.amount) : '');
  // A salary counts until a stub says otherwise: by default, from the first month no stub pays.
  const [since, setSince] = useState(
    current?.source === 'manual' ? current.since : (firstUnpaidMonth(view.pay) ?? month),
  );
  const [state, setState] = useState<'idle' | 'saving' | 'failed'>('idle');
  const cents = parseCents(amount);
  const year = Number(month.slice(0, 4));
  const options = [...monthsOf(year - 1), ...monthsOf(year), ...monthsOf(year + 1)].map((value) => ({
    value,
    label: capitalized(formatLongMonthYear(value)),
  }));
  const others = settings.entries.filter((entry) => entry.since !== since);
  const existing = others.length < settings.entries.length;

  const save = (entries: typeof settings.entries) => {
    setState('saving');
    saveSalarySettings({ ...settings, entries })
      .then(() => {
        setState('idle');
        onDone();
      })
      .catch(() => setState('failed'));
  };
  const submit = () => {
    if (cents > 0) save([...others, { since, amount: cents, currency: 'DOP' }]);
  };

  return (
    <>
      <View style={styles.fields}>
        <Field label={t('salary.form.amount')} hint={t('salary.form.amountHint')} style={styles.amount}>
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
      {state === 'failed' ? <Text tone="accent">{t('salary.failed')}</Text> : null}
      <View style={styles.actions}>
        {existing ? (
          <Button label={t('salary.form.remove')} onPress={() => save(others)} disabled={state === 'saving'} />
        ) : null}
        <Button label={t('salary.form.cancel')} onPress={onDone} />
        <Button
          variant="primary"
          label={t('salary.form.save')}
          onPress={submit}
          disabled={!(cents > 0) || state === 'saving'}
        />
      </View>
    </>
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
  fields: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: theme.space[3],
  },
  amount: {
    flexGrow: 1,
    flexBasis: 220,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: theme.space[2],
  },
}));
