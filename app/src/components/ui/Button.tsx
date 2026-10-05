import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Text } from './Text';
import { Touchable, type TouchableProps } from './Touchable';

export type ButtonProps = Omit<TouchableProps, 'children' | 'surfaceStyle'> & {
  label?: string;
  icon?: LucideIcon;
  trailingIcon?: LucideIcon;
  /** `secondary`: white and bordered (default). `primary`: solid accent, for the main action of a view. */
  variant?: 'secondary' | 'primary';
  /** Renders a square, icon-only button. */
  iconOnly?: boolean;
  /** Hides the leading icon on phones to save room. */
  hideIconOnPhone?: boolean;
  children?: ReactNode;
};

export function Button({
  label,
  icon: Icon,
  trailingIcon: Trailing,
  variant = 'secondary',
  iconOnly,
  hideIconOnPhone,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const { theme, rt } = useUnistyles();
  const primary = variant === 'primary';
  // The narrowest phones drop the leading icon to save room.
  const showIcon = Icon && !(hideIconOnPhone && rt.breakpoint === 'xs');
  const iconColor = primary
    ? theme.colors.accent.onAccent
    : disabled
      ? theme.colors.text.tertiary
      : theme.colors.text.secondary;
  const labelTone = primary ? 'inverse' : disabled ? 'tertiary' : 'primary';
  const hoverStyle = disabled ? undefined : primary ? styles.primaryHovered : styles.hovered;
  return (
    <Touchable
      {...props}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      surfaceStyle={[
        styles.button,
        primary && styles.primary,
        primary && disabled && styles.primaryDisabled,
        iconOnly && styles.iconOnly,
      ]}
      hoverStyle={hoverStyle}
      pressedStyle={hoverStyle}
    >
      {showIcon ? (
        <View>
          <Icon size={16} strokeWidth={primary ? 2.25 : 1.75} color={iconColor} />
        </View>
      ) : null}
      {label ? (
        <Text variant="bodyStrong" tone={labelTone} style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
      {children}
      {Trailing ? (
        <View style={styles.trailing}>
          <Trailing size={16} strokeWidth={1.75} color={iconColor} />
        </View>
      ) : null}
    </Touchable>
  );
}

const styles = StyleSheet.create((theme) => ({
  button: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2],
    paddingHorizontal: { xs: theme.space[2.5], md: theme.space[3] },
    borderRadius: theme.radius.md,
    borderWidth: theme.layout.hairline,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  primary: {
    borderColor: theme.colors.accent.default,
    backgroundColor: theme.colors.accent.default,
  },
  primaryDisabled: {
    borderColor: theme.colors.accent.muted,
    backgroundColor: theme.colors.accent.muted,
  },
  iconOnly: {
    width: 36,
    paddingHorizontal: 0,
    justifyContent: 'center',
  },
  label: {
    flexShrink: 1,
    fontSize: { xs: theme.font.size.md, md: theme.font.size.base },
  },
  // At the far end when the button is stretched, like a select's chevron in a full-width row.
  trailing: {
    marginLeft: 'auto',
  },
  hovered: {
    backgroundColor: theme.colors.surfaceHover,
  },
  primaryHovered: {
    borderColor: theme.colors.accent.pressed,
    backgroundColor: theme.colors.accent.pressed,
  },
}));
