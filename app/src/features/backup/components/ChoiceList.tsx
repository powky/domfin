import { Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Text } from '@/components/ui';

export type Choice<T extends string> = { value: T; label: string; detail?: string; note?: string };

/** Options picked one at a time, each with a line or two under its name. */
export function ChoiceList<T extends string>({
  choices,
  value,
  onChange,
  accessibilityLabel,
}: {
  choices: readonly Choice<T>[];
  value: T | null;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} style={styles.list}>
      {choices.map((choice) => {
        const selected = choice.value === value;
        return (
          <Pressable
            key={choice.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={choice.label}
            onPress={() => onChange(choice.value)}
            style={[styles.choice, selected && styles.selected]}
          >
            <View style={[styles.radio, selected && styles.radioSelected]}>
              {selected ? <View style={styles.dot} /> : null}
            </View>
            <View style={styles.text}>
              <Text variant="bodyMedium">{choice.label}</Text>
              {choice.detail ? (
                <Text variant="caption" tone="tertiary" numberOfLines={1} ellipsizeMode="middle">
                  {choice.detail}
                </Text>
              ) : null}
              {choice.note ? (
                <Text variant="caption" tone="accent">
                  {choice.note}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  list: {
    gap: theme.space[2],
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[3],
    padding: theme.space[3],
    borderRadius: theme.radius.md,
    borderWidth: theme.layout.hairline,
    borderColor: theme.colors.border,
  },
  selected: {
    borderColor: theme.colors.accent.default,
    backgroundColor: theme.colors.accent.subtle,
  },
  radio: {
    width: theme.space[4],
    height: theme.space[4],
    borderRadius: theme.radius.full,
    borderWidth: theme.layout.hairline,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: theme.colors.accent.default,
  },
  dot: {
    width: theme.space[2],
    height: theme.space[2],
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accent.default,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: theme.space[0.5],
  },
}));
