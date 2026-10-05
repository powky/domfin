import { Slot } from 'expo-router';

import { AppShell } from '@/components/navigation';
import { ExchangeRateSummary } from '@/features/currency';
import { useSharedStatements } from '@/features/imports';
import { UpdateNotice } from '@/features/updates';

export default function AppLayout() {
  // PDFs shared from another app go straight to Importar estados.
  useSharedStatements();
  return (
    <AppShell
      sidebarFooter={
        <>
          <UpdateNotice />
          <ExchangeRateSummary />
        </>
      }
    >
      <Slot />
    </AppShell>
  );
}
