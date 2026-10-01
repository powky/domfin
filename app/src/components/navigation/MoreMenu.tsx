import { Link } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Badge, Card, Text, Touchable } from '@/components/ui';

import { moreNav, settingsNav, useNavLabel, type NavItem } from './navigation';

/** Phone menu for everything that doesn't fit in the tab bar. */
export function MoreMenu() {
  return (
    <>
      <MenuCard items={moreNav} />
      <MenuCard items={[settingsNav]} />
    </>
  );
}

/** Rows linking to `items`, then any extra rows passed as children. */
function MenuCard({ items, children }: { items: NavItem[]; children?: ReactNode }) {
  const { theme } = useUnistyles();
  const label = useNavLabel();
  return (
    <Card style={styles.card}>
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <Link key={item.key} href={item.href} asChild>
            <Touchable
              accessibilityRole="link"
              surfaceStyle={[styles.row, index > 0 && styles.divider]}
              hoverStyle={styles.pressed}
              pressedStyle={styles.pressed}
            >
              <Icon size={20} strokeWidth={1.75} color={theme.colors.text.secondary} />
              <Text variant="bodyMedium" style={styles.label}>
                {label(item)}
              </Text>
              {item.badge ? <Badge count={item.badge} /> : null}
              <ChevronRight size={18} color={theme.colors.text.tertiary} />
            </Touchable>
          </Link>
        );
      })}
      {children}
    </Card>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    padding: 0,
    gap: 0,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[3],
    paddingHorizontal: theme.space[4],
    paddingVertical: theme.space[3],
    minHeight: 52,
  },
  divider: {
    borderTopWidth: theme.layout.hairline,
    borderTopColor: theme.colors.border,
  },
  label: {
    flex: 1,
  },
  pressed: {
    backgroundColor: theme.colors.surfaceHover,
  },
}));
