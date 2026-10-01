import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button, Card, Select, Text, TextField } from '@/components/ui';

import { usePayroll, type Payroll } from '../api/classification';
import { useLedger } from '../api/ledger';
import { accountName } from '../lib/accounts';
import { normalize, paydaysOf } from '../lib/payroll';
import { Field, joinList } from './Field';

type Form = { accountId: string; keyword: string; days: string; before: string; after: string };

const toForm = (p: Payroll): Form => ({
  accountId: p.accountId,
  keyword: p.keyword,
  days: p.days.join(', '),
  before: String(p.daysBefore),
  after: String(p.daysAfter),
});

/** Whole numbers from min to max, or null when any isn't one. */
function numbers(text: string, min: number, max: number): number[] | null {
  const parts = text.split(',').map((part) => part.trim()).filter(Boolean);
  const values = parts.map(Number);
  return values.every((value) => Number.isInteger(value) && value >= min && value <= max) ? values : null;
}

function toPayroll(form: Form): Payroll | null {
  const days = numbers(form.days, 1, 31);
  const [before] = numbers(form.before, 0, 10) ?? [];
  const [after] = numbers(form.after, 0, 10) ?? [];
  if (!days || before === undefined || after === undefined) return null;
  return { accountId: form.accountId, keyword: form.keyword.trim(), days, daysBefore: before, daysAfter: after };
}

/**
 * When a payroll credit is Salario and when Ingreso adicional: the account,
 * the text that marks it and the paydays. Saving classifies everything again.
 */
export function PayrollCard() {
  const { t } = useTranslation();
  const payroll = usePayroll();
  const ledger = useLedger();
  const [edited, setEdited] = useState<Form | null>(null);
  const [message, setMessage] = useState<'saved' | 'invalid' | 'failed' | null>(null);
  const form = edited ?? (payroll.value ? toForm(payroll.value) : null);

  const accounts = useMemo(
    () => ledger.accounts.filter((account) => account.kind === 'savings' || account.kind === 'checking'),
    [ledger.accounts],
  );
  const keyword = form ? normalize(form.keyword.trim()) : '';
  const accountId = form?.accountId ?? '';
  const suggested = useMemo(() => paydaysOf(ledger.movements, keyword, accountId), [ledger.movements, keyword, accountId]);

  if (!form) {
    return (
      <Card title={t('classification.payroll.title')}>
        <Text tone="secondary">
          {payroll.status === 'offline' ? t('classification.offline') : t('classification.loading')}
        </Text>
      </Card>
    );
  }

  const change = (patch: Partial<Form>) => {
    setEdited({ ...form, ...patch });
    setMessage(null);
  };
  const current = toPayroll(form);
  const showSuggestion =
    suggested.length > 0 && current !== null && suggested.join(',') !== [...current.days].sort((a, b) => a - b).join(',');

  const save = () => {
    if (!current) {
      setMessage('invalid');
      return;
    }
    payroll
      .save(current)
      .then(() => {
        setEdited(null);
        setMessage('saved');
      })
      .catch(() => setMessage('failed'));
  };

  return (
    <Card title={t('classification.payroll.title')}>
      <Text tone="secondary" style={styles.description}>
        {t('classification.payroll.description')}
      </Text>
      <Field label={t('classification.payroll.account')}>
        <Select
          options={[
            { value: '', label: t('classification.payroll.allAccounts') },
            ...accounts.map((account) => ({ value: account.id, label: accountName(account, ledger.accounts, t) })),
          ]}
          value={form.accountId}
          onChange={(accountId) => change({ accountId })}
          accessibilityLabel={t('classification.payroll.account')}
        />
      </Field>
      <Field label={t('classification.payroll.keyword')} hint={t('classification.payroll.keywordHint')}>
        <TextField
          value={form.keyword}
          onChangeText={(keyword) => change({ keyword })}
          autoCapitalize="none"
          accessibilityLabel={t('classification.payroll.keyword')}
        />
      </Field>
      <Field label={t('classification.payroll.days')} hint={t('classification.payroll.daysHint')}>
        <TextField
          value={form.days}
          onChangeText={(days) => change({ days })}
          placeholder={t('classification.payroll.daysPlaceholder')}
          keyboardType="numbers-and-punctuation"
          accessibilityLabel={t('classification.payroll.days')}
        />
      </Field>
      {showSuggestion ? (
        <View style={styles.suggestion}>
          <Text tone="secondary" style={styles.suggestionText}>
            {t('classification.payroll.suggestion', { days: joinList(suggested.map(String), t) })}
          </Text>
          <Button
            label={t('classification.payroll.useSuggestion')}
            onPress={() => change({ days: suggested.join(', ') })}
          />
        </View>
      ) : null}
      <View style={styles.window}>
        <Field label={t('classification.payroll.before')} style={styles.windowField}>
          <TextField
            value={form.before}
            onChangeText={(before) => change({ before })}
            keyboardType="number-pad"
            accessibilityLabel={t('classification.payroll.before')}
          />
        </Field>
        <Field label={t('classification.payroll.after')} style={styles.windowField}>
          <TextField
            value={form.after}
            onChangeText={(after) => change({ after })}
            keyboardType="number-pad"
            accessibilityLabel={t('classification.payroll.after')}
          />
        </Field>
      </View>
      <Text variant="caption" tone="secondary">
        {t('classification.payroll.windowHint')}
      </Text>
      <View style={styles.actions}>
        <Button variant="primary" label={t('classification.save')} onPress={save} disabled={edited === null} />
        {message ? (
          <Text tone={message === 'saved' ? 'secondary' : 'accent'} style={styles.message}>
            {message === 'saved'
              ? t('classification.saved')
              : message === 'invalid'
                ? t('classification.payroll.invalid')
                : t('classification.saveFailed')}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create((theme) => ({
  description: {
    marginTop: -theme.space[2],
  },
  suggestion: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.space[3],
    padding: theme.space[3],
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent.subtle,
  },
  suggestionText: {
    flexShrink: 1,
  },
  window: {
    flexDirection: 'row',
    gap: theme.space[3],
  },
  windowField: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.space[3],
  },
  message: {
    flexShrink: 1,
  },
}));
