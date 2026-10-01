export const netWorth = {
  netWorth: {
    kpis: {
      netWorth: 'Net worth',
      asOf: 'As of end of {{month}}',
      change: 'Change this period',
      since: 'Since the start of {{month}}',
      assets: 'Assets',
      liabilities: 'Liabilities',
    },
    chart: {
      title: 'Net worth over time',
      label: 'Net worth over time chart',
      view: 'Chart view',
      modes: {
        netWorth: 'Net worth',
        byType: 'By type',
      },
      scopeLabel: 'Accounts to chart',
      scopes: {
        all: 'All accounts',
        assets: 'Assets',
        liabilities: 'Liabilities',
      },
      /** Name of the single total line for each scope. */
      series: {
        all: 'Net worth',
        assets: 'Assets',
        liabilities: 'Liabilities',
      },
      stopCharting: 'Stop charting {{name}}',
      clear: 'Clear',
      introTap: 'Open a type in the lists below, then tap accounts to chart them. Pick several to compare.',
      introClick: 'Open a type in the lists below, then click accounts to chart them. Pick several to compare.',
    },
    list: {
      assets: 'Assets',
      liabilities: 'Liabilities',
      type: 'Type',
      share: 'Share',
      balance: 'Balance',
      accounts_one: '{{count}} account',
      accounts_other: '{{count}} accounts',
      accountHint: 'Charts this account in Net worth over time',
    },
  },
} as const;
