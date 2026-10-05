import { useSyncExternalStore } from 'react';

import { refreshLiveAccounts } from '@/features/accounts';
import { refreshAssets, refreshLedger } from '@/features/ledger';
import { apiPostForm } from '@/services/api/client';

import { importErrorOf } from '../lib/errors';
import { statementForm } from '../lib/form';
import { canRetry, type QueuedStatement, type StatementFile, type StatementSource } from '../lib/queue';
import type { ImportResult } from '../types';

export type ImportQueue = {
  /** The PDFs of the last import, in the order they came. */
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
 * Imports PDFs, from the file picker or another app's share sheet. Added
 * while others are importing, they join them; otherwise they start a new list.
 */
export function importStatements(files: readonly StatementFile[], source: StatementSource) {
  if (files.length === 0) return;
  const added = files.map((file): QueuedStatement => ({ id: nextId++, file, source, state: 'waiting' }));
  update({ entries: queue.running ? [...queue.entries, ...added] : added });
  if (!queue.running) void run();
}

/** Tries again the PDFs that failed for a reason that can change: no connection, no password. */
export function retryFailed() {
  if (!queue.entries.some(canRetry)) return;
  update({
    entries: queue.entries.map((entry) =>
      canRetry(entry) ? { ...entry, state: 'waiting', result: undefined, error: undefined } : entry,
    ),
  });
  if (!queue.running) void run();
}

const nextWaiting = () => queue.entries.find((entry) => entry.state === 'waiting');

// One PDF per request: a share can bring many from different accounts, a
// big batch would pass domfin-api's 32 MB per upload, and each one shows
// how it went as soon as it's done.
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
      const result: ImportResult = results[0] ?? { file: entry.file.name, status: 'failed', reason: 'unreadable' };
      updateEntry(entry.id, { state: 'done', result });
      if (result.status === 'added' || result.status === 'replaced') {
        saved = true;
        update({ saved: queue.saved + 1 });
      }
    } catch (error) {
      updateEntry(entry.id, { state: 'error', error: importErrorOf(error) });
    }
  }
  update({ running: false });
  // New statements bring accounts, balances, movements and payments to what you own.
  if (saved) void Promise.all([refreshLiveAccounts(), refreshLedger(), refreshAssets()]);
}
