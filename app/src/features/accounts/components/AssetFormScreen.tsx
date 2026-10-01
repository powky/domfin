import { useRouter, type Href } from 'expo-router';
import { Plus, X } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { BackLink } from '@/components/BackLink';
import { PageHeader } from '@/components/PageHeader';
import { Screen } from '@/components/Screen';
import { Button, Card, SegmentedControl, Select, Text, TextField } from '@/components/ui';
import {
  Field,
  deleteAsset,
  plannedBeforeDelivery,
  saveAsset,
  useAssets,
  type Asset,
  type AssetInput,
  type Plan,
} from '@/features/ledger';
import { currencySymbols, type Currency } from '@/lib/currency';
import { formatCurrency } from '@/lib/format';

/** One of a fund's statements as typed: `key` keeps its row while it's edited. */
type BalanceRow = { key: string; date: string; amount: string };

type Form = {
  kind: Asset['kind'];
  name: string;
  currency: Currency;
  match: string;
  price: string;
  reservationAmount: string;
  reservationDate: string;
  downAmount: string;
  downDate: string;
  installmentAmount: string;
  everyMonths: string;
  first: string;
  last: string;
  delivery: string;
  quantity: string;
  sharePrice: string;
  priceDate: string;
  /** Newest first, as they're added. */
  balances: BalanceRow[];
  vehiclePrice: string;
  vehicleDate: string;
  /** Percent a year, like "10". */
  vehicleRate: string;
  scheduleBalance: string;
  scheduleAsOf: string;
  /** Percent a year, like "5". */
  scheduleRate: string;
  scheduleFirst: string;
  scheduleLast: string;
};

const emptyBalance: BalanceRow = { key: 'new', date: '', amount: '' };

const emptyForm: Form = {
  kind: 'property',
  name: '',
  currency: 'USD',
  match: '',
  price: '',
  reservationAmount: '',
  reservationDate: '',
  downAmount: '',
  downDate: '',
  installmentAmount: '',
  everyMonths: '',
  first: '',
  last: '',
  delivery: '',
  quantity: '',
  sharePrice: '',
  priceDate: '',
  balances: [emptyBalance],
  vehiclePrice: '',
  vehicleDate: '',
  vehicleRate: '10',
  scheduleBalance: '',
  scheduleAsOf: '',
  scheduleRate: '',
  scheduleFirst: '',
  scheduleLast: '',
};

const units = (cents?: number) => (cents ? String(cents / 100) : '');
/** 0.05 → "5". */
const percentText = (rate?: number) => (rate === undefined ? '' : String(Math.round(rate * 10_000) / 100));

function fromAsset(asset: Asset): Form {
  const plan = asset.property;
  return {
    ...emptyForm,
    kind: asset.kind,
    name: asset.name,
    currency: asset.currency,
    match: asset.match.join(', '),
    price: units(plan?.price),
    reservationAmount: units(plan?.reservation?.amount),
    reservationDate: plan?.reservation?.date ?? '',
    downAmount: units(plan?.downPayment?.amount),
    downDate: plan?.downPayment?.date ?? '',
    installmentAmount: units(plan?.installments?.amount),
    everyMonths: plan?.installments ? String(plan.installments.everyMonths) : '',
    first: plan?.installments?.first ?? '',
    last: plan?.installments?.last ?? '',
    delivery: plan?.delivery ?? '',
    quantity: asset.shares ? String(asset.shares.quantity) : '',
    sharePrice: units(asset.shares?.price),
    priceDate: asset.shares?.priceDate ?? '',
    balances: asset.pension?.balances.length
      ? [...asset.pension.balances]
          .reverse()
          .map((balance) => ({ key: balance.date, date: balance.date, amount: units(balance.amount) }))
      : [emptyBalance],
    vehiclePrice: units(asset.vehicle?.price),
    vehicleDate: asset.vehicle?.date ?? '',
    vehicleRate: asset.vehicle ? percentText(asset.vehicle.rate) : emptyForm.vehicleRate,
    scheduleBalance: units(asset.schedule?.balance),
    scheduleAsOf: asset.schedule?.asOf ?? '',
    scheduleRate: percentText(asset.schedule?.rate),
    scheduleFirst: asset.schedule?.first ?? '',
    scheduleLast: asset.schedule?.last ?? '',
  };
}

