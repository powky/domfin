import { useSyncExternalStore } from 'react';

import { refreshLiveAccounts } from '@/features/accounts';
import { refreshBudget } from '@/features/budget';
import { refreshAssets, refreshLedger } from '@/features/ledger';
import { refreshLoanPlans } from '@/features/loans';

/** The last restore in this session: when its backup was made and where the data before it was kept. */
export type Restored = { epoch: number; backupAt?: string; safetyCopy?: string };

let restored: Restored = { epoch: 0 };
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The last restore. `epoch` counts them: screens that read their data once
 * (Settings' cards) remount with it to read it again.
 */
export function useRestored() {
  return useSyncExternalStore(
    subscribe,
    () => restored,
    () => restored,
  );
}

/** After a restore, everything domfin-api has is different: read it all again. */
export async function markRestored(backupAt: string, safetyCopy: string) {
  restored = { epoch: restored.epoch + 1, backupAt, safetyCopy };
  listeners.forEach((listener) => listener());
  await Promise.all([refreshLedger(), refreshAssets(), refreshLiveAccounts(), refreshBudget(), refreshLoanPlans()]);
}
