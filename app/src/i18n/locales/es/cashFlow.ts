import type { cashFlow as en } from '../en/cashFlow';
import type { Translation } from '../types';

export const cashFlow = {
  cashFlow: {
    income: 'Ingresos',
    expenses: 'Gastos',
    savings: 'Ahorro',
    netSavings: 'Ahorro neto',
    amountShare: '{{amount}} ({{percent}})',
    investments: 'Inversiones',
    otherInvestments: 'Otras inversiones',
    loans: 'Préstamos',
    drawn: 'De tus cuentas',
    kept: 'Quedó en tus cuentas',
    breakdownView: 'Vista de {{title}}',
    modes: {
      category: 'Categoría',
      merchant: 'Comercio',
      group: 'Grupo',
    },
    whereMoneyWent: 'A dónde fue el dinero',
    grouping: {
      label: 'Agrupación',
      groups: 'Grupos',
      categories: 'Categorías',
      both: 'Ambos',
    },
    chartType: {
      label: 'Tipo de gráfico',
      sankey: 'Sankey',
      pl: 'Ganancias y pérdidas',
    },
    table: {
      category: 'Categoría',
      percentOfIncome: '% de ingresos',
      amount: 'Monto',
    },
  },
} satisfies Translation<typeof en>;
