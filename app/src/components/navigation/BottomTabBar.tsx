import { Link, usePathname } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { useSlidingIndicator } from '@/components/motion';
import { Badge, Text, Touchable } from '@/components/ui';

import { isActive, moreBadge, moreNav, settingsNav, tabNav, useNavLabel, type NavItem } from './navigation';

/** Width of the pill behind the active tab's icon. */
const PILL_WIDTH = 48;

export function BottomTabBar() {
  const pathname = usePathname();
  const [width, setWidth] = useState(0);
  const moreActive = [...moreNav, settingsNav].some((item) => isActive(pathname, item.href));
  const activeIndex = tabNav.findIndex((item) =>
    item.key === 'more' ? moreActive || isActive(pathname, item.href) : isActive(pathname, item.href),
  );

  // Tabs share the width equally, so the pill's spot follows from the bar's width.
  const slot = width / tabNav.length;
  const pill = useSlidingIndicator(
    'x',
    width > 0 && activeIndex >= 0 ? { start: activeIndex * slot + (slot - PILL_WIDTH) / 2, size: PILL_WIDTH } : null,
    activeIndex >= 0 ? tabNav[activeIndex].key : null,
  );

  return (
    <View
      style={styles.bar}
      accessibilityRole="tablist"
      onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
    >
      <Animated.View style={[styles.pill, pill]} />
      {tabNav.map((item, index) => {
        const badge = item.key === 'more' ? moreBadge : item.badge;
        return <TabItem key={item.key} item={item} active={index === activeIndex} badge={badge} />;
      })}
    </View>
  );
}

function TabItem({ item, active, badge }: { item: NavItem; active: boolean; badge?: number }) {
  const { theme } = useUnistyles();
  const label = useNavLabel();
  const Icon = item.icon;
  const color = active ? theme.colors.accent.default : theme.colors.text.secondary;

  return (
    <Link href={item.href} asChild>
      <Touchable accessibilityRole="tab" accessibilityState={{ selected: active }} surfaceStyle={styles.item} containerStyle={styles.itemContainer}>
        <View style={styles.iconWrap}>
          <Icon size={22} strokeWidth={1.75} color={color} />
          {badge ? (
            <View style={styles.badge}>
              <Badge count={badge} appearance="solid" />
            </View>
          ) : null}
        </View>
        <Text variant="caption" tone={active ? 'accent' : 'secondary'} style={styles.label} numberOfLines={1}>
          {label(item, { tab: true })}
        </Text>
      </Touchable>
    </Link>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  bar: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderTopWidth: theme.layout.hairline,
    borderTopColor: theme.colors.border,
    paddingTop: theme.space[2],
    paddingBottom: Math.max(rt.insets.bottom, theme.space[2]),
  },
  pill: {
    position: 'absolute',
    pointerEvents: 'none',
    // Lines up with the icon at the top of each tab.
    top: theme.space[2],
    left: 0,
    height: 30,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accent.subtle,
  },
  itemContainer: {
    flex: 1,
  },
  item: {
    alignItems: 'center',
    gap: theme.space[0.5],
  },
  iconWrap: {
    width: PILL_WIDTH,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: 2,
  },
  label: {
    fontFamily: theme.font.family.medium,
    fontSize: theme.font.size.xs,
  },
}));
