import { Check, Minus } from 'lucide-react-native';
import { Pressable } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

/** Box size per breakpoint, for layouts that line up with a column of checkboxes. */
export const checkboxSize = { xs: 18, md: 16 } as const;

export type CheckboxProps = {
  checked: boolean;
  /** Shows a dash: part of a group is checked. Pressing it checks everything. */
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  accessibilityLabel: string;
  disabled?: boolean;
};

export function Checkbox({ checked, indeterminate, onChange, accessibilityLabel, disabled }: CheckboxProps) {
  const { theme } = useUnistyles();
  const filled = checked || indeterminate;
  const Icon = indeterminate ? Minus : Check;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: indeterminate ? 'mixed' : checked, disabled }}
      disabled={disabled}
      hitSlop={12}
      onPress={() => onChange(indeterminate ? true : !checked)}
      style={[styles.box, filled && styles.boxFilled]}
    >
      {filled ? <Icon size={12} strokeWidth={3} color={theme.colors.accent.onAccent} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  box: {
    width: checkboxSize,
    height: checkboxSize,
    borderRadius: theme.radius.xs,
    borderWidth: 1.5,
    borderColor: theme.colors.control,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    _web: {
      cursor: 'pointer',
    },
  },
  boxFilled: {
    borderColor: theme.colors.accent.default,
    backgroundColor: theme.colors.accent.default,
  },
}));
