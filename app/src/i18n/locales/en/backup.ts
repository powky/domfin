/** Encrypted backups in a cloud folder (Settings). */
export const backup = {
  backup: {
    title: 'Backups',
    description:
      'Keep an encrypted copy of your data in your cloud folder: iCloud Drive, Google Drive, Dropbox or OneDrive. Only your backup password or your recovery key open it: neither the service nor Domfin can read it.',
    privacy:
      'Encrypted with age, an open format, to a post-quantum key. Domfin never sees your password, and you can open your backups without Domfin, with the age tool.',
    loading: 'Loading backups…',
    turnOn: 'Turn on backups',
    restoreOne: 'Restore a backup',
    cancel: 'Cancel',
    /** Brand names: they stay as they are in every language. */
    services: {
      icloud: 'iCloud Drive',
      'google-drive': 'Google Drive',
      dropbox: 'Dropbox',
      onedrive: 'OneDrive',
    },
    /** `service`: "OneDrive", `account`: "Personal". */
    serviceAccount: '{{service}} ({{account}})',
    where: {
      label: 'Where',
      other: 'Another folder',
      otherHint: 'The full path of a folder on this computer, like one on an external drive.',
      otherPlaceholder: 'Folder path',
      hasBackups: 'Already has Domfin backups',
      none: "Domfin didn't find iCloud Drive, Google Drive, Dropbox or OneDrive on this computer. Install the service's desktop app, or pick another folder.",
    },
    password: {
      label: 'Backup password',
      existing: 'Those backups’ password',
      existingHint: 'The one you made them with: Domfin keeps using them.',
      repeat: 'Repeat it',
      hint: 'At least 10 characters. A phrase of a few words is easy to remember and hard to guess. Domfin doesn’t keep it.',
    },
    recovery: {
      title: 'Your recovery key',
      body: 'If you forget your password, this key is the only way to open your backups. Keep it in your password manager or print it: Domfin won’t show it again.',
      copy: 'Copy',
      copied: 'Copied',
      saved: 'I saved it somewhere safe',
      done: 'Done',
      label: 'Recovery key',
      placeholder: 'AGE-SECRET-KEY-PQ-1…',
    },
    status: {
      /** `place`: "iCloud Drive". */
      in: 'In {{place}}',
      inFolder: 'In {{folder}}',
      /** `date`: "Oct 1, 2026, 9:30 AM", `size`: "66 KB". */
      last: 'Last backup: {{date}} · {{size}}',
      never: 'No backups yet.',
      /** `reason`: one of the errors below. */
      failed: 'The last backup failed. {{reason}}',
      unavailable: "Domfin can't find the backup folder. Did you sign out of your cloud service or unplug a drive?",
      count_one: '{{count}} backup in the folder',
      count_other: '{{count}} backups in the folder',
      automatic: 'Back up automatically: every day and after each import',
      needsPassword: 'Choose a backup password: you restored with the recovery key, and no password opens these backups yet.',
    },
    actions: {
      run: 'Back up now',
      restore: 'Restore…',
      password: 'Change password',
      choosePassword: 'Choose a password',
      disable: 'Turn off',
      disableConfirm: 'Turn off backups? The ones you made stay in the folder.',
    },
    messages: {
      ran: 'Done: your data is backed up.',
      adopted: 'Done: Domfin keeps using that folder’s backups.',
      enabled: 'Backups are on.',
      passwordChanged: 'Done: your backups now open with the new password.',
      /** `date`: when the backup was made; `path`: where the data from before was kept. */
      restored: 'You restored the backup from {{date}}. Your data from before is at {{path}}.',
      disabled: 'Backups are off. The ones you made stay in the folder.',
    },
    restore: {
      from: 'From',
      current: 'Your backup folder',
      search: 'Look for backups',
      loading: 'Looking for backups…',
      empty: 'That folder has no Domfin backups.',
      noKey: 'That folder doesn’t have the backups’ key (domfin-clave.age): open them with your recovery key.',
      pick: 'Backup',
      /** `date`, `size`. */
      option: '{{date}} · {{size}}',
      unlock: 'Open with',
      withPassword: 'Password',
      withRecoveryKey: 'Recovery key',
      warning:
        'Restoring replaces all your data with the backup’s. First, Domfin keeps a copy of your current data on this computer.',
      confirm: 'Restore this backup',
    },
    changePassword: {
      title: 'Change backup password',
      withCurrent: 'Current password',
      current: 'Current password',
      newPassword: 'New password',
      save: 'Save password',
    },
    size: {
      kb: '{{size}} KB',
      mb: '{{size}} MB',
    },
    errors: {
      not_configured: 'Backups are off.',
      bad_folder: 'Write the folder’s full path.',
      folder_missing: "Domfin can't find the folder. Did you sign out of your cloud service or unplug a drive?",
      short_password: 'The password needs at least 10 characters.',
      mismatch: "The passwords don't match.",
      wrong_password: "That password doesn't open these backups.",
      wrong_key: "That key doesn't open this backup.",
      bad_recovery_key: 'That isn’t a recovery key: it starts with AGE-SECRET-KEY-PQ-1.',
      no_key: 'That folder doesn’t have the backups’ key: open them with your recovery key.',
      other_key: 'That folder already has Domfin backups with another key. Turn on backups there with their password.',
      bad_file: "Domfin can't find that backup.",
      damaged: 'That backup is damaged or was changed, so Domfin won’t use it.',
      newer_version: 'That backup comes from a newer Domfin. Update Domfin first.',
      store_unavailable: "domfin-api couldn't open its database.",
      backup_failed: 'Something went wrong. The domfin-api terminal says what.',
      offline: "Couldn't reach domfin-api. Is it running?",
    },
  },
};
