import { useLocalSearchParams } from 'expo-router';

import { AssetFormScreen } from '@/features/accounts';

export default function EditAssetRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AssetFormScreen id={id} />;
}
