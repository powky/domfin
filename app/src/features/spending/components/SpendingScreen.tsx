import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DataNotice } from '@/components/DataNotice';
import { PeriodHeader, usePeriod } from '@/components/PeriodHeader';
import { Screen } from '@/components/Screen';

import { useSpending } from '../api/useSpending';
import type { BreakdownMode } from '../types';
import { SpendingBreakdownCard } from './SpendingBreakdownCard';
import { SpendingKpis } from './SpendingKpis';
import { SpendingTrendCard } from './SpendingTrendCard';

export function SpendingScreen() {
  const { t } = useTranslation();
  const { preset, range, setPreset, setRange } = usePeriod('ytd');
  const [mode, setMode] = useState<BreakdownMode>('categories');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const summary = useSpending(range);
  const selected = summary[mode].filter((item) => selectedIds.includes(item.id));

  const changeMode = (next: BreakdownMode) => {
    setMode(next);
    setSelectedIds([]);
  };
  const toggleItem = (id: string) =>
    setSelectedIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));

  return (
    <Screen
      header={
        <PeriodHeader
          title={t('nav.spending')}
          range={range}
          preset={preset}
          onRangeChange={setRange}
          onPresetChange={setPreset}
          latestStatement={summary.latestStatement}
        />
      }
    >
      {summary.total > 0 ? (
        <>
          <SpendingKpis summary={summary} />
          <SpendingBreakdownCard
            summary={summary}
            mode={mode}
            onModeChange={changeMode}
            selectedIds={selectedIds}
            onToggleItem={toggleItem}
          />
          <SpendingTrendCard summary={summary} selected={selected} />
        </>
      ) : (
        <DataNotice status={summary.status} />
      )}
    </Screen>
  );
}
