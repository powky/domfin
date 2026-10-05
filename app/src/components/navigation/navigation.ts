import {
  ArrowDownUp,
  ChartPie,
  CircleQuestionMark,
  Ellipsis,
  FileUp,
  Gem,
  HandCoins,
  Landmark,
  ReceiptText,
  Settings,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react-native';
import type { Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

export type NavItem = {
  key: string;
  href: Href;
  icon: LucideIcon;
  badge?: number;
};

type Page =
  | 'transactions'
  | 'cash-flow'
  | 'spending'
  | 'budget'
  | 'net-worth'
  | 'accounts'
  | 'possessions'
  | 'loans'
  | 'uncategorized'
  | 'imports'
  | 'more'
  | 'settings';
type Tab = 'transactions' | 'cash-flow' | 'spending' | 'budget' | 'more';

export const primaryNav: NavItem[] = [
  { key: 'transactions', href: '/transactions', icon: ReceiptText },
  { key: 'cash-flow', href: '/cash-flow', icon: ArrowDownUp },
  { key: 'spending', href: '/spending', icon: ChartPie },
  { key: 'budget', href: '/budget', icon: Wallet },
  { key: 'net-worth', href: '/net-worth', icon: TrendingUp },
  { key: 'accounts', href: '/accounts', icon: Landmark },
  { key: 'possessions', href: '/possessions', icon: Gem },
  { key: 'loans', href: '/loans', icon: HandCoins },
  { key: 'uncategorized', href: '/uncategorized', icon: CircleQuestionMark },
  { key: 'imports', href: '/imports', icon: FileUp },
];

/**
 * Items shown directly in the mobile tab bar; the rest live under "More".
 * Five fit a phone's width: the budget, used all month, took Net worth's place.
 */
const tabKeys = ['transactions', 'cash-flow', 'spending', 'budget'];

export const tabNav: NavItem[] = [
  ...primaryNav.filter((item) => tabKeys.includes(item.key)),
  { key: 'more', href: '/more', icon: Ellipsis },
];

export const moreNav: NavItem[] = primaryNav.filter((item) => !tabKeys.includes(item.key));

export const moreBadge = moreNav.reduce((total, item) => total + (item.badge ?? 0), 0);

/** At the bottom of the sidebar on wide screens, and inside "More" on phones. */
export const settingsNav: NavItem = { key: 'settings', href: '/settings', icon: Settings };

/** Names of nav items in the app language; `tab` picks the shorter ones of the phone tab bar. */
export function useNavLabel() {
  const { t } = useTranslation();
  return (item: NavItem, { tab = false } = {}) =>
    tab ? t(`tabs.${item.key as Tab}`) : t(`nav.${item.key as Page}`);
}

export function isActive(pathname: string, href: Href) {
  const target = typeof href === 'string' ? href : href.pathname;
  return pathname === target || pathname.startsWith(`${target}/`);
}
