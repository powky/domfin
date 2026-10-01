import { useCallback, useEffect, useState } from 'react';

import { apiGet, apiSend } from '@/services/api/client';

import { refreshLedger } from './ledger';

/**
 * Files movements under a category, whatever the rules say: domfin-api keeps
 * the correction by movement, so it survives reimporting its statement.
 * `null` gives the movements back to the automatic classification.
 */
export async function setCategory(movementIds: readonly string[], categoryId: string | null): Promise<void> {
  try {
    for (const movementId of movementIds) {
      await apiSend('PUT', '/ledger/classifications', { movementId, categoryId });
    }
  } finally {
    await refreshLedger();
  }
}

/** When a payroll credit is Salario, as domfin-api's `GET /ledger/payroll` has it. */
export type Payroll = {
  /** The payroll account; empty looks at every account. */
  accountId: string;
  /** Text that marks a payroll credit ("nomina"), without minding case or accents. */
  keyword: string;
  /** Days of the month salary comes in. */
  days: number[];
  /** How many days before or after a payday still count as it. */
  daysBefore: number;
  daysAfter: number;
};

/** A rule of domfin-api's `GET /ledger/rules`: every condition set must hold. */
export type Rule = {
  id?: string;
  name: string;
  accounts?: string[];
  direction?: 'in' | 'out';
  currency?: string;
  /** Any of these texts, without minding case or accents. */
  contains?: string[];
  mccs?: string[];
  /** Unsigned cents. */
  minAmount?: number;
  maxAmount?: number;
  months?: number[];
  categoryId: string;
  review: boolean;
};

type Loaded<T> = { status: 'loading' | 'ready' | 'offline'; value: T | null };

/** Where one of the ledger's settings lives, and how it reads and writes. */
type Setting<T> = { path: string; read: (body: unknown) => T; write: (value: T) => unknown };

const payrollSetting: Setting<Payroll> = {
  path: '/ledger/payroll',
  read: (body) => body as Payroll,
  write: (payroll) => payroll,
};

const rulesSetting: Setting<Rule[]> = {
  path: '/ledger/rules',
  read: (body) => (body as { rules: Rule[] }).rules,
  write: (rules) => ({ rules }),
};

/** Reads one of the ledger's settings and saves it back, refreshing the ledger. */
function useLedgerSetting<T>(setting: Setting<T>) {
  const [loaded, setLoaded] = useState<Loaded<T>>({ status: 'loading', value: null });
  useEffect(() => {
    let current = true;
    apiGet<unknown>(setting.path)
      .then((body) => {
        if (current) setLoaded({ status: 'ready', value: setting.read(body) });
      })
      .catch(() => {
        if (current) setLoaded({ status: 'offline', value: null });
      });
    return () => {
      current = false;
    };
  }, [setting]);
  const save = useCallback(
    async (value: T) => {
      const saved = setting.read(await apiSend<unknown>('PUT', setting.path, setting.write(value)));
      setLoaded({ status: 'ready', value: saved });
      await refreshLedger();
      return saved;
    },
    [setting],
  );
  return { ...loaded, save };
}

/** The payroll settings, and saving them. */
export const usePayroll = () => useLedgerSetting(payrollSetting);

/** The user's rules in order, and saving them all. */
export const useRules = () => useLedgerSetting(rulesSetting);
