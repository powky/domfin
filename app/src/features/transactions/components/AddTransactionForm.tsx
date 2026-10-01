import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button, SegmentedControl, Select, Text, TextField } from '@/components/ui';
import { currencySymbols } from '@/lib/currency';

import type { NewTransaction } from '../api/useTransactions';
import { toPlainDecimal } from '../lib/format';
import type { TransactionAccount, TransactionCategory } from '../types';

type Kind = 'expense' | 'income';

/** Their names are the `transactions.add.kinds` translations. */
const kinds = ['expense', 'income'] as const satisfies readonly Kind[];

const UNCATEGORIZED = 'uncategorized';

/** Reads the amount with the locale's decimal separator: "1,234.56", or "1.234,56" where cents follow a comma. */
const parseAmount = (value: string) => {
  const amount = Number(toPlainDecimal(value).replace(/\s/g, ''));
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
};

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export type AddTransactionFormProps = {
  accounts: TransactionAccount[];
  categories: TransactionCategory[];
  /** `YYYY-MM-DD` the date field starts with. */
  defaultDate: string;
  onSubmit: (transaction: NewTransaction) => void;
  onCancel: () => void;
};

/** Quick manual entry, shown inside the transactions card. */
export function AddTransactionForm({ accounts, categories, defaultDate, onSubmit, onCancel }: AddTransactionFormProps) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<Kind>('expense');
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState(UNCATEGORIZED);
  const [notes, setNotes] = useState('');

  const accountOptions = useMemo(
    () => accounts.map((account) => ({ value: account.id, label: account.name })),
    [accounts],
  );
  const categoryOptions = useMemo(
    () => [
      { value: UNCATEGORIZED, label: t('categories.uncategorized') },
      ...categories
        .filter((category) => category.kind === kind)
        .map((category) => ({ value: category.id, label: category.label })),
    ],
    [categories, kind, t],
  );
  const kindOptions = kinds.map((value) => ({ value, label: t(`transactions.add.kinds.${value}`) }));

  const value = parseAmount(amount);
  const currency = accounts.find((account) => account.id === accountId)?.currency;
  const valid = merchant.trim() !== '' && value > 0 && isValidDate(date) && currency !== undefined;

  const submit = () => {
    if (!valid || !currency) return;
    onSubmit({
      date,
      merchant: merchant.trim(),
      amount: kind === 'expense' ? -value : value,
      currency,
      accountId,
      kind,
      categoryId: categoryId === UNCATEGORIZED ? null : categoryId,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <View style={styles.form}>
      <View style={styles.header}>
        <Text variant="heading">{t('transactions.add.title')}</Text>
        <SegmentedControl
          options={kindOptions}
          value={kind}
          onChange={(next) => {
            setKind(next);
            setCategoryId(UNCATEGORIZED);
          }}
          accessibilityLabel={t('transactions.add.type')}
        />
      </View>
      <View style={styles.fields}>
        <TextField
          value={merchant}
          onChangeText={setMerchant}
          placeholder={t('transactions.add.merchant')}
          accessibilityLabel={t('transactions.add.merchant')}
          autoCapitalize="words"
          onSubmitEditing={submit}
          containerStyle={styles.merchant}
        />
        <TextField
          value={amount}
          onChangeText={setAmount}
          placeholder={
            currency ? `${t('transactions.add.amount')} (${currencySymbols[currency]})` : t('transactions.add.amount')
          }
          accessibilityLabel={t('transactions.add.amount')}
          keyboardType="decimal-pad"
          onSubmitEditing={submit}
          containerStyle={styles.short}
        />
        <TextField
          value={date}
          onChangeText={setDate}
          placeholder={t('transactions.add.datePlaceholder')}
          accessibilityLabel={t('transactions.add.date')}
          onSubmitEditing={submit}
          containerStyle={styles.short}
        />
        <Select
          options={accountOptions}
          value={accountId}
          onChange={setAccountId}
          accessibilityLabel={t('transactions.add.account')}
        />
        <Select
          options={categoryOptions}
          value={categoryId}
          onChange={setCategoryId}
          accessibilityLabel={t('transactions.add.category')}
        />
        <TextField
          value={notes}
          onChangeText={setNotes}
          placeholder={t('transactions.add.notesPlaceholder')}
          accessibilityLabel={t('transactions.add.notes')}
          onSubmitEditing={submit}
          containerStyle={styles.notes}
        />
      </View>
      <View style={styles.actions}>
        <Button label={t('transactions.add.cancel')} onPress={onCancel} />
        <Button variant="primary" label={t('transactions.add.submit')} onPress={submit} disabled={!valid} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  form: {
    gap: theme.space[3],
    padding: theme.space[4],
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceMuted,
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space[3],
  },
  fields: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.space[2],
  },
  merchant: {
    flexGrow: 2,
    flexBasis: { xs: '100%', md: 200 },
  },
  short: {
    flexGrow: 1,
    flexBasis: { xs: '40%', md: 120 },
  },
  notes: {
    flexGrow: 3,
    flexBasis: { xs: '100%', md: 220 },
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.space[2],
  },
}));
