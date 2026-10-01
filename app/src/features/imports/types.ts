import type { Currency } from '@/lib/currency';

/**
 * domfin-api's answers about imported statements (`POST /statements/import`
 * and `GET /statements/coverage`). Dates are `YYYY-MM-DD`, months `YYYY-MM`.
 */

export type StatementAccountKind = 'savings' | 'checking' | 'credit_card' | 'loan' | 'certificate';

/** A bank account or card (named after its product), or a loan or certificate (named by their last digits). */
export type StatementAccount = {
  kind: StatementAccountKind;
  institution: string;
  /** The product, like "Contigo" or "Ahorro Empleado"; loan and certificate histories print none. */
  name?: string;
  brand?: string;
  product?: string;
  last4: string;
  /** A bank account's or loan's currency; a card has one per section. */
  currency?: Currency;
};

export type StatementSection = { currency: Currency; transactions: number };

export type ImportStatus = 'added' | 'replaced' | 'unchanged' | 'skipped' | 'failed';

export type ImportReason = 'unsupported' | 'missing_password' | 'wrong_password' | 'unreadable' | 'not_saved';

/** What importing one PDF did. */
export type ImportResult = {
  file: string;
  status: ImportStatus;
  reason?: ImportReason;
  /** The error when a file couldn't be read or saved. */
  detail?: string;
  /** For statements: the account, the cut date (bank accounts and cards) or the day a history (loans, certificates) was generated. */
  account?: StatementAccount;
  date?: string;
  /** A history's first movement. */
  from?: string;
  sections?: StatementSection[];
  /** What didn't add up, in Spanish as domfin-api writes it. */
  issues?: string[];
};

export type MonthStatus = 'ok' | 'review' | 'missing';

export type CoverageMonth = {
  month: string;
  status: MonthStatus;
  /** The statement's cut date, or the date of the history that covers the month. */
  date?: string;
  sections?: StatementSection[];
  issues?: string[];
};

/** An account's months from its first imported statement to its last. */
export type AccountCoverage = {
  account: StatementAccount;
  months: CoverageMonth[];
};

/** Why an upload or the list of months failed as a whole. */
export type ImportError = 'offline' | 'local_only' | 'too_large' | 'unavailable' | 'failed';
