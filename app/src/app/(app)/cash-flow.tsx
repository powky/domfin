import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { CashFlowScreen } from '@/features/cash-flow';

export default function CashFlowRoute() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ title: t('nav.cash-flow') }} />
      <CashFlowScreen />
    </>
  );
}
