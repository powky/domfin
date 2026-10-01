import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Card, ProgressBar, Text } from '@/components/ui';
import { formatCurrency, formatPercent } from '@/lib/format';
import type { AppTheme } from '@/theme';

import type { AccountsOverview } from '../types';
import { InstitutionAvatar } from './InstitutionAvatar';

/** Under 30% is healthy, up to 50% worth watching, above that high. */
function utilizationColor(ratio: number, colors: AppTheme['colors']) {
  if (ratio < 0.3) return colors.chart.income;
  if (ratio < 0.5) return colors.chart.amber;
  return colors.spending;
}

export function CreditUtilizationCard({ overview }: { overview: AccountsOverview }) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const cards = overview.accounts.filter((account) => account.type === 'credit-card');
  const ratio = overview.creditLimit > 0 ? overview.creditUsed / overview.creditLimit : 0;

  return (
    <Card title={t('accounts.credit.title')} style={styles.card}>
      <View style={styles.summary}>
        <Text variant="kpi">{formatPercent(ratio)}</Text>
        <Text variant="caption" tone="secondary">
          {t('accounts.credit.summary', {
            used: formatCurrency(overview.creditUsed),
            limit: formatCurrency(overview.creditLimit),
            count: cards.length,
          })}
        </Text>
      </View>
      <ProgressBar value={ratio} color={utilizationColor(ratio, theme.colors)} />
      <View style={styles.list}>
        {cards.map((card) => {
          const cardRatio = card.creditLimit ? card.balance / card.creditLimit : 0;
          return (
            <View key={card.id} style={styles.item}>
              <View style={styles.itemHeader}>
                <InstitutionAvatar institution={card.institution} size="sm" />
                <Text variant="bodyMedium" numberOfLines={1} style={styles.name}>
                  {card.name}
                </Text>
                <Text variant="bodyStrong">{formatCurrency(card.balance, card.currency)}</Text>
              </View>
              <ProgressBar value={cardRatio} color={utilizationColor(cardRatio, theme.colors)} />
              <Text variant="caption" tone="secondary">
                {t('accounts.credit.cardLimit', {
                  percent: formatPercent(cardRatio),
                  limit: formatCurrency(card.creditLimit ?? 0, card.currency),
                })}
              </Text>
            </View>
          );
        })}
      </View>
      <Text variant="caption" tone="tertiary">
        {t('accounts.credit.tip', { percent: formatPercent(0.3, 0) })}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    flex: { xs: undefined, md: 1 },
    minWidth: 0,
  },
  summary: {
    gap: theme.space[0.5],
  },
  list: {
    gap: theme.space[4],
    paddingTop: theme.space[1],
  },
  item: {
    gap: theme.space[2],
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2.5],
  },
  name: {
    flex: 1,
  },
}));
