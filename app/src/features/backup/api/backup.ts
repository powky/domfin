import { useCallback, useEffect, useState } from 'react';

import { ApiError, apiDelete, apiGet, apiSend } from '@/services/api/client';

import { backupErrorCodes, type BackupErrorCode, type BackupFile, type BackupPlace, type BackupStatus, type Unlock } from '../types';
import { markRestored } from './restored';

/** The code of a failed call: domfin-api's, or `offline` when it didn't answer. */
export function backupErrorOf(error: unknown): BackupErrorCode {
  if (!(error instanceof ApiError)) return 'offline';
  try {
    const { error: code } = JSON.parse(error.message) as { error?: string };
    const known = backupErrorCodes.find((candidate) => candidate === code);
    if (known) return known;
  } catch {
    // Not JSON: domfin-api failed some other way.
  }
  return 'backup_failed';
}

type State = { status: 'loading' | 'ready' | 'offline'; backup: BackupStatus | null };

/** How backups are going, and what turns them on, runs them and changes them. */
export function useBackup() {
  const [state, setState] = useState<State>({ status: 'loading', backup: null });
  const refresh = useCallback(
    () =>
      apiGet<BackupStatus>('/backup')
        .then((backup) => setState({ status: 'ready', backup }))
        .catch(() => setState((current) => ({ ...current, status: 'offline' }))),
    [],
  );
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    ...state,
    refresh,
    /** Turns backups on in folder; answers the recovery key, or '' when the folder's backups were adopted. */
    setup: async (folder: string, password: string) => {
      const { recoveryKey } = await apiSend<{ recoveryKey: string }>('POST', '/backup/setup', { folder, password });
      await refresh();
      return recoveryKey;
    },
    run: async () => {
      try {
        await apiSend<{ backup: BackupFile }>('POST', '/backup/run', {});
      } finally {
        // Even a failed backup changes the status: it says why.
        await refresh();
      }
    },
    update: (change: { automatic?: boolean; folder?: string }) =>
      apiSend<BackupStatus>('PUT', '/backup', change).then((backup) => setState({ status: 'ready', backup })),
    changePassword: (unlock: Unlock, newPassword: string) =>
      apiSend('PUT', '/backup/password', { ...unlock, newPassword }).then(refresh),
    disable: () => apiDelete('/backup').then(refresh),
  };
}

/** The cloud folders on the computer domfin-api runs on. */
export function useBackupPlaces() {
  const [places, setPlaces] = useState<BackupPlace[] | null>(null);
  useEffect(() => {
    let active = true;
    apiGet<{ places: BackupPlace[] }>('/backup/places')
      .then((answer) => active && setPlaces(answer.places))
      .catch(() => active && setPlaces([]));
    return () => {
      active = false;
    };
  }, []);
  return places;
}

/** The backups in a folder, newest first, and whether the key file is there. */
export function listBackups(folder: string) {
  return apiGet<{ backups: BackupFile[]; hasKey: boolean }>(`/backup/files?folder=${encodeURIComponent(folder)}`);
}

/** Replaces all of domfin-api's data with a backup's, then has the app read it again. */
export async function restoreBackup(folder: string, backup: BackupFile, unlock: Unlock) {
  const { safetyCopy } = await apiSend<{ safetyCopy: string }>('POST', '/backup/restore', {
    folder,
    file: backup.file,
    ...unlock,
  });
  await markRestored(backup.at, safetyCopy);
}
