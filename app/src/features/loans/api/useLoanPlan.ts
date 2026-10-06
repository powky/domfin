import { useMemo } from 'react';

// Not the feature's index: its screens show this plan, and that would import them back.
import { isAsset, useLiveAccounts, type LiveAccount } from '@/features/accounts/api/liveAccounts';
import { useAssets, useLedger, type Asset, type AssetPayment } from '@/features/ledger';
import type { LedgerMovement } from '@/features/ledger/types';
import { today } from '@/lib/dates';

import {
  addMonths,
  loanHistory,
  nextInstallment,
  paidShare,
  payoff,
  type LoanHistory,
  type LoanTerms,
  type Payoff,
} from '../lib/payoff';
import { useLoanPlans, type LoanPlans } from './plans';

/** A loan with what's known of it: in cents of its currency. */
export type LoanPlan = {
  accountId: string;
  /**
   * Its terms: the ones the user gave (`set`), or a debt's installment
   * schedule (`schedule`), which someone else pays.
   */
  terms?: LoanTerms;
  source?: 'set' | 'schedule';
  /** Owed now. */
  balance: number;
  history: LoanHistory;
  /** The month of its next installment, `YYYY-MM`. */
  first: string;
  /** How it ends, with its terms. */
  payoff?: Payoff;
  /** Of the capital, the share already paid, 0 to 1, when it can be told. */
  progress?: number;
};

const NO_HISTORY: LoanHistory = { disbursed: 0, paid: 0, principalPaid: 0, interestPaid: 0 };

/**
 * What a debt outside the bank has lent and been paid: money that came into
 * your account from it was lent, what left your account paid it. Nobody
 * splits its payments into capital and interest.
 */
function debtHistory(payments: readonly AssetPayment[]): LoanHistory {
  const history = { ...NO_HISTORY };
  for (const payment of payments) {
    const value = Math.abs(payment.value);
    if (payment.amount > 0) {
      history.disbursed += value;
      continue;
    }
    history.paid += value;
    if (!history.lastPayment || payment.date > history.lastPayment.date) {
      history.lastPayment = { date: payment.date, amount: value };
    }
  }
  return history;
}

/**
 * A loan's plan: a bank loan's from its history and the terms the user gave
 * it, a debt's from its linked payments, or from its installment schedule
 * when someone else pays it.
 */
export function planOf(
  account: LiveAccount,
  movements: readonly LedgerMovement[],
  assets: readonly Asset[],
  plans: LoanPlans,
  day: string,
): LoanPlan {
  const asset = isAsset(account) ? assets.find((item) => `asset:${item.id}` === account.id) : undefined;
  if (asset?.schedule && asset.installment) {
    // Paid by its installments up to the last one, all by someone else.
    const terms = { rate: asset.schedule.rate, installment: asset.installment, subsidy: asset.installment };
    const first = addMonths(asset.schedule.last.slice(0, 7), 1 - Math.max(asset.remaining ?? 0, 1));
    return {
      accountId: account.id,
      terms,
      source: 'schedule',
      balance: asset.value,
      history: NO_HISTORY,
      first,
      payoff: payoff(asset.value, terms, first),
    };
  }
  const history = asset
    ? debtHistory(asset.payments)
    : loanHistory(movements.filter((movement) => movement.accountId === account.id));
  const balance = asset ? asset.value : account.balance;
  const first = nextInstallment(asset ? day : account.asOf, history.lastPayment?.date);
  const terms = plans[account.id];
  return {
    accountId: account.id,
    terms,
    source: terms ? 'set' : undefined,
    balance,
    history,
    first,
    payoff: terms ? payoff(balance, terms, first) : undefined,
    progress: paidShare(balance, history),
  };
}

/**
 * Every loan's plan, by its account's ID. `ready` once the accounts, their
 * movements and the terms have all loaded: before that a plan could show
 * the form for terms it already has, or miss the latest payment.
 */
export function useLoanPlansByAccount() {
  const live = useLiveAccounts();
  const ledger = useLedger();
  const { assets } = useAssets();
  const { plans, status: plansStatus } = useLoanPlans();
  const statuses = [live.status, ledger.status, plansStatus];
  const status = statuses.every((each) => each === 'ready')
    ? 'ready'
    : statuses.includes('offline')
      ? 'offline'
      : 'loading';
  const byAccount = useMemo(() => {
    const day = today();
    return new Map(
      live.accounts
        .filter((account) => account.kind === 'loan')
        .map((account) => [account.id, planOf(account, ledger.movements, assets, plans, day)]),
    );
  }, [live.accounts, ledger.movements, assets, plans]);
  return { byAccount, status };
}

/** One loan's plan, for its account's page. */
export function useLoanPlan(accountId: string) {
  const { byAccount, status } = useLoanPlansByAccount();
  return { plan: byAccount.get(accountId), status };
}
