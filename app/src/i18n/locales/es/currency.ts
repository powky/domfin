import type { currency as en } from '../en/currency';
import type { Translation } from '../types';

export const currency = {
  currency: {
    title: 'Moneda',
    description: 'Los totales y gráficos se muestran en esta moneda. Cada cuenta y transacción conserva la suya.',
    label: 'Moneda de visualización',
    names: { DOP: 'Pesos', USD: 'Dólares' },
    savedHint: 'Se guarda en este dispositivo.',
    rate: {
      title: 'Tasa del dólar',
      date: 'Fecha de la tasa',
      buy: 'Compra',
      sell: 'Venta',
      midpoint: 'Conversión (promedio)',
      updated: 'Actualizada: {{time}}',
      status: {
        loading: 'Buscando la tasa más reciente…',
        live: 'Tasa de referencia publicada por el Banco Central de la República Dominicana.',
        stale: 'Domfin no pudo consultar al Banco Central; esta es la última tasa que guardó.',
        offline: 'domfin-api no responde; esta es la última tasa conocida.',
      },
      summary: 'BCRD · {{date}}',
      summaryLastKnown: 'BCRD · {{date}} · última conocida',
      summaryLabel: 'Tasa del dólar {{rate}}, del BCRD del {{date}}. Abre Configuración.',
    },
  },
} satisfies Translation<typeof en>;
