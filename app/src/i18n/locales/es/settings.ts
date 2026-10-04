import type { settings as en } from '../en/settings';
import type { Translation } from '../types';

export const settings = {
  settings: {
    title: 'Configuración',
    language: {
      title: 'Idioma',
      description: 'Domfin usa el idioma de tu dispositivo, a menos que elijas otro aquí.',
      system: 'Sistema',
      systemHint: 'Según tu dispositivo: {{language}}.',
      savedHint: 'Se guarda en este dispositivo.',
    },
    appearance: {
      title: 'Apariencia',
      description: 'Domfin usa el modo claro u oscuro de tu dispositivo, a menos que elijas uno aquí.',
      system: 'Sistema',
      light: 'Claro',
      dark: 'Oscuro',
      systemLightHint: 'Según tu dispositivo: modo claro.',
      systemDarkHint: 'Según tu dispositivo: modo oscuro.',
      savedHint: 'Se guarda en este dispositivo.',
    },
    format: {
      title: 'Montos y fechas',
      description: 'Siguen el idioma que elijas y la región de tu dispositivo.',
      amount: 'Monto',
      date: 'Fecha',
      percent: 'Porcentaje',
    },
  },
} satisfies Translation<typeof en>;
