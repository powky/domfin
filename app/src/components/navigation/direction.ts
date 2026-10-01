import { usePathname } from 'expo-router';
import { useEffect, useState } from 'react';

import { isActive, moreNav, primaryNav, settingsNav } from './navigation';

export type NavDirection = -1 | 0 | 1;

/** Every section in nav order (sidebar, then More), to tell forward from back. */
const sections = [...primaryNav, settingsNav, { href: '/more' as const }];

const sectionIndex = (pathname: string) => sections.findIndex((item) => isActive(pathname, item.href));
const isMoreItem = (pathname: string) => [...moreNav, settingsNav].some((item) => isActive(pathname, item.href));

/**
 * Which way a navigation goes: 1 deeper or further along the nav (a detail
 * page, a later tab), -1 back or earlier, 0 when there's no clear direction.
 */
export function navDirection(from: string, to: string): NavDirection {
  if (from === to) return 0;
  if (to.startsWith(`${from}/`)) return 1;
  if (from.startsWith(`${to}/`)) return -1;
  // On phones "More" is the parent of the pages it lists.
  if (from === '/more' && isMoreItem(to)) return 1;
  if (to === '/more' && isMoreItem(from)) return -1;
  const a = sectionIndex(from);
  const b = sectionIndex(to);
  if (a < 0 || b < 0 || a === b) return 0;
  return b > a ? 1 : -1;
}

/** The last screen that finished opening. Only one screen is mounted at a time. */
let settledPath: string | null = null;

/** Direction of the navigation that opened the calling screen, fixed when it mounts. */
export function useArrivalDirection(): NavDirection {
  const pathname = usePathname();
  const [direction] = useState(() => (settledPath ? navDirection(settledPath, pathname) : 0));
  useEffect(() => {
    settledPath = pathname;
  }, [pathname]);
  return direction;
}
