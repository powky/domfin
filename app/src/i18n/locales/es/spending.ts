import type { spending as en } from '../en/spending';
import type { Translation } from '../types';

export const spending = {
  spending: {
    kpis: {
      total: 'Gasto total',
      averagePerMonth: 'Promedio mensual',
      largestGroup: 'Grupo más grande',
      shareOfSpending: '{{percent}} del gasto',
      transactions: 'Transacciones',
    },
    breakdown: {
      title: 'Desglose de gastos',
      by: 'Desglosar por',
      modes: {
        groups: 'Grupos',
        categories: 'Categorías',
        merchants: 'Comercios',
      },
      total: 'Total',
      showLess: 'Mostrar menos',
      showAll: 'Mostrar todo ({{count}})',
      rowHint: 'Lo agrega a la tendencia de gastos',
    },
    trend: {
      title: 'Tendencia de gastos',
      view: 'Vista de la tendencia',
      views: {
        monthly: 'Mensual',
        cumulative: 'Acumulado',
      },
      showing: 'Mostrando {{items}}. Vuelve a hacer clic en ellos en el desglose para quitarlos.',
      showingTap: 'Mostrando {{items}}. Vuelve a tocarlos en el desglose para quitarlos.',
      hint: 'Haz clic en las categorías del desglose de arriba para graficarlas. Haz clic en un mes para ver sus transacciones.',
      hintTap: 'Toca las categorías del desglose de arriba para graficarlas. Toca un mes para ver sus transacciones.',
      bar: '{{month}}: {{amount}}. Abre las transacciones.',
    },
  },
} satisfies Translation<typeof en>;
