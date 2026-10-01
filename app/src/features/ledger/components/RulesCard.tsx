import type { TFunction } from 'i18next';
import { Plus, Trash2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button, Card, Checkbox, SegmentedControl, Select, Text, TextField } from '@/components/ui';
import type { Currency } from '@/lib/currency';
import { formatDateValue } from '@/lib/dates';
import { formatCurrency } from '@/lib/format';

import { useRules, type Rule } from '../api/classification';
import { useLedger } from '../api/ledger';
import { useLedgerNames } from '../lib/names';
import { categoryOptions } from '../lib/options';
import { Field, joinList } from './Field';

type Direction = 'any' | 'in' | 'out';

type Draft = {
  name: string;
  contains: string;
  direction: Direction;
  min: string;
  max: string;
  months: string;
  categoryId: string;
  review: boolean;
};

const emptyDraft: Draft = { name: '', contains: '', direction: 'any', min: '', max: '', months: '', categoryId: '', review: false };

/** "100,000.50" in pesos or dollars → cents; undefined when empty, NaN when it isn't an amount. */
function cents(text: string): number | undefined {
  const clean = text.replace(/[^\d.]/g, '');
  if (clean === '') return undefined;
  const value = Number(clean);
  return Number.isFinite(value) ? Math.round(value * 100) : NaN;
}

function toRule(draft: Draft): Rule | null {
  const contains = draft.contains
    .split(',')
    .map((text) => text.trim())
    .filter(Boolean);
  const months = draft.months
    .split(',')
    .map((text) => text.trim())
    .filter(Boolean)
    .map(Number);
  const min = cents(draft.min);
  const max = cents(draft.max);
  const hasCondition =
    contains.length > 0 || draft.direction !== 'any' || min !== undefined || max !== undefined || months.length > 0;
  if (
    draft.name.trim() === '' ||
    draft.categoryId === '' ||
    !hasCondition ||
    Number.isNaN(min) ||
    Number.isNaN(max) ||
    months.some((month) => !Number.isInteger(month) || month < 1 || month > 12)
  ) {
    return null;
  }
  return {
    name: draft.name.trim(),
    ...(contains.length > 0 ? { contains } : {}),
    ...(draft.direction !== 'any' ? { direction: draft.direction } : {}),
    ...(min !== undefined ? { minAmount: min } : {}),
    ...(max !== undefined ? { maxAmount: max } : {}),
    ...(months.length > 0 ? { months } : {}),
    categoryId: draft.categoryId,
    review: draft.review,
  };
}

/** "contains nomina · comes in · from RD$100,000.00 · in Dec". */
function describe(rule: Rule, t: TFunction) {
  const currency = (rule.currency as Currency | undefined) ?? 'DOP';
  const parts: string[] = [];
  if (rule.contains?.length) {
    parts.push(t('classification.rules.summary.contains', { texts: joinList(rule.contains.map((text) => `"${text}"`), t) }));
  }
  if (rule.direction) parts.push(t(`classification.rules.summary.${rule.direction}`));
  if (rule.minAmount) parts.push(t('classification.rules.summary.from', { amount: formatCurrency(rule.minAmount / 100, currency) }));
  if (rule.maxAmount) parts.push(t('classification.rules.summary.upTo', { amount: formatCurrency(rule.maxAmount / 100, currency) }));
  if (rule.months?.length) {
    const names = rule.months.map((month) => formatDateValue(`2026-${String(month).padStart(2, '0')}`, { month: 'short' }));
    parts.push(t('classification.rules.summary.months', { months: joinList(names, t) }));
  }
  return parts.join(' · ');
}

/**
 * The user's rules, in the order they're tried, with a form to add one.
 * Saving any change classifies everything again.
 */
