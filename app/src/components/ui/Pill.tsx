import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Text } from './Text';

/** Small neutral tag, e.g. "Split". */
export function Pill({ label }: { label: string }) {
  return (
    <View style={styles.pill}>
      <Text variant="captionStrong" tone="secondary" style={styles.label}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  pill: {
    paddingHorizontal: theme.space[2],
    paddingVertical: theme.space[0.5],
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceMuted,
  },
  label: {
    fontSize: theme.font.size.xs,
    lineHeight: theme.font.lineHeight.xs,
  },
}));
