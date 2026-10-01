import { X, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

export type TextFieldProps = Omit<TextInputProps, 'style' | 'value' | 'onChangeText'> & {
  value: string;
  onChangeText: (value: string) => void;
  icon?: LucideIcon;
  /** Shows a clear button while there is text. */
  clearable?: boolean;
  clearAccessibilityLabel?: string;
  /** Layout style for the field box (e.g. `flex: 1`, a fixed width). */
  containerStyle?: StyleProp<ViewStyle>;
};

/** Single-line input with the bordered look of buttons and selects. */
export function TextField({
  value,
  onChangeText,
  icon: Icon,
  clearable,
  clearAccessibilityLabel,
  containerStyle,
  onFocus,
  onBlur,
  ...props
}: TextFieldProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, focused && styles.fieldFocused, containerStyle]}>
      {Icon ? <Icon size={16} strokeWidth={1.75} color={theme.colors.text.tertiary} /> : null}
      <TextInput
        autoCorrect={false}
        {...props}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={theme.colors.text.tertiary}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={styles.input}
      />
      {clearable && value ? (
        <Pressable
          onPress={() => onChangeText('')}
          accessibilityRole="button"
          accessibilityLabel={clearAccessibilityLabel ?? t('common.clear')}
          hitSlop={8}
          style={styles.clear}
        >
          <X size={14} strokeWidth={2} color={theme.colors.text.secondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  field: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2],
    paddingHorizontal: theme.space[3],
    borderRadius: theme.radius.md,
    borderWidth: theme.layout.hairline,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  fieldFocused: {
    borderColor: theme.colors.accent.default,
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    padding: 0,
    fontFamily: theme.font.family.regular,
    // 16px also keeps mobile Safari from zooming into the field.
    fontSize: theme.font.size.lg,
    color: theme.colors.text.primary,
    _web: {
      outlineStyle: 'none',
    },
  },
  clear: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceMuted,
  },
}));
