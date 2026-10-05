import { Check, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Button, Card, ColorSwatch, Text, Touchable } from '@/components/ui';
import { groupColor, type LedgerNames } from '@/features/ledger';
import { addMonths, formatShortDate } from '@/lib/dates';
import { dotSeparator, formatCurrency, keepTogether } from '@/lib/format';
import { usePhoneLayout } from '@/theme';

import { addFixedCost, removeFixedCost, updateFixedCost } from '../api/budget';
import type { BudgetView } from '../api/useBudgetView';
import type { FixedCostMonth } from '../lib/plan';
import { paidByMonth, type PaymentIndex } from '../lib/recurring';
import type { FixedCost } from '../types';
import { FixedCostForm } from './FixedCostForm';
import { HistoryBars } from './HistoryBars';

/** The months a row's history shows, ending with `month`: a year on wide screens, half on phones. */
export const historyMonths = (month: string, phone: boolean) =>
  Array.from({ length: phone ? 6 : 12 }, (_, n) => addMonths(month, n - (phone ? 5 : 11)));

/** The fixed costs, each with where it stands in `month` and what it was paid the months before. */
export function FixedCostsCard({ view, month }: { view: BudgetView; month: string }) {
  const { t } = useTranslation();
  const phone = usePhoneLayout();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const months = historyMonths(month, phone);

  return (
    <Card
      title={t('budget.fixed.title')}
      actions={
        adding ? null : (
          <Button icon={Plus} label={t('budget.fixed.add')} onPress={() => setAdding(true)} />
        )
      }
    >
      <Text tone="secondary" style={styles.description}>
        {t('budget.fixed.description')}
      </Text>
      {adding ? (
        <FixedCostForm
          onSave={(item) => addFixedCost(item).then(() => setAdding(false))}
          onCancel={() => setAdding(false)}
        />
      ) : null}
      {view.plan.items.length === 0 && !adding ? (
        <Text tone="secondary">{t('budget.fixed.empty')}</Text>
      ) : (
        <View accessibilityRole="list">
          {view.plan.items.map((row, index) =>
            editing === row.item.id ? (
              <View key={row.item.id} style={[styles.editing, index > 0 && styles.divider]}>
                <FixedCostForm
                  item={row.item}
                  onSave={(item) => updateFixedCost(item as FixedCost).then(() => setEditing(null))}
                  onRemove={() => removeFixedCost(row.item.id).then(() => setEditing(null))}
                  onCancel={() => setEditing(null)}
                />
              </View>
            ) : (
              <FixedCostRow
                key={row.item.id}
                row={row}
                months={months}
                month={month}
                index={view.index}
                names={view.names}
                divider={index > 0}
                phone={phone}
                onPress={() => setEditing(row.item.id)}
              />
            ),
          )}
        </View>
      )}
    </Card>
  );
}

type FixedCostRowProps = {
  row: FixedCostMonth;
  months: string[];
  month: string;
  index: PaymentIndex;
  names: LedgerNames;
  divider: boolean;
  phone: boolean;
  onPress: () => void;
};

