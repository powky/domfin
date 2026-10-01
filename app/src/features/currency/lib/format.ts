import { getFormatLocale } from '@/i18n';
import { currencySymbols } from '@/lib/currency';
import { formatNumber } from '@/lib/format';

const fourDecimals: Intl.NumberFormatOptions = { minimumFractionDigits: 4, maximumFractionDigits: 4 };

/** "RD$59.2669": pesos per dollar, with the 4 decimals the BCRD publishes. */
export const formatRate = (pesosPerDollar: number) =>
  `${currencySymbols.DOP}${formatNumber(pesosPerDollar, fourDecimals)}`;

/** "US$1 = RD$59.41": the rate in a few characters. */
export const formatRateShort = (pesosPerDollar: number) =>
  `${currencySymbols.USD}1 = ${currencySymbols.DOP}${formatNumber(pesosPerDollar, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/** "Sep 29, 1:12 AM": when domfin-api last got the rate (an ISO time in UTC), in local time. */
export const formatCheckedAt = (iso: string) =>
  new Date(iso).toLocaleString(getFormatLocale(), { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
