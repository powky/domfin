import { Link } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Card, ColorSwatch, StackedBar, Text, Touchable } from '@/components/ui';
import { formatCurrency, formatPercent } from '@/lib/format';

import type { AccountsOverview } from '../types';

/** Assets, liabilities and what is left: the bridge to the Net worth screen. */
export function BalanceSheetCard({ overview }: { overview: AccountsOverview }) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const { assets, liabilities, counts } = overview;
  const netWorth = assets - liabilities;
  const assetColor = theme.colors.chart.income;
  const debtColor = theme.colors.spending;

  return (
    <Card title={t('accounts.balanceSheet.title')} style={styles.card}>
      <View style={styles.rows}>
        <Row
          color={assetColor}
          label={t('accounts.balanceSheet.assets')}
          caption={t('accounts.balanceSheet.accounts', { count: counts.assets })}
          amount={assets}
        />
        <Row
          color={debtColor}
          label={t('accounts.balanceSheet.liabilities')}
          caption={t('accounts.balanceSheet.accounts', { count: counts.liabilities })}
          amount={liabilities}
        />
      </View>
      <View style={styles.bar}>
        <StackedBar
          segments={[
            { id: 'liabilities', value: liabilities, color: debtColor },
            { id: 'equity', value: Math.max(netWorth, 0), color: assetColor },
          ]}
        />
        <Text variant="caption" tone="secondary">
          {t('accounts.balanceSheet.owe', { percent: formatPercent(assets > 0 ? liabilities / assets : 0) })}
        </Text>
      </View>
      <View style={styles.total}>
        <Text variant="bodyStrong">{t('accounts.balanceSheet.netWorth')}</Text>
        <Text variant="title">{formatCurrency(netWorth)}</Text>
      </View>
      <Link href="/net-worth" asChild>
        <Touchable accessibilityRole="link" containerStyle={styles.linkContainer} surfaceStyle={styles.link}>
          <Text variant="label" tone="accent">
            {t('accounts.balanceSheet.seeNetWorth')}
          </Text>
          <ChevronRight size={16} strokeWidth={2} color={theme.colors.text.accent} />
        </Touchable>
      </Link>
    </Card>
  );
}

function Row({ color, label, caption, amount }: { color: string; label: string; caption: string; amount: number }) {
  return (
    <View style={styles.row}>
      <ColorSwatch shape="square" color={color} />
      <View style={styles.rowLabel}>
        <Text variant="bodyMedium">{label}</Text>
        <Text variant="caption" tone="secondary">
          {caption}
        </Text>
      </View>
      <Text variant="bodyStrong">{formatCurrency(amount)}</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    flex: { xs: undefined, md: 1 },
    minWidth: 0,
  },
  rows: {
    gap: theme.space[3],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2.5],
  },
  rowLabel: {
    flex: 1,
  },
  bar: {
    gap: theme.space[2],
  },
  total: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space[3],
    paddingTop: theme.space[3],
    borderTopWidth: theme.layout.hairline,
    borderTopColor: theme.colors.border,
  },
  linkContainer: {
    alignSelf: 'flex-start',
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[1],
  },
}));
