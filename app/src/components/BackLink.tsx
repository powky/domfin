import { Link, type Href } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Text, Touchable } from '@/components/ui';

/**
 * "‹ All accounts" link above a detail page's header. Links to the list
 * explicitly because the app shell's Slot keeps no back stack on phones.
 */
export function BackLink({ href, label }: { href: Href; label: string }) {
  const { theme } = useUnistyles();
  return (
    <Link href={href} asChild>
      <Touchable
        accessibilityRole="link"
        containerStyle={styles.container}
        surfaceStyle={styles.link}
        hoverStyle={styles.hovered}
        pressedStyle={styles.hovered}
      >
        <ChevronLeft size={16} strokeWidth={2} color={theme.colors.text.secondary} />
        <Text variant="label" tone="secondary">
          {label}
        </Text>
      </Touchable>
    </Link>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    alignSelf: 'flex-start',
    marginBottom: -theme.space[2],
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[1],
    paddingVertical: theme.space[1],
    paddingRight: theme.space[2],
    paddingLeft: theme.space[1],
    marginLeft: -theme.space[1],
    borderRadius: theme.radius.sm,
  },
  hovered: {
    backgroundColor: theme.colors.surfaceHover,
  },
}));
