import type { common as en } from '../en/common';
import { plural, type Translation } from '../types';

export const common = {
  common: {
    clear: 'Borrar',
    clearSearch: 'Borrar búsqueda',
    closeMenu: 'Cerrar menú',
    and: 'y',
    comingSoon: {
      title: 'Próximamente',
      body: 'Construiremos esta sección cuando la definamos.',
    },
    data: {
      loading: 'Cargando tus estados de cuenta…',
      offline: 'No se pudo conectar con domfin-api. ¿Está corriendo?',
      empty: 'No hay nada en este periodo. Importa tus estados de cuenta para verlo aquí.',
    },
  },
  privacy: {
    hide: 'Ocultar montos',
    show: 'Mostrar montos',
  },
  nav: {
    transactions: 'Transacciones',
    'cash-flow': 'Flujo de caja',
    spending: 'Gastos',
    budget: 'Presupuesto',
    'net-worth': 'Patrimonio neto',
    accounts: 'Cuentas',
    possessions: 'Posesiones',
    loans: 'Préstamos',
    uncategorized: 'Sin categoría',
    imports: 'Importar estados',
    more: 'Más',
    settings: 'Configuración',
  },
  // "Transacciones" doesn't fit a fifth of a phone's width.
  tabs: {
    transactions: 'Movimientos',
    'cash-flow': 'Flujo de caja',
    spending: 'Gastos',
    budget: 'Presupuesto',
    more: 'Más',
  },
  period: {
    label: 'Período',
    previous: 'Período anterior',
    next: 'Período siguiente',
    presets: {
      ytd: 'Año en curso',
      last6: 'Últimos 6 meses',
      last3: 'Últimos 3 meses',
      month: 'Este mes',
    },
    latestStatement: 'De tus estados importados · el último es del {{date}}',
    noStatements: 'Aún no has importado estados de cuenta',
  },
  accountTypes: {
    cash: 'Efectivo',
    investment: 'Inversiones',
    retirement: 'Pensiones',
    'real-estate': 'Inmuebles',
    vehicle: 'Vehículos',
    'credit-card': 'Tarjetas de crédito',
    loan: 'Préstamos',
  },
  categories: {
    uncategorized: 'Sin categoría',
    split: 'Dividida',
  },
  duration: {
    ...plural('years', '{{count}} año', '{{count}} años'),
    ...plural('months', '{{count}} mes', '{{count}} meses'),
    yearsAndMonths: '{{years}} y {{months}}',
  },
  format: {
    thousands: '{{value}} k',
    millions: '{{value}} M',
  },
} satisfies Translation<typeof en>;