const isDate = (text: string) => /^\d{4}-\d{2}-\d{2}$/.test(text);

/** "155,000.50" → cents; undefined when empty, NaN when it isn't an amount. */
function cents(text: string): number | undefined {
  const clean = text.replace(/[^\d.]/g, '');
  if (clean === '') return undefined;
  const value = Number(clean);
  return Number.isFinite(value) ? Math.round(value * 100) : NaN;
}

/** "5" → 0.05; undefined when empty, NaN when it isn't a percent under 100. */
function rate(text: string): number | undefined {
  const clean = text.replace(',', '.').trim();
  if (clean === '') return undefined;
  const value = Number(clean);
  return Number.isFinite(value) && value >= 0 && value < 100 ? value / 100 : NaN;
}

const known = (value: number | undefined): value is number => value !== undefined && !Number.isNaN(value);

/** The form as domfin-api takes it, or null when something doesn't make sense. */
function toInput(form: Form): AssetInput | null {
  const match = form.match
    .split(',')
    .map((text) => text.trim())
    .filter(Boolean);
  const base = { kind: form.kind, name: form.name.trim(), currency: form.currency, match };
  if (base.name === '') return null;
  if (form.kind === 'vehicle') {
    const price = cents(form.vehiclePrice);
    const yearly = rate(form.vehicleRate);
    if (!known(price) || price <= 0 || !isDate(form.vehicleDate) || !known(yearly)) return null;
    return { ...base, vehicle: { price, date: form.vehicleDate, rate: yearly } };
  }

  if (form.kind === 'debt') {
    // What's owed comes from the linked movements (what you got, less what
    // you paid back), or from its installments when it has a schedule.
    const schedule = [form.scheduleBalance, form.scheduleAsOf, form.scheduleRate, form.scheduleFirst, form.scheduleLast];
    if (schedule.every((text) => text.trim() === '')) return base;
    const balance = cents(form.scheduleBalance);
    const yearly = rate(form.scheduleRate);
    const dates = [form.scheduleAsOf, form.scheduleFirst, form.scheduleLast];
    if (!known(balance) || balance <= 0 || !known(yearly) || !dates.every(isDate) || form.scheduleLast < form.scheduleFirst) {
      return null;
    }
    return {
      ...base,
      schedule: {
        balance,
        asOf: form.scheduleAsOf,
        rate: yearly,
        first: form.scheduleFirst,
        last: form.scheduleLast,
      },
    };
  }

  if (form.kind === 'pension') {
    const balances: { date: string; amount: number }[] = [];
    for (const row of form.balances) {
      const amount = cents(row.amount);
      if (amount === undefined && row.date === '') continue;
      if (amount === undefined || Number.isNaN(amount) || !isDate(row.date)) return null;
      balances.push({ date: row.date, amount });
    }
    const dates = new Set(balances.map((balance) => balance.date));
    if (balances.length === 0 || dates.size !== balances.length) return null;
    return { ...base, pension: { balances } };
  }

  if (form.kind === 'shares') {
    const quantity = Number(form.quantity);
    const price = cents(form.sharePrice);
    if (!Number.isInteger(quantity) || quantity <= 0 || Number.isNaN(price)) return null;
    if (form.priceDate !== '' && !isDate(form.priceDate)) return null;
    return { ...base, shares: { quantity, ...(price ? { price, priceDate: form.priceDate || undefined } : {}) } };
  }

  const payment = (amountText: string, date: string) => {
    const amount = cents(amountText);
    if (amount === undefined && date === '') return undefined;
    return amount !== undefined && !Number.isNaN(amount) && isDate(date) ? { amount, date } : null;
  };
  const reservation = payment(form.reservationAmount, form.reservationDate);
  const downPayment = payment(form.downAmount, form.downDate);
  const price = cents(form.price) ?? 0;
  let installments: Plan['installments'] | null | undefined;
  const installmentAmount = cents(form.installmentAmount);
  if (installmentAmount !== undefined || form.everyMonths !== '' || form.first !== '' || form.last !== '') {
    const everyMonths = Number(form.everyMonths);
    installments =
      installmentAmount !== undefined &&
      !Number.isNaN(installmentAmount) &&
      Number.isInteger(everyMonths) &&
      everyMonths >= 1 &&
      isDate(form.first) &&
      isDate(form.last)
        ? { amount: installmentAmount, everyMonths, first: form.first, last: form.last }
        : null;
  }
  if (Number.isNaN(price) || reservation === null || downPayment === null || installments === null) return null;
  if (form.delivery !== '' && !isDate(form.delivery)) return null;
  const property: Plan = {
    price,
    ...(reservation ? { reservation } : {}),
    ...(downPayment ? { downPayment } : {}),
    ...(installments ? { installments } : {}),
    ...(form.delivery ? { delivery: form.delivery } : {}),
  };
  return { ...base, property };
}

