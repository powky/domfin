import { Trash2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button, SegmentedControl, Select, Text, TextField } from '@/components/ui';
import { Field, categoryOptions, useLedger, useLedgerNames } from '@/features/ledger';
import { parseCents, toInput } from '@/lib/amount';
import { currencySymbols, type Currency } from '@/lib/currency';

import type { FixedCost, FixedCostInput } from '../types';

const currencies = ['DOP', 'USD'] as const satisfies readonly Currency[];

export type FixedCostFormProps = {
  /** The one being changed; without it, a new one added by hand. */
  item?: FixedCost;
  onSave: (item: FixedCostInput) => Promise<unknown>;
  onRemove?: () => Promise<unknown>;
  onCancel: () => void;
};

/**
 * A fixed cost's name, monthly amount, the day it's paid and its category:
 * to add one no statement shows (paid in cash, say) or change one.
 */
export function FixedCostForm({ item, onSave, onRemove, onCancel }: FixedCostFormProps) {
  const { t } = useTranslation();
  const ledger = useLedger();
  const names = useLedgerNames(ledger);
  const [name, setName] = useState(item?.name ?? '');
  const [amount, setAmount] = useState(item ? toInput(item.amount) : '');
  const [currency, setCurrency] = useState<Currency>(item?.currency ?? 'DOP');
  const [day, setDay] = useState(item?.day ? String(item.day) : '');
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? '');
  const [state, setState] = useState<'idle' | 'saving' | 'failed'>('idle');

  const options = useMemo(
    () => [
      { value: '', label: t('budget.form.noCategory') },
      ...categoryOptions(ledger.categories, ledger.groups, names, (category) => category.flow === 'expense'),
    ],
    [ledger.categories, ledger.groups, names, t],
  );

  const cents = parseCents(amount);
  const dayNumber = day.trim() === '' ? 0 : Number(day);
  const valid = name.trim() !== '' && cents > 0 && Number.isInteger(dayNumber) && dayNumber >= 0 && dayNumber <= 31;

  const run = (action: () => Promise<unknown>) => {
    setState('saving');
    action()
      .then(() => setState('idle'))
      .catch(() => setState('failed'));
  };
  const save = () => {
    if (!valid) return;
    run(() =>
      onSave({
        ...item,
        name: name.trim(),
        amount: cents,
        currency,
        day: dayNumber || undefined,
        categoryId: categoryId || undefined,
      }),
    );
  };

  return (
    <View style={styles.form}>
      {item ? null : <Text variant="heading">{t('budget.form.newTitle')}</Text>}
      <View style={styles.fields}>
        <Field label={t('budget.form.name')} style={styles.name}>
          <TextField
            value={name}
            onChangeText={setName}
            placeholder={t('budget.form.namePlaceholder')}
            accessibilityLabel={t('budget.form.name')}
            autoCapitalize="sentences"
            onSubmitEditing={save}
          />
        </Field>
        <Field label={t('budget.form.amount')} style={styles.amount}>
          <View style={styles.amountRow}>
            <TextField
              value={amount}
              onChangeText={setAmount}
              placeholder={currencySymbols[currency]}
              accessibilityLabel={t('budget.form.amount')}
              keyboardType="decimal-pad"
              onSubmitEditing={save}
              containerStyle={styles.grow}
            />
            <SegmentedControl
              options={currencies.map((value) => ({ value, label: currencySymbols[value] }))}
              value={currency}
              onChange={setCurrency}
              accessibilityLabel={t('budget.form.currency')}
            />
          </View>
        </Field>
        <Field label={t('budget.form.day')} hint={t('budget.form.dayHint')} style={styles.day}>
          <TextField
            value={day}
            onChangeText={(text) => setDay(text.replace(/\D/g, '').slice(0, 2))}
            placeholder="15"
            accessibilityLabel={t('budget.form.day')}
            keyboardType="number-pad"
            onSubmitEditing={save}
          />
        </Field>
        <Field label={t('budget.form.category')} style={styles.category}>
          <Select
            options={options}
            value={categoryId}
            onChange={setCategoryId}
            accessibilityLabel={t('budget.form.category')}
          />
        </Field>
      </View>
      {state === 'failed' ? <Text tone="accent">{t('budget.form.failed')}</Text> : null}
      <View style={styles.actions}>
        {onRemove ? (
          <View style={styles.remove}>
            <Button
              icon={Trash2}
              label={t('budget.form.remove')}
              onPress={() => run(onRemove)}
              disabled={state === 'saving'}
            />
          </View>
        ) : null}
        <Button label={t('budget.form.cancel')} onPress={onCancel} />
        <Button
          variant="primary"
          label={t('budget.form.save')}
          onPress={save}
          disabled={!valid || state === 'saving'}
        />
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
  fields: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: theme.space[3],
  },
  name: {
    flexGrow: 2,
    flexBasis: { xs: '100%', md: 220 },
  },
  amount: {
    flexGrow: 1,
    flexBasis: { xs: '100%', md: 240 },
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2],
  },
  grow: {
    flex: 1,
  },
  day: {
    flexGrow: 1,
    flexBasis: { xs: '100%', md: 120 },
  },
  category: {
    flexGrow: 2,
    flexBasis: { xs: '100%', md: 200 },
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
}));
