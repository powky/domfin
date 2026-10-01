import { useCallback, useEffect, useState } from 'react';

import { apiGet } from '@/services/api/client';

import { importErrorOf } from '../lib/errors';
import type { AccountCoverage, ImportError } from '../types';

export type CoverageState = {
  status: 'loading' | 'ready' | 'error';
  /** Kept while reloading, so the list doesn't blink. */
  accounts: AccountCoverage[];
  error?: ImportError;
};

/** Each account's imported months, from domfin-api. `refresh` asks again (after an import). */
export function useStatementCoverage() {
  const [state, setState] = useState<CoverageState>({ status: 'loading', accounts: [] });

  const refresh = useCallback(async () => {
    setState((current) => ({ status: 'loading', accounts: current.accounts }));
    try {
      const { accounts } = await apiGet<{ accounts: AccountCoverage[] }>('/statements/coverage');
      setState({ status: 'ready', accounts });
    } catch (error) {
      setState((current) => ({ status: 'error', accounts: current.accounts, error: importErrorOf(error) }));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...state, refresh };
}