/**
 * Adds an asset no statement shows (a home bought off-plan with its payment
 * plan, shares, a pension fund with its statements' balances, a vehicle) or
 * a debt outside your statements, or edits one by its ID.
 */
export function AssetFormScreen({ id }: { id?: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { assets, status } = useAssets();
  const existing = id ? assets.find((asset) => asset.id === id) : undefined;
  const [edited, setEdited] = useState<Form | null>(null);
  const [message, setMessage] = useState<'invalid' | 'failed' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const form = edited ?? (existing ? fromAsset(existing) : id ? null : emptyForm);
  const back: Href = existing ? { pathname: '/accounts/[id]', params: { id: `asset:${existing.id}` } } : '/accounts';

  if (!form) {
    return (
      <Screen header={<BackLink href="/accounts" label={t('assets.form.back')} />}>
        <Card>
          <Text tone="secondary">{status === 'loading' ? t('common.data.loading') : t('common.data.offline')}</Text>
        </Card>
      </Screen>
    );
  }

  /** The kind's own text, or the one every other kind shares. */
  const byKind = (texts: Partial<Record<Asset['kind'], string>>, fallback: string) => texts[form.kind] ?? fallback;
  const change = (patch: Partial<Form>) => {
    setEdited({ ...form, ...patch });
    setMessage(null);
  };
  const changeBalance = (key: string, patch: Partial<BalanceRow>) =>
    change({ balances: form.balances.map((row) => (row.key === key ? { ...row, ...patch } : row)) });
  // A new statement goes on top, where the latest one is.
  const addBalance = () => change({ balances: [{ key: `new-${Date.now()}`, date: '', amount: '' }, ...form.balances] });
  const removeBalance = (key: string) => change({ balances: form.balances.filter((row) => row.key !== key) });
  const input = toInput(form);
  const plan = input?.property;
  const rest = plan && plan.price > 0 ? plan.price - plannedBeforeDelivery(plan) : null;
  const money = (amount: number) => formatCurrency(amount / 100, form.currency);

  const save = () => {
    if (!input || (rest !== null && rest < 0)) {
      setMessage('invalid');
      return;
    }
    saveAsset(input, existing?.id)
      .then((savedId) => router.replace({ pathname: '/accounts/[id]', params: { id: `asset:${savedId}` } }))
      .catch(() => setMessage('failed'));
  };
  const remove = () => {
    if (!existing) return;
    deleteAsset(existing.id)
      .then(() => router.replace('/accounts'))
      .catch(() => setMessage('failed'));
  };

  const amountField = (label: string, key: keyof Form, placeholder?: string) => (
    <Field label={label} style={styles.flex}>
      <TextField
        value={form[key] as string}
        onChangeText={(value) => change({ [key]: value })}
        placeholder={placeholder ?? t('assets.form.amount')}
        keyboardType="decimal-pad"
        accessibilityLabel={label}
      />
    </Field>
  );
  const percentField = (label: string, key: keyof Form) => (
    <Field label={label}>
      <TextField
        value={form[key] as string}
        onChangeText={(value) => change({ [key]: value })}
        placeholder="10"
        keyboardType="decimal-pad"
        accessibilityLabel={label}
      />
    </Field>
  );
  const dateField = (label: string, key: keyof Form) => (
    <Field label={label} style={styles.flex}>
      <TextField
        value={form[key] as string}
        onChangeText={(value) => change({ [key]: value })}
        placeholder={t('assets.form.datePlaceholder')}
        keyboardType="numbers-and-punctuation"
        accessibilityLabel={label}
      />
    </Field>
  );

  return (
    <Screen
      header={
        <View style={styles.header}>
          <BackLink href={back} label={t('assets.form.back')} />
          <PageHeader
            title={
              existing
                ? t('assets.form.editTitle', { name: existing.name })
                : byKind(
                    { debt: t('assets.form.newDebtTitle'), vehicle: t('assets.form.newVehicleTitle') },
                    t('assets.form.newTitle'),
                  )
            }
          />
        </View>
      }
    >
      <Card>
        {existing ? null : (
          <Field label={t('assets.form.kind')}>
            <Select
              options={(['property', 'shares', 'debt', 'pension', 'vehicle'] as const).map((value) => ({
                value,
                label: t(`assets.kinds.${value}`),
              }))}
              value={form.kind}
              onChange={(kind) => change({ kind, currency: kind === 'property' ? 'USD' : 'DOP' })}
              accessibilityLabel={t('assets.form.kind')}
            />
          </Field>
        )}
        <Field label={t('assets.form.name')}>
          <TextField
            value={form.name}
            onChangeText={(name) => change({ name })}
            placeholder={byKind(
              {
                debt: t('assets.form.debtNamePlaceholder'),
                pension: t('assets.form.pensionNamePlaceholder'),
                vehicle: t('assets.form.vehicleNamePlaceholder'),
              },
              t('assets.form.namePlaceholder'),
            )}
            accessibilityLabel={t('assets.form.name')}
          />
        </Field>
        <Field label={t('assets.form.currency')}>
          <SegmentedControl
            options={(['DOP', 'USD'] as const).map((value) => ({ value, label: currencySymbols[value] }))}
            value={form.currency}
            onChange={(currency) => change({ currency })}
            accessibilityLabel={t('assets.form.currency')}
          />
        </Field>

        {form.kind === 'property' ? (
          <>
            {amountField(t('assets.form.price'), 'price', t('assets.form.pricePlaceholder'))}
            <Text variant="bodyStrong">{t('assets.form.reservation')}</Text>
            <View style={styles.row}>
              {amountField(t('assets.form.amount'), 'reservationAmount')}
              {dateField(t('assets.form.date'), 'reservationDate')}
            </View>
            <Text variant="bodyStrong">{t('assets.form.downPayment')}</Text>
            <View style={styles.row}>
              {amountField(t('assets.form.amount'), 'downAmount')}
              {dateField(t('assets.form.date'), 'downDate')}
            </View>
            <Text variant="bodyStrong">{t('assets.form.installments')}</Text>
            <View style={styles.row}>
              {amountField(t('assets.form.installmentAmount'), 'installmentAmount')}
              <Field label={t('assets.form.everyMonths')} style={styles.flex}>
                <TextField
                  value={form.everyMonths}
                  onChangeText={(everyMonths) => change({ everyMonths })}
                  placeholder="3"
                  keyboardType="number-pad"
                  accessibilityLabel={t('assets.form.everyMonths')}
                />
              </Field>
            </View>
            <View style={styles.row}>
              {dateField(t('assets.form.first'), 'first')}
              {dateField(t('assets.form.last'), 'last')}
            </View>
            <Text variant="bodyStrong">{t('assets.form.delivery')}</Text>
            {dateField(t('assets.form.date'), 'delivery')}
            {rest !== null ? (
              <Text tone={rest < 0 ? 'accent' : 'secondary'}>
                {rest < 0 ? t('assets.form.overPrice') : t('assets.form.restOnDelivery', { amount: money(rest) })}
              </Text>
            ) : null}
          </>
        ) : form.kind === 'shares' ? (
          <>
            <Field label={t('assets.form.quantity')}>
              <TextField
                value={form.quantity}
                onChangeText={(quantity) => change({ quantity })}
                placeholder="500"
                keyboardType="number-pad"
                accessibilityLabel={t('assets.form.quantity')}
              />
            </Field>
            <View style={styles.row}>
              {amountField(t('assets.form.sharePrice'), 'sharePrice')}
              {dateField(t('assets.form.priceDate'), 'priceDate')}
            </View>
            <Text variant="caption" tone="tertiary">
              {t('assets.form.sharePriceHint')}
            </Text>
          </>
        ) : form.kind === 'vehicle' ? (
          <>
            <View style={styles.row}>
              {amountField(t('assets.form.vehiclePrice'), 'vehiclePrice')}
              {dateField(t('assets.form.vehicleDate'), 'vehicleDate')}
            </View>
            {percentField(t('assets.form.vehicleRate'), 'vehicleRate')}
            <Text variant="caption" tone="tertiary">
              {t('assets.form.vehicleHint')}
            </Text>
          </>
        ) : form.kind === 'debt' ? (
          <>
            <Text tone="secondary">{t('assets.form.debtHint')}</Text>
            <Text variant="bodyStrong">{t('assets.form.schedule')}</Text>
            <Text variant="caption" tone="tertiary">
              {t('assets.form.scheduleHint')}
            </Text>
            <View style={styles.row}>
              {amountField(t('assets.form.scheduleBalance'), 'scheduleBalance')}
              {dateField(t('assets.form.balanceDate'), 'scheduleAsOf')}
            </View>
            {percentField(t('assets.form.scheduleRate'), 'scheduleRate')}
            <View style={styles.row}>
              {dateField(t('assets.form.first'), 'scheduleFirst')}
              {dateField(t('assets.form.last'), 'scheduleLast')}
            </View>
          </>
        ) : (
          <>
            <Text variant="bodyStrong">{t('assets.form.balances')}</Text>
            <Text variant="caption" tone="tertiary">
              {t('assets.form.pensionHint')}
            </Text>
            {form.balances.map((row) => (
              <View key={row.key} style={styles.balanceRow}>
                <Field label={t('assets.form.balance')} style={styles.flex}>
                  <TextField
                    value={row.amount}
                    onChangeText={(amount) => changeBalance(row.key, { amount })}
                    placeholder={t('assets.form.amount')}
                    keyboardType="decimal-pad"
                    accessibilityLabel={t('assets.form.balance')}
                  />
                </Field>
                <Field label={t('assets.form.balanceDate')} style={styles.flex}>
                  <TextField
                    value={row.date}
                    onChangeText={(date) => changeBalance(row.key, { date })}
                    placeholder={t('assets.form.datePlaceholder')}
                    keyboardType="numbers-and-punctuation"
                    accessibilityLabel={t('assets.form.balanceDate')}
                  />
                </Field>
                {form.balances.length > 1 ? (
                  <Button
                    icon={X}
                    iconOnly
                    accessibilityLabel={t('assets.form.removeBalance')}
                    onPress={() => removeBalance(row.key)}
                  />
                ) : null}
              </View>
            ))}
            <View style={styles.actions}>
              <Button icon={Plus} label={t('assets.form.addBalance')} onPress={addBalance} />
            </View>
          </>
        )}

        {form.kind === 'pension' || form.kind === 'vehicle' ? null : (
          <Field label={t('assets.form.match')} hint={t('assets.form.matchHint')}>
            <TextField
              value={form.match}
              onChangeText={(match) => change({ match })}
              placeholder={
                form.kind === 'debt' ? t('assets.form.debtMatchPlaceholder') : t('assets.form.matchPlaceholder')
              }
              autoCapitalize="none"
              accessibilityLabel={t('assets.form.match')}
            />
          </Field>
        )}

        <View style={styles.actions}>
          <Button variant="primary" label={t('assets.form.save')} onPress={save} />
          {existing ? (
            confirmDelete ? (
              <Button label={t('assets.form.deleteYes')} onPress={remove} />
            ) : (
              <Button
                label={byKind(
                  { debt: t('assets.form.deleteDebt'), vehicle: t('assets.form.deleteVehicle') },
                  t('assets.form.delete'),
                )}
                onPress={() => setConfirmDelete(true)}
              />
            )
          ) : null}
        </View>
        {confirmDelete ? <Text tone="secondary">{t('assets.form.deleteConfirm')}</Text> : null}
        {message ? (
          <Text tone="accent">{message === 'invalid' ? t('assets.form.invalid') : t('assets.form.failed')}</Text>
        ) : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    gap: theme.space[3],
  },
  row: {
    flexDirection: 'row',
    gap: theme.space[3],
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.space[3],
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space[2],
  },
}));
