import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { DataNotice } from '@/components/DataNotice';
import { PeriodHeader, usePeriod } from '@/components/PeriodHeader';
import { Screen } from '@/components/Screen';

import { useLoans } from '../api/useLoans';
import { LoanCard } from './LoanCard';
import { LoansKpis } from './LoansKpis';

export function LoansScreen() {
  const { t } = useTranslation();
  const { preset, range, setPreset, setRange } = usePeriod('ytd');
  const overview = useLoans(range);

  return (
    <Screen
      header={
        <PeriodHeader
          title={t('nav.loans')}
          range={range}
          preset={preset}
          onRangeChange={setRange}
          onPresetChange={setPreset}
          latestStatement={overview.latestStatement}
        />
      }
    >
      {overview.loans.length === 0 ? (
        <DataNotice status={overview.status} />
      ) : (
        <>
          <LoansKpis overview={overview} />
          <View style={styles.cards}>
            {overview.loans.map((loan) => (
              <LoanCard key={loan.id} loan={loan} />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create((theme) => ({
  cards: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: { xs: theme.space[3], md: theme.space[4] },
  },
}));
