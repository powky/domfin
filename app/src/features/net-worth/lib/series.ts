import { i18n } from '@/i18n';
import type { ChartColor } from '@/theme';

import type { ChartMode, ChartScope, NetWorthSummary, SelectedAccount } from '../types';

export type SeriesSpec = {
  id: string;
  label: string;
  /** `accent` for the single total line. */
  color: ChartColor | 'accent';
  values: number[];
};

/**
 * Lines for "Net worth over time". Accounts picked in the lists win over the
 * view; otherwise one total line, or one line per account type.
 */
export function chartSeries(
  summary: NetWorthSummary,
  { mode, scope, selected }: { mode: ChartMode; scope: ChartScope; selected: SelectedAccount[] },
): SeriesSpec[] {
  const sides = scope === 'all' ? [summary.assets, summary.liabilities] : [summary[scope]];

  if (selected.length > 0) {
    const accounts = new Map(
      [summary.assets, summary.liabilities]
        .flatMap((side) => side.types.flatMap((type) => type.accounts))
        .map((account) => [account.id, account]),
    );
    return selected.flatMap(({ id, color }) => {
      const account = accounts.get(id);
      return account ? [{ id, label: account.name, color, values: account.values }] : [];
    });
  }

  if (mode === 'byType') {
    return sides.flatMap((side) =>
      side.types.map((type) => ({ id: type.type, label: type.label, color: type.color, values: type.values })),
    );
  }

  const values = scope === 'all' ? summary.netWorthValues : summary[scope].values;
  return [{ id: scope, label: i18n.t(`netWorth.chart.series.${scope}`), color: 'accent', values }];
}
