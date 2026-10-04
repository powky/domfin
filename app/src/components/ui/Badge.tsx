import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Text } from './Text';

export type BadgeProps = {
  count: number;
  /** `subtle`: orange text on light orange (sidebar). `solid`: white on orange (tab bar). */
  appearance?: 'subtle' | 'solid';
};

export function Badge({ count, appearance = 'subtle' }: BadgeProps) {
  styles.useVariants({ appearance });
  return (
    <View style={styles.badge}>
      <Text variant="captionStrong" style={styles.label}>
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: theme.space[1.5],
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    variants: {
      appearance: {
        subtle: { backgroundColor: theme.colors.accent.subtle },
        solid: { backgroundColor: theme.colors.accent.default, minWidth: 18, height: 18 },
      },
    },
  },
  label: {
    fontSize: theme.font.size.xs,
    lineHeight: theme.font.lineHeight.xs,
    variants: {
      appearance: {
        subtle: { color: theme.colors.text.accent },
        solid: { color: theme.colors.accent.onAccent },
      },
    },
  },
}));
