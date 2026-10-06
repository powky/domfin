import type { Currency } from '@/lib/currency';

/** Where a movement counts: see domfin-api's docs/modelo-de-datos.md. */
export type Flow = 'income' | 'expense' | 'transfer';

/** An account of the ledger, as `GET /ledger/movements` lists it. */
export type LedgerAccount = {
  /** Stable, like "popular:credit_card:1234:DOP". */
  id: string;
  institution: string;
  /** `cash` is Efectivo, where cash spending is written down by hand: one in each currency of the accounts. */
  kind: 'savings' | 'checking' | 'credit_card' | 'loan' | 'certificate' | 'brokerage' | 'cash';
  /** The product ("Contigo"); loans and certificates carry a generic one. */
  name: string;
  last4: string;
  currency: Currency;
};

/** A classified movement of `GET /ledger/movements`. */
export type LedgerMovement = {
  /** Stable across re-imports. */
  id: string;
  accountId: string;
  /** `YYYY-MM-DD` */
  date: string;
  description: string;
  /** A card purchase's merchant, without the city. */
  merchant?: string;
  mcc?: string;
  /**
   * What the bank says it is for the account (`purchase`, `payment`,
   * `disbursement`…); `undetailed_cash` for what's left of a withdrawal that
   * the user didn't write down how they spent (Efectivo sin detallar).
   */
  kind?: string;
  /** Cents of the account's currency: positive comes into the account, negative goes out. */
  amount: number;
  currency: Currency;
  /**
   * The movement in pesos and in dollars, in cents, at the BCRD rate of its
   * date as the bank would change it that day (money in at the buy rate,
   * money out at the sell rate); missing without a rate for it.
   */
  amounts?: Partial<Record<Currency, number>>;
  flow: Flow;
  /** Null when nothing recognized it (Uncategorized). */
  categoryId: string | null;
  /** What decided its category: `manual` for the user's correction, then `asset`, `cash`, `rule`, `payroll`, `transfer`, `bank`, `merchant` or `default`. */
  by: string;
  /** Flagged for the user to check. */
  review: boolean;
  /** The other side of a transfer between two of the user's accounts. */
  pairId?: string;
  /**
   * A loan's movement: how much it moved the balance. Of a payment, what went
   * to capital (the rest was interest and charges); missing when the bank's
   * history doesn't tell, and for other accounts.
   */
  principal?: number;
  /** The asset it pays into (a home bought off-plan, shares), by its ID. */
  assetId?: string;
  /**
   * Added by hand (see `addMovement`): it stays until the statement that
   * brings it arrives, and `missing` when that statement came without it.
   */
  manual?: boolean;
  missing?: boolean;
  /** What the user wrote about it, also on the imported movement that took the place of one added by hand. */
  notes?: string;
  /** Left out of lists and totals unless asked for. */
  hidden?: boolean;
  /**
   * Who it's with, as domfin-api names it: a known merchant (`merchantId`),
   * a person or account, one of the bank's own operations (`operation`,
   * with the last digits of a card or account in `ref`), or what the bank
   * printed, cleaned up. Renaming `nameKey` renames all its movements.
   */
  name?: string;
  nameKey?: string;
  merchantId?: string;
  operation?: string;
  ref?: string;
};

export type LedgerGroup = { id: string; name: string; flow: Flow };

export type LedgerCategory = {
  id: string;
  name: string;
  flow: Flow;
  /** Group id. */
  group: string;
  system: boolean;
  archived: boolean;
};

export type LedgerState = {
  /** `offline` when domfin-api didn't answer; the last ledger it sent is kept. */
  status: 'loading' | 'ready' | 'offline';
  accounts: LedgerAccount[];
  /** Every movement of `LEDGER_MONTHS` but the hidden ones, newest first. */
  movements: LedgerMovement[];
  /** The hidden ones, newest first: screens leave them out, Transactions lists them when asked. */
  hidden: LedgerMovement[];
  groups: LedgerGroup[];
  categories: LedgerCategory[];
};
