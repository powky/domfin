export const loans = {
  loans: {
    kpis: {
      totalOwed: 'Total owed',
      down: 'Down {{amount}} this period',
      up: 'Up {{amount}} this period',
      paid: 'Paid this period',
      payments_one: '{{count}} payment',
      payments_other: '{{count}} payments',
      loans: 'Loans',
    },
    card: {
      label: '{{name}}, {{amount}} owed',
      down: 'Down {{amount}} this period',
      up: 'Up {{amount}} this period',
      paid: 'Paid this period',
      lastPayment: 'Last payment',
      asOf: 'History as of',
    },
  },
} as const;
