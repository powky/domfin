import { Slot } from 'expo-router';

import { AppShell } from '@/components/navigation';
import { ExchangeRateSummary } from '@/features/currency';
import { UpdateNotice } from '@/features/updates';

export default function AppLayout() {
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
