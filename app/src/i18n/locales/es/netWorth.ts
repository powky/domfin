import type { netWorth as en } from '../en/netWorth';
import { plural, type Translation } from '../types';

export const netWorth = {
  netWorth: {
    kpis: {
      netWorth: 'Patrimonio neto',
      asOf: 'Al cierre de {{month}}',
      change: 'Cambio en el período',
      since: 'Desde el inicio de {{month}}',
      assets: 'Activos',
      liabilities: 'Pasivos',
    },
    chart: {
      title: 'Evolución del patrimonio neto',
      label: 'Gráfico de la evolución del patrimonio neto',
      view: 'Vista del gráfico',
      modes: {
        netWorth: 'Patrimonio neto',
        byType: 'Por tipo',
      },
      scopeLabel: 'Cuentas a graficar',
      scopes: {
        all: 'Todas las cuentas',
        assets: 'Activos',
        liabilities: 'Pasivos',
      },
      series: {
        all: 'Patrimonio neto',
        assets: 'Activos',
        liabilities: 'Pasivos',
      },
      stopCharting: 'Dejar de graficar {{name}}',
      clear: 'Quitar todas',
      introTap: 'Abre un tipo en las listas de abajo y toca las cuentas para graficarlas. Elige varias para compararlas.',
      introClick:
        'Abre un tipo en las listas de abajo y haz clic en las cuentas para graficarlas. Elige varias para compararlas.',
    },
    list: {
      assets: 'Activos',
      liabilities: 'Pasivos',
      type: 'Tipo',
      share: 'Porcentaje',
      balance: 'Saldo',
      ...plural('accounts', '{{count}} cuenta', '{{count}} cuentas'),
      accountHint: 'La agrega a la evolución del patrimonio neto',
    },
  },
} satisfies Translation<typeof en>;
