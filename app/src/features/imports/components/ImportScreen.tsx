import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { PageHeader } from '@/components/PageHeader';
import { Screen } from '@/components/Screen';
import { refreshLiveAccounts } from '@/features/accounts';
import { refreshLedger } from '@/features/ledger';

import { useStatementCoverage } from '../api/useStatementCoverage';
import { useStatementImport } from '../api/useStatementImport';
import { CoverageCard } from './CoverageCard';
import { UploadCard } from './UploadCard';

/** Upload bank PDFs to domfin-api and see which months each account has. */
export function ImportScreen() {
  const { t } = useTranslation();
  const coverage = useStatementCoverage();
  const { refresh } = coverage;
  // New statements can bring new accounts, balances and movements.
  const onImported = useCallback(() => {
    void refresh();
    void refreshLiveAccounts();
    void refreshLedger();
  }, [refresh]);
  const upload = useStatementImport(onImported);

  return (
    <Screen header={<PageHeader title={t('imports.title')} subtitle={t('imports.subtitle')} />}>
      <UploadCard state={upload.state} onChoose={upload.choose} />
      <CoverageCard coverage={coverage} />
    </Screen>
  );
}
