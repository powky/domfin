export const currency = {
  currency: {
    title: 'Currency',
    description: 'Totals and charts show in this currency. Each account and transaction keeps its own.',
    label: 'Display currency',
    names: { DOP: 'Pesos', USD: 'Dollars' },
    savedHint: 'Saved on this device.',
    rate: {
      title: 'Dollar rate',
      date: 'Rate date',
      buy: 'Buy',
      sell: 'Sell',
      midpoint: 'Converts at (midpoint)',
      updated: 'Updated {{time}}.',
      status: {
        loading: 'Getting the latest rate…',
        live: 'Reference rate published by the Banco Central de la República Dominicana.',
        stale: "domfin-api couldn't reach the Banco Central, so this is the last rate it saved.",
        offline: "domfin-api isn't answering, so this is the last rate known.",
      },
      /** Sidebar line under the rate: "BCRD · Sep 28, 2026". */
      summary: 'BCRD · {{date}}',
      summaryLastKnown: 'BCRD · {{date}} · last known',
      summaryLabel: 'Dollar rate {{rate}}, from the BCRD on {{date}}. Opens Settings.',
    },
  },
} as const;
