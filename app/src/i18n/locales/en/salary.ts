/** The salary from the pay stubs or set by hand, and the year's Christmas salary and bonus (Budget). */
export const salary = {
  salary: {
    title: 'Your salary',
    gross: 'gross a month',
    since: 'Since {{month}}',
    from: {
      payslips: 'from your pay stubs',
      manual: 'set by you',
    },
    intro: 'Import your pay stubs or set your gross salary: with it Domfin estimates your Christmas salary and your bonus.',
    set: 'Set my salary',
    change: 'Change',
    breakdown: 'Your pay stubs of {{month}}',
    pay: {
      salary: 'Salary',
      overtime: 'Overtime',
      bonus: 'Bonuses',
      christmas: 'Christmas salary',
      benefit: 'Allowances',
      other: 'Other income',
    },
    deductions: {
      isr: 'ISR',
      afp: 'AFP',
      sfs: 'SFS',
      other: 'Other deductions',
    },
    net: 'Net',
    /** `deductions`: what the year's stubs took for ISR, AFP and SFS. */
    yearToDate: 'In {{year}}: {{deductions}}',
    failed: "Couldn't save. Is domfin-api running?",
    form: {
      amount: 'Gross salary a month',
      amountHint: 'Before deductions, as your pay stub says. It counts from the month you pick, until a pay stub says otherwise.',
      since: 'Since',
      save: 'Save',
      cancel: 'Cancel',
      remove: 'Remove it',
    },
    yearEnd: {
      title: 'Christmas salary and bonus',
      christmas: 'Christmas salary',
      /** `total`: the year's salary. */
      christmasDetail: 'In December · a twelfth of your salary in {{year}} ({{total}}). No deductions.',
      bonus: 'Bonus',
      /** The law's bonus (bonificación): `days` days of the year's average monthly salary over 23.83. */
      bonusDetail: 'In {{month}} · {{days}} days of your average salary ({{average}} ÷ 23.83 × {{days}} = {{gross}}), less {{isr}} of ISR.',
      bonusPrompt: 'To estimate your bonus, say when you started the job and the month it’s paid.',
      total: 'In December you would get {{amount}}, besides your salary.',
      estimate: 'An estimate: the months without pay stubs count with your salary now, and the ISR follows the DGII’s 2026 scale.',
      configure: 'Set up the bonus',
      change: 'Change the bonus',
      hiredOn: 'Start date',
      hiredOnHint: 'From three years on, the bonus is 60 days of salary; before, 45.',
      hiredOnPlaceholder: 'YYYY-MM-DD',
      bonusMonth: 'Month it’s paid',
      noBonus: 'I don’t get one',
      invalid: 'Check the date (YYYY-MM-DD).',
      save: 'Save',
      cancel: 'Cancel',
    },
  },
};
