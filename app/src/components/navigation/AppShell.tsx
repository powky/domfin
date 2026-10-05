import type { ReactNode } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { usePhoneLayout } from '@/theme';

import { BottomTabBar } from './BottomTabBar';
import { Sidebar } from './Sidebar';

/**
 * Responsive app frame: sidebar from `md` up, bottom tab bar below. Only the
 * one in use is mounted (see `usePhoneLayout`); the page keeps its place, so
 * crossing `md` doesn't remount it.
 */
export function AppShell({ children, sidebarFooter }: { children: ReactNode; sidebarFooter?: ReactNode }) {
  const phone = usePhoneLayout();
  return (
    <View style={styles.root}>
      <View style={styles.body}>
        {phone ? null : <Sidebar footer={sidebarFooter} />}
        <View style={styles.content}>{children}</View>
      </View>
      {phone ? <BottomTabBar /> : null}
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
  },
  // Pages scroll below the status bar, which keeps the background's color,
  // instead of passing under the clock.
  content: {
    flex: 1,
    paddingTop: rt.insets.top,
  },
}));
