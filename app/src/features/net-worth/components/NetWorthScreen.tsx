import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { DataNotice } from '@/components/DataNotice';
import { PeriodHeader, usePeriod } from '@/components/PeriodHeader';
import { Screen } from '@/components/Screen';

import { useNetWorth } from '../api/useNetWorth';
import { toggleSelection } from '../lib/selection';
import type { SelectedAccount } from '../types';
import { AccountListCard } from './AccountListCard';
import { NetWorthChartCard } from './NetWorthChartCard';
import { NetWorthKpis } from './NetWorthKpis';

export function NetWorthScreen() {
  const { t } = useTranslation();
  const { preset, range, setPreset, setRange } = usePeriod('ytd');
  const summary = useNetWorth(range);
  const [selected, setSelected] = useState<SelectedAccount[]>([]);

  const toggleAccount = (id: string) => setSelected((current) => toggleSelection(current, id));
  const clearSelection = () => setSelected([]);
  const empty = summary.assets.types.length === 0 && summary.liabilities.types.length === 0;

  return (
    <Screen
      header={
        <PeriodHeader
          title={t('nav.net-worth')}
          latestStatement={summary.latestStatement}
          range={range}
          preset={preset}
          onRangeChange={setRange}
          onPresetChange={setPreset}
        />
      }
    >
      {empty ? (
        <DataNotice status={summary.status} />
      ) : (
        <>
          <NetWorthKpis summary={summary} />
          <NetWorthChartCard
            summary={summary}
            selected={selected}
            onToggleAccount={toggleAccount}
            onClearSelection={clearSelection}
          />
          <View style={styles.lists}>
            <AccountListCard
              title={t('netWorth.list.assets')}
              side={summary.assets}
              selected={selected}
              onToggleAccount={toggleAccount}
            />
            <AccountListCard
              title={t('netWorth.list.liabilities')}
              side={summary.liabilities}
              selected={selected}
              onToggleAccount={toggleAccount}
            />
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create((theme) => ({
  // Side by side only when each list has room for its three columns.
  lists: {
    flexDirection: { xs: 'column', xl: 'row' },
    alignItems: { xs: 'stretch', xl: 'flex-start' },
    gap: theme.space[4],
  },
}));
