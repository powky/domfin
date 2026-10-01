import type { loans as en } from '../en/loans';
import { plural, type Translation } from '../types';

export const loans = {
  loans: {
    kpis: {
      totalOwed: 'Total adeudado',
      down: 'Bajó {{amount}} en el periodo',
      up: 'Subió {{amount}} en el periodo',
      paid: 'Pagado en el periodo',
      ...plural('payments', '{{count}} pago', '{{count}} pagos'),
      loans: 'Préstamos',
    },
    card: {
      label: '{{name}}, {{amount}} adeudado',
      down: 'Bajó {{amount}} en el periodo',
      up: 'Subió {{amount}} en el periodo',
      paid: 'Pagado en el periodo',
      lastPayment: 'Último pago',
      asOf: 'Historial al',
    },
  },
} satisfies Translation<typeof en>;
