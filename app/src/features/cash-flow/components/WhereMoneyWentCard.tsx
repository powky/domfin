import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Card, SegmentedControl } from '@/components/ui';
import { usePhoneLayout } from '@/theme';

import type { FlowGrouping } from '../lib/buildFlow';
import type { CashFlowSummary } from '../types';
import { ProfitLossTable } from './ProfitLossTable';
import { SankeyChart } from './SankeyChart';

type ChartView = 'sankey' | 'pl';

const groupingValues = ['groups', 'categories', 'both'] as const satisfies readonly FlowGrouping[];
// Phones fit three columns: groups or categories, not both.
const phoneGroupingValues = ['groups', 'categories'] as const satisfies readonly FlowGrouping[];

const viewValues = ['sankey', 'pl'] as const satisfies readonly ChartView[];

export function WhereMoneyWentCard({ summary }: { summary: CashFlowSummary }) {
  const { t } = useTranslation();
  const phone = usePhoneLayout();
  const [grouping, setGrouping] = useState<FlowGrouping>('groups');
  const [view, setView] = useState<ChartView>('sankey');
  const shownGrouping = phone && grouping === 'both' ? 'groups' : grouping;

  const groupingOptions = (phone ? phoneGroupingValues : groupingValues).map((value) => ({
    value,
    label: t(`cashFlow.grouping.${value}`),
  }));
  const viewOptions = viewValues.map((value) => ({ value, label: t(`cashFlow.chartType.${value}`) }));

  const groupingControl =
    view === 'sankey' ? (
      <SegmentedControl
        options={groupingOptions}
        value={shownGrouping}
        onChange={setGrouping}
        accessibilityLabel={t('cashFlow.grouping.label')}
      />
    ) : null;
  const viewControl = (
    <SegmentedControl
      options={viewOptions}
      value={view}
      onChange={setView}
      accessibilityLabel={t('cashFlow.chartType.label')}
    />
  );

  return (
    <Card
      title={t('cashFlow.whereMoneyWent')}
      // On phones the controls stack under the title: the view first, so it
      // stays put when the grouping comes and goes. On wider screens they
      // share the title's row, the view at the end for the same reason.
      actions={
        phone ? (
          <>
            {viewControl}
            {groupingControl}
          </>
        ) : (
          <>
            {groupingControl}
            {viewControl}
          </>
        )
      }
    >
      {view === 'sankey' ? (
        <SankeyChart summary={summary} grouping={shownGrouping} />
      ) : (
        <ProfitLossTable summary={summary} />
      )}
    </Card>
  );
}
