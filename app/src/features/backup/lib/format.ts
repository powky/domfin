import type { TFunction } from 'i18next';

import { formatDateValue } from '@/lib/dates';
import { formatNumber } from '@/lib/format';

import type { BackupPlace } from '../types';

const pad = (value: number) => String(value).padStart(2, '0');

/** "Oct 1, 2026, 9:30 AM" for a time domfin-api sends with its offset, in this device's time. */
export function formatWhen(iso: string) {
  const date = new Date(iso);
  const local = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return formatDateValue(local, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** "66 KB", "1.2 MB": in thousands, like the Finder and Explorer. */
export function formatSize(bytes: number, t: TFunction) {
  return bytes < 1_000_000
    ? t('backup.size.kb', { size: formatNumber(Math.max(1, Math.round(bytes / 1_000))) })
    : t('backup.size.mb', { size: formatNumber(bytes / 1_000_000, { maximumFractionDigits: 1 }) });
}

/** "iCloud Drive", "OneDrive (Personal)". */
export function placeName(place: Pick<BackupPlace, 'service' | 'account'>, t: TFunction) {
  const service = t(`backup.services.${place.service}`);
  return place.account ? t('backup.serviceAccount', { service, account: place.account }) : service;
}
