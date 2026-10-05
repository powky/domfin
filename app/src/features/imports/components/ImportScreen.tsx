import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { PageHeader } from '@/components/PageHeader';
import { Screen } from '@/components/Screen';

import { retryFailed, useImportQueue } from '../api/importQueue';
import { useStatementCoverage } from '../api/useStatementCoverage';
import { useStatementPicker } from '../api/useStatementPicker';
import { needsPassword } from '../lib/queue';
import { CoverageCard } from './CoverageCard';
import { PdfPasswordCard } from './PdfPasswordCard';
import { UploadCard } from './UploadCard';

/**
 * Import bank PDFs, picked here or shared from another app, and see which
 * months each account has.
 */
export function ImportScreen() {
  const { t } = useTranslation();
  const coverage = useStatementCoverage();
  const queue = useImportQueue();
  const picker = useStatementPicker();
  const { refresh } = coverage;

  // Each statement saved can add months to the list.
  const saved = useRef(queue.saved);
  useEffect(() => {
    if (queue.saved === saved.current) return;
    saved.current = queue.saved;
    void refresh();
  }, [queue.saved, refresh]);

  return (
    <Screen header={<PageHeader title={t('imports.title')} subtitle={t('imports.subtitle')} />}>
      <UploadCard
        queue={queue}
        onChoose={picker.choose}
        onRetry={retryFailed}
        pickerUnavailable={picker.unavailable}
      />
      {/* PDFs that didn't open: with the password saved, they import again. */}
      {needsPassword(queue.entries) ? <PdfPasswordCard onSaved={retryFailed} /> : null}
      <CoverageCard coverage={coverage} />
    </Screen>
  );
}
