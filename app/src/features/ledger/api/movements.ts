import { apiDelete, apiSend } from '@/services/api/client';

import { patchMovements, refreshLedger } from './ledger';

/** A movement to add by hand, in one of the ledger's accounts and its currency. */
export type NewMovement = {
  accountId: string;
  /** `YYYY-MM-DD` */
  date: string;
  description: string;
  /** Cents: positive comes into the account, negative goes out. */
  amount: number;
  /** `null` leaves it to the rules, like an imported movement. */
  categoryId: string | null;
  notes?: string;
};

/**
 * Adds a movement by hand. domfin-api keeps it until the statement that
 * brings it arrives, which takes its place with its category and notes.
 */
export async function addMovement(movement: NewMovement): Promise<void> {
  try {
    await apiSend('POST', '/ledger/movements', movement);
  } finally {
    await refreshLedger();
  }
}

/** Removes movements added by hand; imported ones can only be hidden. */
export async function deleteMovements(ids: readonly string[]): Promise<void> {
  try {
    for (const id of ids) await apiDelete(`/ledger/movements/${encodeURIComponent(id)}`);
  } finally {
    await refreshLedger();
  }
}

/**
 * Names a merchant, person or account (a movement's `nameKey`) for all its
 * movements; an empty name gives it back the one Domfin gives it.
 */
export async function renameMerchant(key: string, name: string): Promise<void> {
  try {
    await apiSend('PUT', '/ledger/names', { key, name });
  } finally {
    await refreshLedger();
  }
}

/** Marks movements reviewed, or hidden or not: on this device right away, and in domfin-api. */
export async function markMovements(
  ids: readonly string[],
  marks: { reviewed: true } | { hidden: boolean },
): Promise<void> {
  patchMovements(new Set(ids), 'reviewed' in marks ? { review: false } : { hidden: marks.hidden });
  try {
    await apiSend('PUT', '/ledger/marks', { movementIds: ids, ...marks });
  } finally {
    await refreshLedger();
  }
}
