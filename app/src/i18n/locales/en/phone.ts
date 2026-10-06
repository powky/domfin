import type { Overrides } from '../types';
import type { Dictionary } from './index';

/**
 * What the iOS and Android app says differently. Domfin runs inside it
 * (modules/domfin-engine): there's no domfin-api to start, and the data
 * stays on the device. When its engine stops answering, closing and opening
 * the app starts it again.
 */
export const phone = {
  common: {
    data: {
      offline: "Couldn't load your data. Close the app and open it again.",
    },
  },
  currency: {
    rate: {
      status: {
        offline: "Domfin couldn't read the rate, so this is the last one known.",
      },
    },
  },
  transactions: {
    rule: {
      failed: "Couldn't create the rule. Try again.",
    },
    selection: {
      categorizeFailed: "Couldn't save the category. Try again.",
    },
  },
  accounts: {
    live: {
      offline: "Couldn't load your data. Close the app and open it again.",
    },
  },
  loans: {
    plan: {
      failed: "Couldn't save it. Try again.",
    },
  },
  imports: {
    password: {
      messages: {
        failed: 'Couldn’t save it. Try again.',
      },
      privacy: 'It’s kept on this device, with your Domfin data. Domfin never shows it nor sends it anywhere.',
    },
    subtitle: 'Bank PDFs, checked and saved on this device',
    errors: {
      offline: 'Something went wrong. Close the app and open it again.',
      unavailable: "Domfin couldn't open your data. Close the app and open it again.",
    },
  },
  classification: {
    offline: "Couldn't load your data. Close the app and open it again.",
    saveFailed: "Couldn't save. Try again.",
  },
  assets: {
    form: {
      failed: "Couldn't save. Try again.",
    },
    link: {
      failed: "Couldn't link them. Try again.",
    },
  },
  updates: {
    /** The engine's version: built into the app, from the same code as domfin-api. */
    api: 'Engine',
    /** Until the app is in the stores, it's installed by building it on a computer. */
    howTo: 'To update, pull the new version (git pull) on your computer and install the app again, as the README says.',
  },
  backup: {
    where: {
      otherHint: 'The full path of a folder on this device.',
      /** Backups from the phone are on the roadmap. */
      none: "On the phone, Domfin can't save backups to iCloud Drive, Google Drive, Dropbox or OneDrive yet: that's coming in a later version.",
    },
    restore: {
      warning: 'Restoring replaces all your data with the backup’s. First, Domfin keeps a copy of your current data on this device.',
    },
    errors: {
      store_unavailable: "Domfin couldn't open your data. Close the app and open it again.",
      backup_failed: 'Something went wrong. Try again.',
      offline: 'Something went wrong. Close the app and open it again.',
    },
  },
} satisfies Overrides<Dictionary>;
