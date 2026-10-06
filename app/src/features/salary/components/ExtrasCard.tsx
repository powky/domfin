import type { TFunction } from 'i18next';
import { ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Button, Card, Checkbox, SegmentedControl, Select, Text, TextField, Touchable } from '@/components/ui';
import { Field } from '@/features/ledger';
import { parseCents, parseDecimal, toInput } from '@/lib/amount';
import { currencySymbols } from '@/lib/currency';
import { formatDateValue } from '@/lib/dates';
import { decimalSeparator, formatCurrency, formatPercent } from '@/lib/format';

import { saveSalarySettings } from '../api/salary';
import { useSalaryView, type SalaryView } from '../api/useSalaryView';
import { salaryByMonth, yearPay } from '../lib/salary';
import { christmasSalary, extraPayments, type ExtraPayment } from '../lib/yearEnd';
import type { Extra, ExtraInput, ExtraKind, ExtraTax } from '../types';

const money = (cents: number) => formatCurrency(cents / 100, 'DOP');
const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const pad = (month: number) => String(month).padStart(2, '0');

/** A month's name, "diciembre", from a month of any year. */
const monthName = (month: number) => formatDateValue(`2026-${pad(month)}`, { month: 'long' });

/** A number as the user types it back: "1.5", or "1,5" where decimals follow a comma. */
const numberInput = (value: number) => String(value).replace('.', decimalSeparator());

/** A real day written as YYYY-MM-DD. */
function isDate(text: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(text);
}

/**
 * What the job pays besides the salary in the year of `month`: the
 * Christmas salary, which the law fixes for everyone, and the payments the
 * user describes (a bonus, a performance or school bonus), each figured as
 * they say it's figured.
 */
export function ExtrasCard({ month }: { month: string }) {
  const { t } = useTranslation();
  const view = useSalaryView(month);
  // The payment being edited: its ID, 'new', or none.
  const [editing, setEditing] = useState<string | null>(null);
  if (view.status !== 'ready') return null;
  const year = Number(month.slice(0, 4));
  const months = salaryByMonth(year, view.read);
  const salary = months.reduce((total, other) => total + other.amount, 0);
  if (salary <= 0) return null;

  const christmas = christmasSalary(months);
  const extras = yearPay(view.pay, year).pay;
  const payments = extraPayments(view.settings.extras, months, {
    year,
    hiredOn: view.settings.hiredOn,
    otherTaxable: extras.bonus + extras.overtime + extras.other,
  });
  const total = christmas + payments.reduce((sum, payment) => sum + (payment.status === 'ready' ? payment.net : 0), 0);

  if (editing) {
    return (
      <Card title={t('salary.extras.title')}>
        <ExtraForm view={view} extra={view.settings.extras.find((extra) => extra.id === editing)} onDone={() => setEditing(null)} />
      </Card>
    );
  }

  return (
    <Card title={t('salary.extras.title')}>
      <Item
        label={t('salary.extras.christmas')}
        value={money(christmas)}
        detail={t('salary.extras.christmasDetail', { year, total: money(salary) })}
      />
      {payments.map((payment) => (
        <Touchable
          key={payment.extra.id}
          onPress={() => setEditing(payment.extra.id)}
          accessibilityRole="button"
          accessibilityLabel={t('salary.extras.change', { name: payment.extra.name })}
          surfaceStyle={styles.pressable}
          hoverStyle={styles.hovered}
        >
          <Item
            label={payment.extra.name}
            value={payment.status === 'ready' ? money(payment.net) : '—'}
            detail={detailOf(payment, t)}
            chevron
          />
        </Touchable>
      ))}
      {payments.length === 0 ? <Text tone="secondary">{t('salary.extras.intro')}</Text> : null}
      <View style={styles.total}>
        <Text variant="bodyStrong">{t('salary.extras.total', { year, amount: money(total) })}</Text>
        <Text variant="caption" tone="tertiary">
          {t('salary.extras.estimate')}
        </Text>
      </View>
      <View style={styles.actions}>
        <Button variant={payments.length === 0 ? 'primary' : 'secondary'} label={t('salary.extras.add')} onPress={() => setEditing('new')} />
      </View>
    </Card>
  );
}

