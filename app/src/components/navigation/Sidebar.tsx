import { Link, usePathname } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ScrollView, View, type LayoutRectangle } from 'react-native';
import Animated from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Logo } from '@/components/brand/Logo';
import { useSlidingIndicator } from '@/components/motion';
import { Badge, Text, Touchable } from '@/components/ui';

import { isActive, primaryNav, settingsNav, useNavLabel, type NavItem } from './navigation';

type ItemLayout = { group: string; y: number; height: number };

/** `footer` sits above Settings, like the dollar rate the app converts at. */
export function Sidebar({ footer }: { footer?: ReactNode }) {
  const pathname = usePathname();
  // Where each group and item sits, so the highlight can slide between them.
  const [groupTops, setGroupTops] = useState<Partial<Record<string, number>>>({});
  const [itemLayouts, setItemLayouts] = useState<Partial<Record<string, ItemLayout>>>({});

  const activeKey = primaryNav.find((item) => isActive(pathname, item.href))?.key ?? null;
  const active = activeKey ? itemLayouts[activeKey] : undefined;
  const activeTop = active ? groupTops[active.group] : undefined;
  const highlight = useSlidingIndicator(
    'y',
    active && activeTop !== undefined ? { start: activeTop + active.y, size: active.height } : null,
    activeKey,
  );
  // Settings sits below the scrolling list, so it has a highlight of its own.
  const settingsActive = isActive(pathname, settingsNav.href);
  const settings = itemLayouts[settingsNav.key];
  const settingsHighlight = useSlidingIndicator(
    'y',
    settingsActive && settings ? { start: settings.y, size: settings.height } : null,
    settingsActive ? settingsNav.key : null,
  );

  const measureGroup = (group: string, top: number) =>
    setGroupTops((current) => (current[group] === top ? current : { ...current, [group]: top }));
  const measureItem = (key: string, group: string, { y, height }: LayoutRectangle) =>
    setItemLayouts((current) => {
      const known = current[key];
      return known && known.y === y && known.height === height ? current : { ...current, [key]: { group, y, height } };
    });

  return (
    <View style={styles.sidebar}>
      <View style={styles.logo}>
        <Logo />
      </View>
      <ScrollView contentContainerStyle={styles.navContent} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.highlight, highlight]} />
        <View style={styles.group} onLayout={(event) => measureGroup('primary', event.nativeEvent.layout.y)}>
          {primaryNav.map((item) => (
            <SidebarItem
              key={item.key}
              item={item}
              active={item.key === activeKey}
              onLayout={(layout) => measureItem(item.key, 'primary', layout)}
            />
          ))}
        </View>
      </ScrollView>
      <View style={styles.group}>
        {footer}
        <Animated.View style={[styles.highlight, settingsHighlight]} />
        <SidebarItem
          item={settingsNav}
          active={settingsActive}
          onLayout={(layout) => measureItem(settingsNav.key, 'settings', layout)}
        />
      </View>
    </View>
  );
}

function SidebarItem({
  item,
  active,
  onLayout,
}: {
  item: NavItem;
  active: boolean;
  onLayout: (layout: LayoutRectangle) => void;
}) {
  const label = useNavLabel();
  return (
    <Link href={item.href} asChild>
      <Touchable
        accessibilityRole="link"
        accessibilityState={{ selected: active }}
        onLayout={(event) => onLayout(event.nativeEvent.layout)}
        surfaceStyle={styles.item}
        hoverStyle={active ? undefined : styles.itemHovered}
      >
        <SidebarIcon icon={item.icon} active={active} />
        <Text variant="bodyMedium" tone={active ? 'accent' : 'primary'} style={styles.itemLabel}>
          {label(item)}
        </Text>
        {item.badge ? <Badge count={item.badge} /> : null}
      </Touchable>
    </Link>
  );
}

function SidebarIcon({ icon: Icon, active }: { icon: NavItem['icon']; active: boolean }) {
  const { theme } = useUnistyles();
  return (
    <Icon size={18} strokeWidth={1.75} color={active ? theme.colors.accent.default : theme.colors.text.secondary} />
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  sidebar: {
    display: { xs: 'none', md: 'flex' },
    width: theme.layout.sidebarWidth,
    backgroundColor: theme.colors.background,
    borderRightWidth: theme.layout.hairline,
    borderRightColor: theme.colors.border,
    paddingTop: rt.insets.top + theme.space[5],
    paddingBottom: rt.insets.bottom + theme.space[4],
    paddingHorizontal: theme.space[3],
    gap: theme.space[4],
  },
  logo: {
    paddingHorizontal: theme.space[2.5],
    paddingBottom: theme.space[2],
  },
  navContent: {
    gap: theme.space[6],
  },
  // Slides to the active item; drawn under the items.
  highlight: {
    position: 'absolute',
    pointerEvents: 'none',
    top: 0,
    left: 0,
    right: 0,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent.subtle,
  },
  group: {
    gap: theme.space[0.5],
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[3],
    paddingHorizontal: theme.space[2.5],
    paddingVertical: theme.space[2],
    borderRadius: theme.radius.md,
  },
  itemHovered: {
    backgroundColor: theme.colors.surfaceHover,
  },
  itemLabel: {
    flex: 1,
  },
}));
