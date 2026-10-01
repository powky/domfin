/** Strings shared by several screens: navigation, periods, account types, formats. */
export const common = {
  common: {
    clear: 'Clear',
    clearSearch: 'Clear search',
    closeMenu: 'Close menu',
    /** Joins the last two items of a list: "A, B and C". */
    and: 'and',
    comingSoon: {
      title: 'Coming soon',
      body: 'This section will be built once we define it.',
    },
    /** Screens that read the imported statements from domfin-api. */
    data: {
      loading: 'Loading your statements…',
      offline: "Couldn't reach domfin-api. Is it running?",
      empty: 'Nothing in this period. Import your statements to see it here.',
    },
  },
  /** The eye button at the top of every page. */
  privacy: {
    hide: 'Hide amounts',
    show: 'Show amounts',
  },
  nav: {
    transactions: 'Transactions',
    'cash-flow': 'Cash flow',
    spending: 'Spending',
    'net-worth': 'Net worth',
    accounts: 'Accounts',
    possessions: 'Possessions',
    loans: 'Loans',
    uncategorized: 'Uncategorized',
    imports: 'Import statements',
    more: 'More',
    settings: 'Settings',
  },
  /** Shorter names for the phone tab bar, where five labels share the width. */
  tabs: {
    transactions: 'Transactions',
    'cash-flow': 'Cash flow',
    spending: 'Spending',
    'net-worth': 'Net worth',
    more: 'More',
  },
  period: {
    label: 'Period',
    previous: 'Previous period',
    next: 'Next period',
    presets: {
      ytd: 'Year to date',
      last6: 'Last 6 months',
      last3: 'Last 3 months',
      month: 'This month',
    },
    latestStatement: 'From your imported statements · latest {{date}}',
    noStatements: 'No statements imported yet',
  },
  accountTypes: {
    cash: 'Cash',
    investment: 'Investments',
    retirement: 'Pensions',
    'real-estate': 'Real estate',
    vehicle: 'Vehicles',
    'credit-card': 'Credit cards',
    loan: 'Loans',
  },
  categories: {
    uncategorized: 'Uncategorized',
    split: 'Split',
  },
  duration: {
    years_one: '{{count}} yr',
    years_other: '{{count}} yrs',
    months_one: '{{count}} mo',
    months_other: '{{count}} mos',
    yearsAndMonths: '{{years}} {{months}}',
  },
  format: {
    /** Chart axes: $660K, $1.25M. */
    thousands: '{{value}}K',
    millions: '{{value}}M',
  },
} as const;
