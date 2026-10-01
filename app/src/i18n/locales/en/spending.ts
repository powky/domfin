export const spending = {
  spending: {
    kpis: {
      total: 'Total spending',
      averagePerMonth: 'Average per month',
      largestGroup: 'Largest group',
      shareOfSpending: '{{percent}} of spending',
      transactions: 'Transactions',
    },
    breakdown: {
      title: 'Spending breakdown',
      by: 'Breakdown by',
      modes: {
        groups: 'Groups',
        categories: 'Categories',
        merchants: 'Merchants',
      },
      total: 'Total',
      showLess: 'Show less',
      showAll: 'Show all {{count}}',
      rowHint: 'Charts this item in the spending trend',
    },
    trend: {
      title: 'Spending trend',
      view: 'Trend view',
      views: {
        monthly: 'Monthly',
        cumulative: 'Cumulative',
      },
      showing: 'Showing {{items}}. Click them again in the breakdown to remove.',
      hint: 'Click categories in the breakdown above to chart them. Click a month to see its transactions.',
      bar: '{{month}}: {{amount}}. Opens transactions.',
    },
  },
} as const;
