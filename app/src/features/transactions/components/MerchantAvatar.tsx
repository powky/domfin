import { Avatar, type AvatarProps } from '@/components/ui';

import { merchantInitial } from '../lib/format';
import type { Transaction } from '../types';

export type MerchantAvatarProps = {
  transaction: Pick<Transaction, 'merchant' | 'merchantLogo'>;
  /** `xs` (20) by default, like the logos in the transactions list. */
  size?: AvatarProps['size'];
};

/** Merchant "logo": brand color when known, an outlined circle with the initial otherwise. */
export function MerchantAvatar({ transaction, size = 'xs' }: MerchantAvatarProps) {
  return <Avatar initials={merchantInitial(transaction.merchant)} tone={transaction.merchantLogo ?? 'outline'} size={size} />;
}
