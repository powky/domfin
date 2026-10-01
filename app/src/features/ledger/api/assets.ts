import { useEffect, useSyncExternalStore } from 'react';

import type { Currency } from '@/lib/currency';
import { apiDelete, apiGet, apiSend } from '@/services/api/client';

import { refreshLedger } from './ledger';

/** A payment of a property's plan, in cents of the asset's currency. */
export type PlanPayment = { amount: number; date: string };

/** How a property is paid; what the payments before handover don't cover is paid on delivery. */
export type Plan = {
  /** Cents; zero while it isn't known. */
  price: number;
  reservation?: PlanPayment;
  downPayment?: PlanPayment;
  installments?: { amount: number; everyMonths: number; first: string; last: string };
  /** `YYYY-MM-DD` */
  delivery?: string;
};

export type Holding = {
  quantity: number;
  /** Cents per share, as of `priceDate`; without it, the shares are worth what they cost. */
  price?: number;
  priceDate?: string;
};

/** What a pension fund held at the end of a day, in cents of its currency. */
export type FundBalance = { date: string; amount: number };

/** A pension fund (an AFP) as its statements report it. */
export type Fund = {
  /** Oldest first; the fund is worth the latest by each day. */
  balances: FundBalance[];
};

/** What a vehicle cost the day it was bought, and the share of its value it loses every year (0.1 is 10%). */
export type Depreciation = { price: number; date: string; rate: number };

/**
 * A loan paid off in equal monthly installments from `first` to `last`, at
 * `rate` a year (0.05 is 5%), known to owe `balance` (cents) on `asOf`: for
 * one someone else pays, like an employer, that never goes through your
 * accounts.
 */
export type Schedule = { balance: number; asOf: string; rate: number; first: string; last: string };

/** A movement linked to an asset: as its account shows it, and in the asset's currency. */
export type AssetPayment = {
  movementId: string;
  accountId: string;
  date: string;
  description: string;
  /** Cents of the movement's currency, negative when it left the account. */
  amount: number;
  currency: Currency;
  /** Cents of the asset's currency, positive when paid in. */
  value: number;
  /** Linked by one of the asset's texts, not by hand. */
  auto: boolean;
};

/** Something no statement shows, from domfin-api's `GET /ledger/assets`. */
export type Asset = {
  id: string;
  kind: 'property' | 'shares' | 'debt' | 'pension' | 'vehicle';
  name: string;
  currency: Currency;
  /** Texts that link the movements whose description has one. */
  match: string[];
  property?: Plan;
  shares?: Holding;
  pension?: Fund;
  vehicle?: Depreciation;
  /** A debt's schedule, when what's owed follows its installments instead of linked movements. */
  schedule?: Schedule;
  /** With a schedule: what each installment pays of capital and interest (cents), and how many are left. */
  installment?: number;
  remaining?: number;
  /** Cents of its currency: what it's worth (a debt: what's owed) and what was paid into it (a debt: paid back). */
  value: number;
  paid: number;
  /** Oldest first. */
  payments: AssetPayment[];
};

export type AssetInput = Pick<
  Asset,
  'kind' | 'name' | 'currency' | 'match' | 'property' | 'shares' | 'pension' | 'vehicle' | 'schedule'
>;

type AssetsState = { status: 'loading' | 'ready' | 'offline'; assets: Asset[] };

let state: AssetsState = { status: 'loading', assets: [] };
let request: Promise<void> | null = null;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = () => state;

/** Asks domfin-api for the assets again. */
export function refreshAssets(): Promise<void> {
  request ??= apiGet<{ assets: Asset[] }>('/ledger/assets')
    .then(({ assets }) => {
      state = { status: 'ready', assets };
    })
    .catch(() => {
      state = { ...state, status: 'offline' };
    })
    .finally(() => {
      request = null;
      listeners.forEach((listener) => listener());
    });
  return request;
}

/** The assets, fetched when a screen that shows them opens. */
export function useAssets(): AssetsState {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    void refreshAssets();
  }, []);
  return current;
}

/**
 * What an asset change touches: its value, its payments and how they're
 * classified. The accounts refresh on their own when a screen shows them.
 */
async function refreshAll() {
  await Promise.all([refreshAssets(), refreshLedger()]);
}

/** Adds an asset, or changes one by its ID; returns its ID. */
export async function saveAsset(input: AssetInput, id?: string): Promise<string> {
  const saved = id
    ? await apiSend<{ id: string }>('PUT', `/ledger/assets/${encodeURIComponent(id)}`, input)
    : await apiSend<{ id: string }>('POST', '/ledger/assets', input);
  await refreshAll();
  return saved.id;
}

export async function deleteAsset(id: string): Promise<void> {
  await apiDelete(`/ledger/assets/${encodeURIComponent(id)}`);
  await refreshAll();
}

/** Links movements to an asset, or unlinks them (for good) with `null`. */
export async function linkToAsset(movementIds: readonly string[], assetId: string | null): Promise<void> {
  try {
    await apiSend('PUT', '/ledger/assets/links', { movementIds, assetId });
  } finally {
    await refreshAll();
  }
}
