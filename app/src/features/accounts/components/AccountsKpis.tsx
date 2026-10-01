import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { StatCard } from '@/components/ui';
import { formatShortDate } from '@/lib/dates';
import { formatCurrency, formatPercent } from '@/lib/format';

import type { AccountsOverview } from '../types';

export function AccountsKpis({ overview }: { overview: AccountsOverview }) {
  const { t } = useTranslation();
  const { counts, groups, latestStatement } = overview;
  const utilization = overview.creditLimit > 0 ? overview.creditUsed / overview.creditLimit : 0;
  const institutions = groups.institution.map((group) => group.label).join(', ');

  return (
    <View style={styles.grid}>
      <StatCard
        label={t('accounts.kpis.accounts')}
        value={String(overview.accounts.length)}
        caption={[
          t('accounts.kpis.assets', { count: counts.assets }),
          t('accounts.kpis.liabilities', { count: counts.liabilities }),
        ].join(' · ')}
      />
      <StatCard
        label={t('accounts.kpis.cash')}
        value={formatCurrency(overview.cash)}
        caption={t('accounts.kpis.cashCaption')}
      />
      <StatCard
        label={t('accounts.kpis.creditUsed')}
        value={formatCurrency(overview.creditUsed)}
        caption={t('accounts.kpis.creditCaption', {
          percent: formatPercent(utilization),
          limit: formatCurrency(overview.creditLimit),
        })}
      />
      <StatCard
        label={t('accounts.kpis.lastStatement')}
        value={latestStatement ? formatShortDate(latestStatement) : '—'}
        caption={t('accounts.kpis.importedFrom', { institutions })}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: { xs: theme.space[3], md: theme.space[4] },
  },
}));