export function RulesCard() {
  const { t } = useTranslation();
  const rules = useRules();
  const ledger = useLedger();
  const names = useLedgerNames(ledger);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState<'saved' | 'invalid' | 'failed' | null>(null);
  const choices = useMemo(() => categoryOptions(ledger.categories, ledger.groups, names), [ledger.categories, ledger.groups, names]);

  const save = (next: Rule[]) =>
    rules
      .save(next)
      .then(() => {
        setDraft(null);
        setMessage('saved');
      })
      .catch(() => setMessage('failed'));

  const add = () => {
    const rule = draft && toRule(draft);
    if (!rule || !rules.value) {
      setMessage('invalid');
      return;
    }
    void save([...rules.value, rule]);
  };
  const change = (patch: Partial<Draft>) => {
    setDraft((current) => ({ ...(current ?? emptyDraft), ...patch }));
    setMessage(null);
  };

  if (!rules.value) {
    return (
      <Card title={t('classification.rules.title')}>
        <Text tone="secondary">{rules.status === 'offline' ? t('classification.offline') : t('classification.loading')}</Text>
      </Card>
    );
  }
  const list = rules.value;

  return (
    <Card title={t('classification.rules.title')}>
      <Text tone="secondary" style={styles.description}>
        {t('classification.rules.description')}
      </Text>
      {list.length === 0 ? (
        <Text tone="tertiary">{t('classification.rules.empty')}</Text>
      ) : (
        <View style={styles.list}>
          {list.map((rule, index) => (
            <View key={rule.id ?? index} style={[styles.rule, index > 0 && styles.divider]}>
              <Text variant="caption" tone="tertiary" style={styles.position}>
                {index + 1}
              </Text>
              <View style={styles.ruleText}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {rule.name}
                </Text>
                <Text variant="caption" tone="secondary">
                  {`${describe(rule, t)} → ${names.category(rule.categoryId)}`}
                </Text>
              </View>
              <Button
                icon={Trash2}
                iconOnly
                accessibilityLabel={t('classification.rules.delete', { name: rule.name })}
                onPress={() => void save(list.filter((_, other) => other !== index))}
              />
            </View>
          ))}
        </View>
      )}

      {draft ? (
        <View style={styles.form}>
          <Field label={t('classification.rules.name')}>
            <TextField
              value={draft.name}
              onChangeText={(name) => change({ name })}
              placeholder={t('classification.rules.namePlaceholder')}
              accessibilityLabel={t('classification.rules.name')}
            />
          </Field>
          <Field label={t('classification.rules.contains')} hint={t('classification.rules.containsHint')}>
            <TextField
              value={draft.contains}
              onChangeText={(contains) => change({ contains })}
              placeholder={t('classification.rules.containsPlaceholder')}
              autoCapitalize="none"
              accessibilityLabel={t('classification.rules.contains')}
            />
          </Field>
          <Field label={t('classification.rules.direction')}>
            <SegmentedControl
              options={(['any', 'in', 'out'] as const).map((value) => ({
                value,
                label: t(`classification.rules.directions.${value}`),
              }))}
              value={draft.direction}
              onChange={(direction) => change({ direction })}
              accessibilityLabel={t('classification.rules.direction')}
            />
          </Field>
          <View style={styles.row}>
            <Field label={t('classification.rules.minAmount')} style={styles.rowField}>
              <TextField
                value={draft.min}
                onChangeText={(min) => change({ min })}
                placeholder={t('classification.rules.amountPlaceholder')}
                keyboardType="decimal-pad"
                accessibilityLabel={t('classification.rules.minAmount')}
              />
            </Field>
            <Field label={t('classification.rules.maxAmount')} style={styles.rowField}>
              <TextField
                value={draft.max}
                onChangeText={(max) => change({ max })}
                placeholder={t('classification.rules.amountPlaceholder')}
                keyboardType="decimal-pad"
                accessibilityLabel={t('classification.rules.maxAmount')}
              />
            </Field>
          </View>
          <Field label={t('classification.rules.months')} hint={t('classification.rules.monthsHint')}>
            <TextField
              value={draft.months}
              onChangeText={(months) => change({ months })}
              placeholder={t('classification.rules.monthsPlaceholder')}
              keyboardType="numbers-and-punctuation"
              accessibilityLabel={t('classification.rules.months')}
            />
          </Field>
          <Field label={t('classification.rules.category')}>
            <Select
              options={choices}
              value={draft.categoryId}
              placeholder={t('classification.rules.pickCategory')}
              onChange={(categoryId) => change({ categoryId })}
              accessibilityLabel={t('classification.rules.category')}
            />
          </Field>
          <View style={styles.check}>
            <Checkbox
              checked={draft.review}
              onChange={(review) => change({ review })}
              accessibilityLabel={t('classification.rules.review')}
            />
            <Text>{t('classification.rules.review')}</Text>
          </View>
          <View style={styles.actions}>
            <Button variant="primary" label={t('classification.save')} onPress={add} />
            <Button label={t('classification.cancel')} onPress={() => setDraft(null)} />
          </View>
        </View>
      ) : (
        <View style={styles.actions}>
          <Button icon={Plus} label={t('classification.rules.add')} onPress={() => change({})} />
        </View>
      )}
      {message ? (
        <Text tone={message === 'saved' ? 'secondary' : 'accent'}>
          {message === 'saved'
            ? t('classification.saved')
            : message === 'invalid'
              ? t('classification.rules.invalid')
              : t('classification.saveFailed')}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create((theme) => ({
  description: {
    marginTop: -theme.space[2],
  },
  list: {
    borderWidth: theme.layout.hairline,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
  },
  rule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[3],
    paddingHorizontal: theme.space[3],
    paddingVertical: theme.space[2.5],
  },
  divider: {
    borderTopWidth: theme.layout.hairline,
    borderTopColor: theme.colors.border,
  },
  position: {
    minWidth: 16,
  },
  ruleText: {
    flex: 1,
    minWidth: 0,
    gap: theme.space[0.5],
  },
  form: {
    gap: theme.space[4],
    paddingTop: theme.space[4],
    borderTopWidth: theme.layout.hairline,
    borderTopColor: theme.colors.border,
  },
  row: {
    flexDirection: 'row',
    gap: theme.space[3],
  },
  rowField: {
    flex: 1,
  },
  check: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2.5],
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space[2],
  },
}));
