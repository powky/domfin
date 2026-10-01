import type { ReactNode } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { BottomTabBar } from './BottomTabBar';
import { Sidebar } from './Sidebar';

/**
 * Responsive app frame: sidebar from `md` up, bottom tab bar below.
 * Visibility is driven by Unistyles breakpoints in each component's styles,
 * so switching layouts never re-renders the tree.
 */
export function AppShell({ children, sidebarFooter }: { children: ReactNode; sidebarFooter?: ReactNode }) {
  return (
    <View style={styles.root}>
      <View style={styles.body}>
        <Sidebar footer={sidebarFooter} />
        <View style={styles.content}>{children}</View>
      </View>
      <BottomTabBar />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
  },
  content: {
    flex: 1,
  },
}));