function FixedCostRow({ row, months, month, index, names, divider, phone, onPress }: FixedCostRowProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const { item } = row;
  const color = theme.colors.chart[groupColor(names.groupOf(item.categoryId ?? null))];
  const details = [
    item.categoryId ? names.category(item.categoryId) : null,
    item.day ? t('budget.fixed.day', { day: item.day }) : null,
  ]
    .filter((part): part is string => !!part)
    .map(keepTogether)
    .join(dotSeparator);
  const paidMonths = paidByMonth(index, item, months);
  const history = item.match ? (
    <HistoryBars
      months={months}
      values={paidMonths}
      color={color}
      current={month}
      accessibilityLabel={t('budget.fixed.history', {
        paid: paidMonths.filter((value) => value > 0).length,
        total: months.length,
      })}
    />
  ) : null;
  const amount = (
    <Text variant="bodyStrong" align="right">
      {formatCurrency(item.amount / 100, item.currency)}
    </Text>
  );

  return (
    <Touchable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('budget.fixed.edit', { name: item.name })}
      surfaceStyle={[styles.row, divider && styles.divider]}
      hoverStyle={styles.hovered}
      pressedStyle={styles.hovered}
    >
      <View style={styles.line}>
        <View style={styles.swatch}>
          <ColorSwatch color={color} />
        </View>
        <View style={styles.info}>
          <Text variant="bodyStrong" numberOfLines={phone ? 2 : 1}>
            {item.name}
          </Text>
          {details ? (
            <Text variant="caption" tone="secondary" numberOfLines={phone ? 2 : 1}>
              {details}
            </Text>
          ) : null}
        </View>
        {phone ? (
          amount
        ) : (
          <>
            {history}
            <View style={styles.values}>
              {amount}
              <StatusText row={row} />
            </View>
          </>
        )}
      </View>
      {/* On phones, the months on the left and where it stands this month on their right. */}
      {phone ? (
        <View style={styles.phoneFooter}>
          {history ?? <View />}
          <StatusText row={row} />
        </View>
      ) : null}
    </Touchable>
  );
}

/** "Paid on Sep 3", "Due on Oct 3", "Not in your statements", "Added by hand". */
function StatusText({ row }: { row: FixedCostMonth }) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const { item, status } = row;
  switch (status.kind) {
    case 'paid': {
      // A bill that changes: say what it was this time.
      const differs = Math.abs(status.amount - item.amount) > item.amount * 0.01;
      return (
        <View style={styles.status}>
          <Check size={12} strokeWidth={3} color={theme.colors.positive} />
          <Text variant="caption" tone="positive" align="right" numberOfLines={1} style={styles.shrink}>
            {differs
              ? t('budget.fixed.status.paidAmount', {
                  amount: formatCurrency(status.amount / 100, item.currency),
                  date: formatShortDate(status.date),
                })
              : t('budget.fixed.status.paid', { date: formatShortDate(status.date) })}
          </Text>
        </View>
      );
    }
    case 'due':
      return (
        <Text variant="caption" tone="secondary" align="right" numberOfLines={1} style={styles.shrink}>
          {t('budget.fixed.status.due', { date: formatShortDate(status.date) })}
        </Text>
      );
    case 'missing':
      return (
        <Text variant="caption" tone="accent" align="right" numberOfLines={1} style={styles.shrink}>
          {t('budget.fixed.status.missing')}
        </Text>
      );
    case 'manual':
      return (
        <Text variant="caption" tone="tertiary" align="right" numberOfLines={1} style={styles.shrink}>
          {t('budget.fixed.status.manual')}
        </Text>
      );
  }
}

const styles = StyleSheet.create((theme) => ({
  description: {
    marginTop: -theme.space[2],
  },
  row: {
    gap: theme.space[2],
    paddingVertical: theme.space[3],
    paddingHorizontal: theme.space[2],
    marginHorizontal: -theme.space[2],
    borderRadius: theme.radius.md,
  },
  editing: {
    paddingVertical: theme.space[3],
  },
  divider: {
    borderTopWidth: theme.layout.hairline,
    borderTopColor: theme.colors.border,
  },
  hovered: {
    backgroundColor: theme.colors.surfaceHover,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[3],
  },
  swatch: {
    alignSelf: 'flex-start',
    height: theme.font.lineHeight.base,
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    minWidth: 0,
    gap: theme.space[0.5],
  },
  // As wide in every row, so the months line up in columns.
  values: {
    alignItems: 'flex-end',
    gap: theme.space[0.5],
    width: 200,
  },
  // A long one ("Paid RD$3,593.37 on Sep 2") gives way instead of running past the edge.
  status: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[1],
  },
  shrink: {
    flexShrink: 1,
  },
  // Under the name, lined up with it.
  phoneFooter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: theme.space[3],
    paddingLeft: 10 + theme.space[3],
  },
}));
