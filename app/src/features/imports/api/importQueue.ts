import { useSyncExternalStore } from 'react';

import { refreshLiveAccounts } from '@/features/accounts';
import { refreshAssets, refreshLedger } from '@/features/ledger';
import { refreshPayslips } from '@/features/salary';
import { apiPostForm } from '@/services/api/client';

import { importErrorOf } from '../lib/errors';
import { statementForm } from '../lib/form';
import { canRetry, type QueuedStatement, type StatementFile, type StatementSource } from '../lib/queue';
import type { ImportResult } from '../types';

export type ImportQueue = {
  /** The files of the last import, PDFs or zips, in the order they came. */
  entries: QueuedStatement[];
  running: boolean;
  /** How many PDFs saved something since the app opened: screens reload what they show when it changes. */
  saved: number;
};

let queue: ImportQueue = { entries: [], running: false, saved: 0 };
let nextId = 1;
const listeners = new Set<() => void>();

function update(change: Partial<ImportQueue>) {
  queue = { ...queue, ...change };
  listeners.forEach((listener) => listener());
}

function updateEntry(id: number, change: Partial<QueuedStatement>) {
  update({ entries: queue.entries.map((entry) => (entry.id === id ? { ...entry, ...change } : entry)) });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => queue;

/** The import queue, shared by the whole app: imports go on while you look at another screen. */
export function useImportQueue() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Imports PDFs and zips of them, from the file picker or another app's
 * share sheet. Added while others are importing, they join them; otherwise
 * they start a new list.
 */
export function importStatements(files: readonly StatementFile[], source: StatementSource) {
  if (files.length === 0) return;
  const added = files.map((file): QueuedStatement => ({ id: nextId++, file, source, state: 'waiting' }));
  update({ entries: queue.running ? [...queue.entries, ...added] : added });
  if (!queue.running) void run();
}

/**
 * Tries again the files that failed for a reason that can change: no
 * connection, no password. A zip goes again whole: what it already brought
 * comes back unchanged.
 */
export function retryFailed() {
  if (!queue.entries.some(canRetry)) return;
  update({
    entries: queue.entries.map((entry) =>
      canRetry(entry) ? { ...entry, state: 'waiting', results: undefined, error: undefined } : entry,
    ),
  });
  if (!queue.running) void run();
}

const nextWaiting = () => queue.entries.find((entry) => entry.state === 'waiting');

// One file per request: a share can bring many from different accounts, a
// big batch would pass domfin-api's 128 MB per upload, and each one shows
// how it went as soon as it's done. A zip answers for each PDF inside it.
async function run() {
  update({ running: true });
  let saved = false;
  for (let entry = nextWaiting(); entry; entry = nextWaiting()) {
    updateEntry(entry.id, { state: 'importing' });
    try {
      const { results } = await apiPostForm<{ results: ImportResult[] }>(
        '/statements/import',
        statementForm([entry.file]),
      );
      const answered: ImportResult[] =
        results.length > 0 ? results : [{ file: entry.file.name, status: 'failed', reason: 'unreadable' }];
      updateEntry(entry.id, { state: 'done', results: answered });
      const added = answered.filter((result) => result.status === 'added' || result.status === 'replaced').length;
      if (added > 0) {
        saved = true;
        update({ saved: queue.saved + added });
      }
    } catch (error) {
      updateEntry(entry.id, { state: 'error', error: importErrorOf(error) });
    }
  }
  update({ running: false });
  // New statements bring accounts, balances, movements and payments to what you own.
  if (saved) void Promise.all([refreshLiveAccounts(), refreshLedger(), refreshAssets(), refreshPayslips()]);
}
