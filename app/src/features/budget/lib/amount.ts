import { decimalSeparator } from '@/lib/format';

/** "RD$2,450.00" → 245000 cents ("2.450,00" where cents follow a comma); NaN when it isn't an amount. */
export function parseCents(text: string) {
  const bare = text.replace(/(rd|us)?\$/gi, '').replace(/\s/g, '');
  const plain = decimalSeparator() === ',' ? bare.replace(/\./g, '').replace(',', '.') : bare.replace(/,/g, '');
  const value = plain === '' ? NaN : Number(plain);
  return Number.isFinite(value) ? Math.round(value * 100) : NaN;
}

/** Cents as the user types them back: "2450.00", or "2450,00" where cents follow a comma. */
export const toInput = (cents: number) => (cents / 100).toFixed(2).replace('.', decimalSeparator());
