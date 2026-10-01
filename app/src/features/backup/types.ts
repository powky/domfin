/** A cloud service whose desktop app keeps a folder in sync. */
export type BackupService = 'icloud' | 'google-drive' | 'dropbox' | 'onedrive';

/** A cloud folder on the computer domfin-api runs on (`GET /backup/places`). */
export type BackupPlace = {
  service: BackupService;
  /** Tells two accounts of the same service apart, when the folder says it. */
  account?: string;
  /** The service's folder, and Domfin's inside it. */
  root: string;
  folder: string;
  hasBackups: boolean;
};

export type BackupFile = { file: string; at: string; bytes: number };

export type BackupRun = { at: string; file?: string; bytes?: number; error?: BackupErrorCode };

/** How backups are going (`GET /backup`). */
export type BackupStatus = {
  configured: boolean;
  folder?: string;
  place?: BackupPlace;
  automatic: boolean;
  /** Restored with the recovery key from a folder without the key file: no password opens the backups yet. */
  needsPassword: boolean;
  /** Whether the folder is there now. */
  available: boolean;
  last?: BackupRun;
  backups: BackupFile[];
};

/** domfin-api's error codes for backups, and `offline` when it doesn't answer. */
export const backupErrorCodes = [
  'not_configured',
  'bad_folder',
  'folder_missing',
  'short_password',
  'wrong_password',
  'wrong_key',
  'bad_recovery_key',
  'no_key',
  'other_key',
  'bad_file',
  'damaged',
  'newer_version',
  'store_unavailable',
  'backup_failed',
  'offline',
] as const;

export type BackupErrorCode = (typeof backupErrorCodes)[number];

/** How a backup is opened: the password, through the key file next to it, or the recovery key. */
export type Unlock = { password: string } | { recoveryKey: string };
