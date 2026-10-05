import { Plus, RotateCcw, X } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Button, Card, ColorSwatch, Text } from '@/components/ui';
import { groupColor } from '@/features/ledger';
import { dotSeparator, formatCurrency, keepTogether } from '@/lib/format';
import { usePhoneLayout } from '@/theme';

import { addFixedCost, dismissSuggestion } from '../api/budget';
import type { BudgetView, Suggestion } from '../api/useBudgetView';
import { WINDOW, paidByMonth } from '../lib/recurring';
import { HistoryBars } from './HistoryBars';
import { historyMonths } from './FixedCostsCard';

/**
 * Payments that repeat month after month and aren't fixed costs yet: one
 * press makes one a fixed cost, another stops suggesting it.
 */
export function SuggestionsCard({ view }: { view: BudgetView }) {
  const { t } = useTranslation();
  const [showDismissed, setShowDismissed] = useState(false);
  const [failed, setFailed] = useState(false);
  const run = (action: Promise<unknown>) => {
    setFailed(false);
    action.catch(() => setFailed(true));
  };

  return (
    <Card title={t('budget.suggestions.title')}>
      <Text tone="secondary" style={styles.description}>
        {t('budget.suggestions.description', { months: WINDOW })}
      </Text>
      {failed ? <Text tone="accent">{t('budget.form.failed')}</Text> : null}
      {!view.enoughHistory ? (
        <Text tone="secondary">{t('budget.suggestions.needHistory')}</Text>
      ) : view.suggestions.length === 0 ? (
        <Text tone="secondary">{t('budget.suggestions.empty')}</Text>
      ) : (
        <View accessibilityRole="list">
          {view.suggestions.map((suggestion, index) => (
            <SuggestionRow
              key={`${suggestion.match}|${suggestion.currency}`}
              suggestion={suggestion}
              view={view}
              divider={index > 0}
              onAdd={() =>
                run(
                  addFixedCost({
                    name: suggestion.name,
                    match: suggestion.match,
                    categoryId: suggestion.categoryId ?? undefined,
                    accountId: suggestion.accountId,
                    amount: suggestion.amount,
                    currency: suggestion.currency,
                    day: suggestion.day,
                  }),
                )
              }
              onDismiss={() => run(dismissSuggestion(suggestion.match))}
            />
          ))}
        </View>
      )}
      {view.dismissed.length > 0 ? (
        <View style={styles.dismissed}>
          <View style={styles.toggle}>
            <Button
              label={
                showDismissed
                  ? t('budget.suggestions.hideDismissed')
                  : t('budget.suggestions.showDismissed', { total: view.dismissed.length })
              }
              onPress={() => setShowDismissed((open) => !open)}
            />
          </View>
          {showDismissed
            ? view.dismissed.map((suggestion, index) => (
                <SuggestionRow
                  key={`${suggestion.match}|${suggestion.currency}`}
                  suggestion={suggestion}
                  view={view}
                  divider={index > 0}
                  onRestore={() => run(dismissSuggestion(suggestion.match, false))}
                />
              ))
            : null}
        </View>
      ) : null}
    </Card>
  );
}

type SuggestionRowProps = {
  suggestion: Suggestion;
  view: BudgetView;
  divider: boolean;
  onAdd?: () => void;
  onDismiss?: () => void;
  onRestore?: () => void;
};

function SuggestionRow({ suggestion, view, divider, onAdd, onDismiss, onRestore }: SuggestionRowProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const phone = usePhoneLayout();
  const color = theme.colors.chart[groupColor(view.names.groupOf(suggestion.categoryId))];
  const months = historyMonths(view.lastMonth, phone);
  const paid = paidByMonth(view.index, suggestion, months);
  const details = [
    view.names.category(suggestion.categoryId),
    t('budget.suggestions.months', { paid: suggestion.monthsPaid, total: suggestion.monthsConsidered }),
    t('budget.fixed.day', { day: suggestion.day }),
    suggestion.variable ? t('budget.suggestions.variable') : null,
  ]
    .filter((part): part is string => !!part)
    .map(keepTogether)
    .join(dotSeparator);
  const amount = formatCurrency(suggestion.amount / 100, suggestion.currency);
  const history = (
    <HistoryBars
      months={months}
      values={paid}
      color={color}
      accessibilityLabel={t('budget.fixed.history', { paid: paid.filter((value) => value > 0).length, total: months.length })}
    />
  );
  const actions = onRestore ? (
    <Button
      icon={RotateCcw}
      label={t('budget.suggestions.restore')}
      onPress={onRestore}
      accessibilityLabel={t('budget.suggestions.restoreLabel', { name: suggestion.name })}
    />
  ) : (
    <>
      <Button
        icon={X}
        iconOnly
        onPress={onDismiss}
        accessibilityLabel={t('budget.suggestions.dismissLabel', { name: suggestion.name })}
      />
      <Button
        variant="primary"
        icon={Plus}
        label={t('budget.suggestions.add')}
        onPress={onAdd}
        accessibilityLabel={t('budget.suggestions.addLabel', { name: suggestion.name })}
      />
    </>
  );

  return (
    <View style={[styles.row, divider && styles.divider]}>
      <View style={styles.line}>
        <View style={styles.swatch}>
          <ColorSwatch color={color} />
        </View>
        <View style={styles.info}>
          <Text variant="bodyStrong" numberOfLines={phone ? 2 : 1}>
            {suggestion.name}
          </Text>
          <Text variant="caption" tone="secondary" numberOfLines={phone ? 3 : 1}>
            {details}
          </Text>
        </View>
        {phone ? null : history}
        <Text variant="bodyStrong" align="right" style={styles.amount}>
          {suggestion.variable ? t('budget.suggestions.about', { amount }) : amount}
        </Text>
        {phone ? null : <View style={styles.actions}>{actions}</View>}
      </View>
      {phone ? (
        <View style={styles.phoneFooter}>
          {history}
          <View style={styles.actions}>{actions}</View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  description: {
    marginTop: -theme.space[2],
  },
  row: {
    gap: theme.space[2],
    paddingVertical: theme.space[3],
  },
  divider: {
    borderTopWidth: theme.layout.hairline,
    borderTopColor: theme.colors.border,
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
  amount: {
    flexShrink: 0,
    minWidth: { xs: 0, md: 132 },
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2],
  },
  // Under the name: the months on the left, the buttons on the right.
  phoneFooter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: theme.space[3],
    paddingLeft: 10 + theme.space[3],
  },
  dismissed: {
    gap: theme.space[2],
  },
  toggle: {
    flexDirection: 'row',
  },
}));
