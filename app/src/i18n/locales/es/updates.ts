import type { updates as en } from '../en/updates';
import type { Translation } from '../types';

export const updates = {
  updates: {
    title: 'Acerca de Domfin',
    app: 'App',
    api: 'domfin-api',
    running: 'Versión {{version}}',
    unknown: 'Versión desconocida',
    newer: 'Ya salió la versión {{version}}',
    notes: 'Novedades',
    notice: 'Hay una versión nueva',
    release: 'Domfin {{version}}',
    upToDate: 'Tienes la última versión.',
    howTo: 'Para actualizar, baja la versión nueva (git pull) y sigue los pasos del README.',
    privacy: 'Domfin revisa los releases en GitHub como mucho dos veces al día, y solo pregunta por su propio repositorio.',
  },
} satisfies Translation<typeof en>;
