import type { phone as en } from '../en/phone';
import type { Translation } from '../types';

export const phone = {
  common: {
    data: {
      offline: 'No se pudieron cargar tus datos. Cierra la app y vuelve a abrirla.',
    },
  },
  currency: {
    rate: {
      status: {
        offline: 'Domfin no pudo leer la tasa; esta es la última conocida.',
      },
    },
  },
  transactions: {
    rule: {
      failed: 'No se pudo crear la regla. Vuelve a intentarlo.',
    },
    selection: {
      categorizeFailed: 'No se pudo guardar la categoría. Vuelve a intentarlo.',
    },
  },
  accounts: {
    live: {
      offline: 'No se pudieron cargar tus datos. Cierra la app y vuelve a abrirla.',
    },
  },
  loans: {
    plan: {
      failed: 'No se pudo guardar. Vuelve a intentarlo.',
    },
  },
  imports: {
    password: {
      messages: {
        failed: 'No se pudo guardar. Vuelve a intentarlo.',
      },
      privacy: 'Se guarda en este dispositivo, con tus datos de Domfin. Domfin nunca la muestra ni la envía a ningún lado.',
    },
    subtitle: 'PDF del banco, revisados y guardados en este dispositivo',
    errors: {
      offline: 'Algo salió mal. Cierra la app y vuelve a abrirla.',
      unavailable: 'Domfin no pudo abrir tus datos. Cierra la app y vuelve a abrirla.',
    },
  },
  classification: {
    offline: 'No se pudieron cargar tus datos. Cierra la app y vuelve a abrirla.',
    saveFailed: 'No se pudo guardar. Vuelve a intentarlo.',
  },
  salary: {
    failed: 'No se pudo guardar. Vuelve a intentarlo.',
  },
  assets: {
    form: {
      failed: 'No se pudo guardar. Vuelve a intentarlo.',
    },
    link: {
      failed: 'No se pudieron vincular. Vuelve a intentarlo.',
    },
  },
  updates: {
    api: 'Motor',
    howTo: 'Para actualizar, baja la versión nueva (git pull) en tu computadora y vuelve a instalar la app, como dice el README.',
  },
  backup: {
    where: {
      otherHint: 'La ruta completa de una carpeta en este dispositivo.',
      none: 'En el teléfono, Domfin todavía no puede guardar respaldos en iCloud Drive, Google Drive, Dropbox ni OneDrive: eso llega en una próxima versión.',
    },
    restore: {
      warning:
        'Restaurar reemplaza todos tus datos por los del respaldo. Antes, Domfin guarda una copia de tus datos actuales en este dispositivo.',
    },
    errors: {
      store_unavailable: 'Domfin no pudo abrir tus datos. Cierra la app y vuelve a abrirla.',
      backup_failed: 'Algo salió mal. Vuelve a intentarlo.',
      offline: 'Algo salió mal. Cierra la app y vuelve a abrirla.',
    },
  },
} satisfies Translation<typeof en>;