/** "En diciembre · 60 días de tu sueldo promedio (… ÷ 23.83 × 60 = …), menos … de ISR." */
function detailOf(payment: ExtraPayment, t: TFunction) {
  const { extra } = payment;
  const when = t('salary.extras.in', { month: monthName(extra.month) });
  if (payment.status === 'needsHireDate') return `${when} · ${t('salary.extras.needsHireDate')}`;
  const base =
    extra.base === 'month'
      ? t('salary.extras.baseText.month', { month: monthName(extra.month) })
      : t('salary.extras.baseText.average');
  const amount =
    extra.kind === 'days'
      ? t('salary.extras.days', { days: payment.days, base, amount: money(payment.base ?? 0), gross: money(payment.gross) })
      : extra.kind === 'salaries'
        ? t('salary.extras.salaries', { value: numberInput(extra.value ?? 0), base, amount: money(payment.base ?? 0), gross: money(payment.gross) })
        : t('salary.extras.fixed', { gross: money(payment.gross) });
  const tax = t(`salary.extras.taxText.${extra.tax}`, { isr: money(payment.isr), rate: formatPercent(extra.rate ?? 0, 0) });
  return `${when} · ${amount}${tax}.`;
}

function Item({ label, value, detail, chevron }: { label: string; value: string; detail: string; chevron?: boolean }) {
  const { theme } = useUnistyles();
  return (
    <View style={styles.item}>
      <View style={styles.row}>
        <Text variant="bodyStrong" style={styles.grow}>
          {label}
        </Text>
        <Text variant="bodyStrong" tone="positive">
          {value}
        </Text>
        {chevron ? <ChevronRight size={16} strokeWidth={2} color={theme.colors.text.tertiary} /> : null}
      </View>
      <Text variant="caption" tone="secondary">
        {detail}
      </Text>
    </View>
  );
}

const kinds = ['days', 'salaries', 'fixed'] as const satisfies readonly ExtraKind[];
const taxes = ['scale', 'rate', 'none'] as const satisfies readonly ExtraTax[];
const bases = ['average', 'month'] as const;

/**
 * A payment besides the salary as the user figures it: its name and month,
 * how much (days of salary, by seniority or not; salaries; or a fixed
 * amount), on which salary, and the ISR it pays. New ones start as the law's
 * bonus, in December.
 */
