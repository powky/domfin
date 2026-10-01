import type { TFunction } from 'i18next';
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Text } from '@/components/ui';

/** A form control with its label above and an optional hint below. */
export function Field({
  label,
  hint,
  style,
  children,
}: {
  label: string;
  hint?: string;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <View style={[styles.field, style]}>
      <Text variant="captionStrong" tone="secondary">
        {label}
      </Text>
      {children}
      {hint ? (
        <Text variant="caption" tone="tertiary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** "12 and 27", "3, 6 and 9" in the app language. */
export function joinList(items: readonly string[], t: TFunction) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${t('common.and')} ${items[items.length - 1]}`;
}

const styles = StyleSheet.create((theme) => ({
  field: {
    gap: theme.space[1.5],
  },
}));
