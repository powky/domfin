import {
  ArrowUpFromLine,
  Banknote,
  Briefcase,
  Building2,
  CalendarClock,
  CreditCard,
  Gift,
  Globe,
  HandCoins,
  Landmark,
  Percent,
  PiggyBank,
  Receipt,
  Undo2,
  UserRound,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react-native';

import { Avatar, type AvatarProps } from '@/components/ui';

import { avatarLook, type AvatarIcon, type AvatarSubject } from '../lib/avatar';
import { merchantInitial } from '../lib/format';
import { merchantLogos } from '../lib/merchantLogos';
import type { Transaction } from '../types';

/** What no company is behind, by what it is. */
const icons: Readonly<Record<AvatarIcon, LucideIcon>> = {
  payroll: Briefcase,
  interest: Percent,
  tax: Receipt,
  atm: Banknote,
  cashAdvance: HandCoins,
  loan: Building2,
  installment: CalendarClock,
  card: CreditCard,
  deposit: PiggyBank,
  withdrawal: ArrowUpFromLine,
  cashback: Gift,
  correction: Wrench,
  returned: Undo2,
  dollars: Globe,
  account: Landmark,
  person: UserRound,
  cash: Wallet,
};

const hasLogo = (merchantId: string) => merchantId in merchantLogos;

export type MerchantAvatarProps = {
  transaction: Pick<Transaction, 'merchant'> & AvatarSubject;
  /** `xs` (20) by default, like the logos in the transactions list. */
  size?: AvatarProps['size'];
};

/** Who a transaction is with: the merchant's logo, an icon of what it is, or its initial. */
export function MerchantAvatar({ transaction, size = 'xs' }: MerchantAvatarProps) {
  const initials = merchantInitial(transaction.merchant);
  const look = avatarLook(transaction, hasLogo);
  if ('logo' in look) return <Avatar initials={initials} source={merchantLogos[look.logo]} size={size} />;
  if ('icon' in look) return <Avatar initials={initials} icon={icons[look.icon]} tone="neutral" size={size} />;
  return <Avatar initials={initials} tone="outline" size={size} />;
}
