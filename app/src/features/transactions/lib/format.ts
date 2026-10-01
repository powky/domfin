import { formatDate } from '@/lib/dates';
import { decimalSeparator } from '@/lib/format';

/** "Sep 26, 2026" from "2026-09-26". */
export function formatDay(date: string) {
  return formatDate(date);
}

/**
 * A typed amount without its currency symbol or grouping, and "." before the
 * cents: "RD$1,760.29" → "1760.29", or "1.760,29" → "1760.29" where the
 * locale writes cents after a comma.
 */
export function toPlainDecimal(value: string) {
  const bare = value.replace(/(rd|us)?\$/gi, '');
  return decimalSeparator() === ',' ? bare.replace(/\./g, '').replace(',', '.') : bare.replace(/,/g, '');
}

/** Card descriptors often carry the payment processor ("Sq *Riverside Farmers Mkt"). */
const PROCESSOR_PREFIX = /^(sq|sqc|tst|pp|paypal|sp|pos)\s*\*\s*/i;

/** The letter that stands for a merchant in its avatar: the business, not the processor. */
export function merchantInitial(merchant: string) {
  const name = merchant.replace(PROCESSOR_PREFIX, '');
  return (name.match(/[a-z0-9]/i)?.[0] ?? '?').toUpperCase();
}
