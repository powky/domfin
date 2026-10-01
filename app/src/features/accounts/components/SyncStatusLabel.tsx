import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui';
import { i18n } from '@/i18n';
import { formatDate, formatShortDate } from '@/lib/dates';

import type { Institution } from '../types';

/** "Statement Sep 21": the institution's latest imported statement; an asset's latest payment. */
export function SyncStatusLabel({ institution }: { institution: Institution }) {
  const { t } = useTranslation();
  if (!institution.syncedAt) return null;
  return (
    <Text variant="caption" tone="secondary" numberOfLines={1}>
      {institution.icon
        ? t('accounts.status.lastPayment', { date: formatShortDate(institution.syncedAt) })
        : t('accounts.status.imported', { date: formatShortDate(institution.syncedAt) })}
    </Text>
  );
}

/** Sentence for detail headers, e.g. "Latest statement Sep 21, 2026". */
export function syncSentence(institution: Institution) {
  return i18n.t('accounts.status.importedAt', { date: formatDate(institution.syncedAt) });
}
