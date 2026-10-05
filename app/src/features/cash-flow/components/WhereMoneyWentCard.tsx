import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Card, SegmentedControl } from '@/components/ui';

import type { FlowGrouping } from '../lib/buildFlow';
import type { CashFlowSummary } from '../types';
import { ProfitLossTable } from './ProfitLossTable';
import { SankeyChart } from './SankeyChart';

type ChartView = 'sankey' | 'pl';

const groupingValues = ['groups', 'categories', 'both'] as const satisfies readonly FlowGrouping[];

const viewValues = ['sankey', 'pl'] as const satisfies readonly ChartView[];

export function WhereMoneyWentCard({ summary }: { summary: CashFlowSummary }) {
  const { t } = useTranslation();
  const { rt } = useUnistyles();
  const [grouping, setGrouping] = useState<FlowGrouping>('groups');
  const [view, setView] = useState<ChartView>('sankey');
  // Phones only get the table: the chart needs more width than they have,
  // and a third of it, scrolled sideways, says little.
  const compact = rt.breakpoint === 'xs' || rt.breakpoint === 'sm';
  const shown = compact ? 'pl' : view;

  const groupingOptions = groupingValues.map((value) => ({ value, label: t(`cashFlow.grouping.${value}`) }));
  const viewOptions = viewValues.map((value) => ({ value, label: t(`cashFlow.chartType.${value}`) }));

  return (
    <Card
      title={t('cashFlow.whereMoneyWent')}
      actions={
        compact ? undefined : (
          <>
            {view === 'sankey' ? (
              <View style={styles.grouping}>
                <SegmentedControl
                  options={groupingOptions}
                  value={grouping}
                  onChange={setGrouping}
                  accessibilityLabel={t('cashFlow.grouping.label')}
                />
              </View>
            ) : null}
            <SegmentedControl
              options={viewOptions}
              value={view}
              onChange={setView}
              accessibilityLabel={t('cashFlow.chartType.label')}
            />
          </>
        )
      }
    >
      {shown === 'sankey' ? <SankeyChart summary={summary} grouping={grouping} /> : <ProfitLossTable summary={summary} />}
    </Card>
  );
}

const styles = StyleSheet.create(() => ({
  grouping: {
    display: { xs: 'none', md: 'flex' },
  },
}));
