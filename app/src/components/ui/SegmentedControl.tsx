import { useState } from 'react';
import { Pressable, View, type LayoutRectangle } from 'react-native';
import Animated from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { useSlidingIndicator } from '@/components/motion';

import { Text } from './Text';

export type SegmentedOption<T extends string> = { value: T; label: string };

export type SegmentedControlProps<T extends string> = {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
};

/** Pill of mutually exclusive options. The selected thumb slides to the option picked. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: SegmentedControlProps<T>) {
  const { theme } = useUnistyles();
  const [layouts, setLayouts] = useState<Partial<Record<string, LayoutRectangle>>>({});
  const selected = layouts[value];
  // The thumb's border sits just outside the segment, like the static style it replaces.
  const border = theme.layout.hairline;
  const thumb = useSlidingIndicator(
    'x',
    selected ? { start: selected.x - border, size: selected.width + 2 * border } : null,
    value,
  );

  const measure = (key: string, layout: LayoutRectangle) =>
    setLayouts((current) => {
      const known = current[key];
      const same =
        known &&
        known.x === layout.x &&
        known.y === layout.y &&
        known.width === layout.width &&
        known.height === layout.height;
      return same ? current : { ...current, [key]: layout };
    });

  return (
    <View style={styles.container} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
      <Animated.View
        style={[
          styles.thumb,
          selected ? { top: selected.y - border, height: selected.height + 2 * border } : null,
          thumb,
        ]}
      />
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onChange(option.value)}
            onLayout={(event) => measure(option.value, event.nativeEvent.layout)}
            style={styles.segment}
          >
            <Text variant="label" tone={isSelected ? 'primary' : 'secondary'}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.md,
    padding: theme.space[0.5],
    gap: theme.space[0.5],
  },
  thumb: {
    position: 'absolute',
    pointerEvents: 'none',
    top: 0,
    left: 0,
    backgroundColor: theme.colors.surfaceRaised,
    borderWidth: theme.layout.hairline,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm + 2,
  },
  segment: {
    paddingHorizontal: theme.space[3],
    paddingVertical: theme.space[1.5],
    borderRadius: theme.radius.sm + 2,
  },
}));
