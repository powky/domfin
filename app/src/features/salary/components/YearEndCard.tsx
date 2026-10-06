import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button, Card, Select, Text, TextField } from '@/components/ui';
import { Field } from '@/features/ledger';
import { formatDateValue } from '@/lib/dates';
import { formatCurrency } from '@/lib/format';

import { saveSalarySettings } from '../api/salary';
import { useSalaryView, type SalaryView } from '../api/useSalaryView';
import { salaryByMonth, yearPay } from '../lib/salary';
import { bonusDays, christmasSalary, legalBonus } from '../lib/yearEnd';

const money = (cents: number) => formatCurrency(cents / 100, 'DOP');
const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const pad = (month: number) => String(month).padStart(2, '0');

/** A month's name, "diciembre": from a month of any year. */
const monthName = (month: number) => formatDateValue(`2026-${pad(month)}`, { month: 'long' });

/** A real day written as YYYY-MM-DD. */
function isDate(text: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(text);
}

/**
 * What the year's end brings besides the salary: the Christmas salary, which
 * the law fixes, and the profit-sharing bonus as the law figures it, once
 * the user says since when they work there and the month it's paid.
 */
export function YearEndCard({ month }: { month: string }) {
  const { t } = useTranslation();
  const view = useSalaryView(month);
  const [editing, setEditing] = useState(false);
  if (view.status !== 'ready') return null;
  const year = Number(month.slice(0, 4));
  const months = salaryByMonth(year, view.read);
  const salary = months.reduce((total, other) => total + other.amount, 0);
  if (salary <= 0) return null;

  const christmas = christmasSalary(months);
  const { hiredOn, bonusMonth } = view.settings;
  const extras = yearPay(view.pay, year).pay;
  const bonus =
    hiredOn && bonusMonth
      ? legalBonus(months, bonusDays(hiredOn, `${year}-${pad(bonusMonth)}-31`), extras.bonus + extras.overtime + extras.other)
      : undefined;
  const december = christmas + (bonus && bonusMonth === 12 ? bonus.net : 0);
  const set = bonusMonth !== undefined && (bonusMonth === 0 || !!hiredOn);

  return (
    <Card title={t('salary.yearEnd.title')}>
      <Item
        label={t('salary.yearEnd.christmas')}
        value={money(christmas)}
        detail={t('salary.yearEnd.christmasDetail', { year, total: money(salary) })}
      />
      {bonus && bonusMonth ? (
        <Item
          label={t('salary.yearEnd.bonus')}
          value={money(bonus.net)}
          detail={t('salary.yearEnd.bonusDetail', {
            month: monthName(bonusMonth),
            days: bonus.days,
            average: money(bonus.average),
            gross: money(bonus.gross),
            isr: money(bonus.isr),
          })}
        />
      ) : null}
      {!set && !editing ? <Text tone="secondary">{t('salary.yearEnd.bonusPrompt')}</Text> : null}
      <View style={styles.total}>
        <Text variant="bodyStrong">{t('salary.yearEnd.total', { amount: money(december) })}</Text>
        {months.some((other) => other.estimated) || bonus ? (
          <Text variant="caption" tone="tertiary">
            {t('salary.yearEnd.estimate')}
          </Text>
        ) : null}
      </View>
      {editing ? (
        <BonusForm view={view} onDone={() => setEditing(false)} />
      ) : (
        <View style={styles.actions}>
          <Button
            variant={set ? 'secondary' : 'primary'}
            label={set ? t('salary.yearEnd.change') : t('salary.yearEnd.configure')}
            onPress={() => setEditing(true)}
          />
        </View>
      )}
    </Card>
  );
}

function Item({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <View style={styles.item}>
      <View style={styles.row}>
        <Text variant="bodyStrong" style={styles.grow}>
          {label}
        </Text>
        <Text variant="bodyStrong" tone="positive">
          {value}
        </Text>
      </View>
      <Text variant="caption" tone="secondary">
        {detail}
      </Text>
    </View>
  );
}

/** The day the job started (45 days of bonus or 60) and the month the bonus is paid, or that it isn't. */
function BonusForm({ view, onDone }: { view: SalaryView; onDone: () => void }) {
  const { t } = useTranslation();
  const { settings } = view;
  const [hiredOn, setHiredOn] = useState(settings.hiredOn ?? '');
  const [month, setMonth] = useState(String(settings.bonusMonth ?? 12));
  const [state, setState] = useState<'idle' | 'saving' | 'failed'>('idle');
  const none = month === '0';
  const valid = none || isDate(hiredOn.trim());
  const options = [
    ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: capitalized(monthName(i + 1)) })),
    { value: '0', label: t('salary.yearEnd.noBonus') },
  ];

  const save = () => {
    if (!valid) return;
    setState('saving');
    const trimmed = hiredOn.trim();
    saveSalarySettings({ ...settings, hiredOn: trimmed || undefined, bonusMonth: Number(month) })
      .then(() => {
        setState('idle');
        onDone();
      })
      .catch(() => setState('failed'));
  };

  return (
    <View style={styles.form}>
      <View style={styles.fields}>
        <Field label={t('salary.yearEnd.bonusMonth')}>
          <Select options={options} value={month} onChange={setMonth} accessibilityLabel={t('salary.yearEnd.bonusMonth')} />
        </Field>
        {none ? null : (
          <Field label={t('salary.yearEnd.hiredOn')} hint={t('salary.yearEnd.hiredOnHint')} style={styles.date}>
            <TextField
              value={hiredOn}
              onChangeText={setHiredOn}
              placeholder={t('salary.yearEnd.hiredOnPlaceholder')}
              accessibilityLabel={t('salary.yearEnd.hiredOn')}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={save}
            />
          </Field>
        )}
      </View>
      {!valid && hiredOn.trim() !== '' ? <Text tone="accent">{t('salary.yearEnd.invalid')}</Text> : null}
      {state === 'failed' ? <Text tone="accent">{t('salary.failed')}</Text> : null}
      <View style={styles.actions}>
        <Button label={t('salary.yearEnd.cancel')} onPress={onDone} />
        <Button variant="primary" label={t('salary.yearEnd.save')} onPress={save} disabled={!valid || state === 'saving'} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  item: {
    gap: theme.space[1],
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
    gap: theme.space[3],
  },
  fields: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: theme.space[3],
  },
  date: {
    flexGrow: 1,
    flexBasis: 200,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: theme.space[2],
  },
}));
