import { useLocalSearchParams } from 'expo-router';

import { AccountDetailScreen } from '@/features/accounts';

export default function AccountRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AccountDetailScreen id={id} />;
}
