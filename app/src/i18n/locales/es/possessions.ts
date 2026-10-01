import type { possessions as en } from '../en/possessions';
import { plural, type Translation } from '../types';

export const possessions = {
  possessions: {
    ...plural('subtitle', '{{count}} posesión · {{total}}', '{{count}} posesiones · {{total}}'),
    groups: {
      property: 'Inmuebles',
      shares: 'Acciones',
      pension: 'Fondos de pensiones',
      vehicle: 'Vehículos',
    },
    empty:
      'Todavía no hay nada aquí. Agrega tu casa, tus acciones, tu AFP o tu vehículo: lo que valen cuenta en tu patrimonio neto.',
    debts: 'Las deudas fuera de tus estados están en Préstamos.',
    caption: {
      paid: '{{amount}} pagado',
      paidOf: '{{paid}} pagado de {{price}}',
      ...plural('shares', '{{count}} acción', '{{count}} acciones'),
      asOf: 'Al {{date}}',
      vehicle: 'Costó {{price}} · pierde {{rate}} al año',
    },
    plan: {
      next: 'Próximo pago: {{amount}} el {{date}} · {{label}}',
      overdue: 'Vencido: {{amount}} desde el {{date}} · {{label}}',
      delivery: 'Contra entrega: {{amount}}, hacia {{date}}',
      deliveryUndated: 'Contra entrega: {{amount}}',
      done: 'Pagado por completo',
      missing:
        'Agrega su precio y su plan de pagos (las cuotas cada tantos meses hasta una fecha, y lo que falta en la entrega) para ver qué está pagado y qué falta.',
      add: 'Agregar plan de pagos',
    },
  },
} satisfies Translation<typeof en>;
