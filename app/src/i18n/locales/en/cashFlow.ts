export const cashFlow = {
  cashFlow: {
    income: 'Income',
    expenses: 'Expenses',
    savings: 'Savings',
    netSavings: 'Net savings',
    /** Second line of a Sankey node: "RD$6,928,995.13 (29.1%)". */
    amountShare: '{{amount}} ({{percent}})',
    investments: 'Investments',
    otherInvestments: 'Other investments',
    /** Sankey source when you put more into investments than you saved: the rest came from your balances. */
    loans: 'Loans',
    drawn: 'From your accounts',
    kept: 'Left in your accounts',
    /** Accessibility label of a breakdown card's view switch. */
    breakdownView: '{{title}} view',
    modes: {
      category: 'Category',
      merchant: 'Merchant',
      group: 'Group',
    },
    whereMoneyWent: 'Where the money went',
    grouping: {
      label: 'Grouping',
      groups: 'Groups',
      categories: 'Categories',
      both: 'Both',
    },
    chartType: {
      label: 'Chart type',
      sankey: 'Sankey',
      pl: 'Profit & loss',
    },
    table: {
      category: 'Category',
      percentOfIncome: '% of income',
      amount: 'Amount',
    },
  },
} as const;
