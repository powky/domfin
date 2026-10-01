import { useTranslation } from 'react-i18next';

import { PeriodHeader, usePeriod } from '@/components/PeriodHeader';
import { Screen } from '@/components/Screen';

import { useTransactions } from '../api/useTransactions';
import { TransactionsCard } from './TransactionsCard';

export function TransactionsScreen() {
  const { t } = useTranslation();
  const { preset, range, setPreset, setRange } = usePeriod('ytd');
  const { data } = useTransactions();

  return (
    <Screen
      header={
        <PeriodHeader
          title={t('nav.transactions')}
          range={range}
          preset={preset}
          onRangeChange={setRange}
          onPresetChange={setPreset}
          latestStatement={data.latestStatement}
        />
      }
    >
      <TransactionsCard data={data} range={range} />
    </Screen>
  );
}