function ExtraForm({ view, extra, onDone }: { view: SalaryView; extra?: Extra; onDone: () => void }) {
  const { t } = useTranslation();
  const { settings } = view;
  const [name, setName] = useState(extra?.name ?? t('salary.extras.form.defaultName'));
  const [month, setMonth] = useState(String(extra?.month ?? 12));
  const [kind, setKind] = useState<ExtraKind>(extra?.kind ?? 'days');
  const [seniority, setSeniority] = useState(extra ? !!extra.seniority : true);
  const [value, setValue] = useState(extra?.value ? numberInput(extra.value) : '');
  const [amount, setAmount] = useState(extra?.amount ? toInput(extra.amount) : '');
  const [base, setBase] = useState<'average' | 'month'>(extra?.base ?? 'average');
  const [tax, setTax] = useState<ExtraTax>(extra?.tax ?? 'scale');
  const [rate, setRate] = useState(extra?.rate ? numberInput(Math.round(extra.rate * 10_000) / 100) : '');
  const [hiredOn, setHiredOn] = useState(settings.hiredOn ?? '');
  const [state, setState] = useState<'idle' | 'saving' | 'failed'>('idle');

  const bySeniority = kind === 'days' && seniority;
  const number = parseDecimal(value);
  const cents = parseCents(amount);
  const percent = parseDecimal(rate);
  const valid =
    name.trim() !== '' &&
    (kind === 'fixed' ? cents > 0 : kind === 'salaries' ? number > 0 && number <= 24 : bySeniority || (number > 0 && number <= 365)) &&
    (tax !== 'rate' || (percent > 0 && percent < 100)) &&
    (!bySeniority || isDate(hiredOn.trim()));

  const save = (extras: ExtraInput[], hire = settings.hiredOn) => {
    setState('saving');
    saveSalarySettings({ ...settings, hiredOn: hire || undefined, extras })
      .then(() => {
        setState('idle');
        onDone();
      })
      .catch(() => setState('failed'));
  };
  const submit = () => {
    if (!valid) return;
    const next: ExtraInput = {
      ...(extra ? { id: extra.id } : {}),
      name: name.trim(),
      month: Number(month),
      kind,
      tax,
      ...(kind === 'fixed' ? { amount: cents } : { base }),
      ...(kind === 'salaries' || (kind === 'days' && !seniority) ? { value: number } : {}),
      ...(bySeniority ? { seniority: true } : {}),
      ...(tax === 'rate' ? { rate: percent / 100 } : {}),
    };
    const extras = extra ? settings.extras.map((other) => (other.id === extra.id ? next : other)) : [...settings.extras, next];
    save(extras, bySeniority ? hiredOn.trim() : settings.hiredOn);
  };

  const monthOptions = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: capitalized(monthName(i + 1)) }));
  return (
    <View style={styles.form}>
      <View style={styles.fields}>
        <Field label={t('salary.extras.form.name')} style={styles.wide}>
          <TextField value={name} onChangeText={setName} accessibilityLabel={t('salary.extras.form.name')} onSubmitEditing={submit} />
        </Field>
        <Field label={t('salary.extras.form.month')}>
          <Select options={monthOptions} value={month} onChange={setMonth} accessibilityLabel={t('salary.extras.form.month')} />
        </Field>
      </View>
      <Field label={t('salary.extras.form.kind')}>
        <SegmentedControl
          options={kinds.map((option) => ({ value: option, label: t(`salary.extras.form.kinds.${option}`) }))}
          value={kind}
          onChange={setKind}
          accessibilityLabel={t('salary.extras.form.kind')}
        />
      </Field>
      {kind === 'days' ? (
        <View style={styles.check}>
          <Checkbox checked={seniority} onChange={setSeniority} accessibilityLabel={t('salary.extras.form.seniority')} />
          <Text onPress={() => setSeniority(!seniority)} style={styles.grow}>
            {t('salary.extras.form.seniority')}
          </Text>
        </View>
      ) : null}
      <View style={styles.fields}>
        {kind === 'fixed' ? (
          <Field label={t('salary.extras.form.amount')} style={styles.wide}>
            <TextField
              value={amount}
              onChangeText={setAmount}
              placeholder={currencySymbols.DOP}
              accessibilityLabel={t('salary.extras.form.amount')}
              keyboardType="decimal-pad"
              onSubmitEditing={submit}
            />
          </Field>
        ) : null}
        {kind === 'salaries' || (kind === 'days' && !seniority) ? (
          <Field label={t(kind === 'days' ? 'salary.extras.form.days' : 'salary.extras.form.salaries')} style={styles.narrow}>
            <TextField
              value={value}
              onChangeText={setValue}
              placeholder={kind === 'days' ? '30' : '1'}
              accessibilityLabel={t(kind === 'days' ? 'salary.extras.form.days' : 'salary.extras.form.salaries')}
              keyboardType="decimal-pad"
              onSubmitEditing={submit}
            />
          </Field>
        ) : null}
        {bySeniority ? (
          <Field label={t('salary.extras.form.hiredOn')} hint={t('salary.extras.form.hiredOnHint')} style={styles.wide}>
            <TextField
              value={hiredOn}
              onChangeText={setHiredOn}
              placeholder={t('salary.extras.form.hiredOnPlaceholder')}
              accessibilityLabel={t('salary.extras.form.hiredOn')}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={submit}
            />
          </Field>
        ) : null}
      </View>
      {kind === 'fixed' ? null : (
        <Field label={t('salary.extras.form.base')}>
          <SegmentedControl
            options={bases.map((option) => ({ value: option, label: t(`salary.extras.form.bases.${option}`) }))}
            value={base}
            onChange={setBase}
            accessibilityLabel={t('salary.extras.form.base')}
          />
        </Field>
      )}
      <Field label={t('salary.extras.form.tax')} hint={t('salary.extras.form.taxHint')}>
        <SegmentedControl
          options={taxes.map((option) => ({ value: option, label: t(`salary.extras.form.taxes.${option}`) }))}
          value={tax}
          onChange={setTax}
          accessibilityLabel={t('salary.extras.form.tax')}
        />
      </Field>
      {tax === 'rate' ? (
        <Field label={t('salary.extras.form.rate')} style={styles.narrow}>
          <View style={styles.row}>
            <TextField
              value={rate}
              onChangeText={setRate}
              placeholder="25"
              accessibilityLabel={t('salary.extras.form.rate')}
              keyboardType="decimal-pad"
              onSubmitEditing={submit}
              containerStyle={styles.grow}
            />
            <Text tone="secondary">%</Text>
          </View>
        </Field>
      ) : null}
      {state === 'failed' ? <Text tone="accent">{t('salary.failed')}</Text> : null}
      <View style={styles.actions}>
        {extra ? (
          <Button
            label={t('salary.extras.form.remove')}
            onPress={() => save(settings.extras.filter((other) => other.id !== extra.id))}
            disabled={state === 'saving'}
          />
        ) : null}
        <Button label={t('salary.extras.form.cancel')} onPress={onDone} />
        <Button variant="primary" label={t('salary.extras.form.save')} onPress={submit} disabled={!valid || state === 'saving'} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  item: {
    gap: theme.space[1],
  },
  pressable: {
    marginHorizontal: -theme.space[2],
    paddingHorizontal: theme.space[2],
    paddingVertical: theme.space[1.5],
    borderRadius: theme.radius.md,
  },
  hovered: {
    backgroundColor: theme.colors.surfaceHover,
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
    gap: theme.space[1],
    paddingTop: theme.space[3],
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
  narrow: {
    flexBasis: 140,
  },
  check: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[3],
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: theme.space[2],
  },
}));
