/** The Possessions screen: what you own outside your accounts, by kind. */
export const possessions = {
  possessions: {
    /** `total` comes formatted, in the display currency. */
    subtitle_one: '{{count}} possession · {{total}}',
    subtitle_other: '{{count}} possessions · {{total}}',
    groups: {
      property: 'Real estate',
      shares: 'Shares',
      pension: 'Pension funds',
      vehicle: 'Vehicles',
    },
    empty:
      'Nothing here yet. Add your home, your shares, your pension fund or your car: what they’re worth counts in your net worth.',
    debts: 'Debts outside your statements are in Loans.',
    /** Amounts and dates come formatted. */
    caption: {
      paid: '{{amount}} paid',
      paidOf: '{{paid}} paid of {{price}}',
      shares_one: '{{count}} share',
      shares_other: '{{count}} shares',
      asOf: 'As of {{date}}',
      vehicle: 'Cost {{price}} · loses {{rate}} a year',
    },
    plan: {
      next: 'Next: {{amount}} on {{date}} · {{label}}',
      overdue: 'Overdue: {{amount}} since {{date}} · {{label}}',
      delivery: 'On handover: {{amount}}, around {{date}}',
      deliveryUndated: 'On handover: {{amount}}',
      done: 'Fully paid',
      missing:
        'Add its price and payment plan (installments every few months up to a date, and the rest on handover) to see what’s paid and what’s left.',
      add: 'Add payment plan',
    },
  },
};
