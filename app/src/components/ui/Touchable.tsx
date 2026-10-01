import { useState, type ReactNode } from 'react';
import { Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

export type TouchableProps = Omit<PressableProps, 'style' | 'children'> & {
  children: ReactNode;
  /** Visual style of the inner surface. Not named `style` so `<Link asChild>` leaves it alone. */
  surfaceStyle?: StyleProp<ViewStyle>;
  hoverStyle?: StyleProp<ViewStyle>;
  pressedStyle?: StyleProp<ViewStyle>;
  /** Layout style for the outer Pressable (single object, e.g. `flex: 1`). */
  containerStyle?: ViewStyle;
  style?: never;
};

/**
 * Pressable whose visual styles live on an inner View. Safe to use as the
 * child of `<Link asChild>`, which cannot receive style arrays or functions.
 */
export function Touchable({ children, surfaceStyle, hoverStyle, pressedStyle, containerStyle, ...props }: TouchableProps) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      {...props}
      style={containerStyle}
      onHoverIn={(event) => {
        setHovered(true);
        props.onHoverIn?.(event);
      }}
      onHoverOut={(event) => {
        setHovered(false);
        props.onHoverOut?.(event);
      }}
      onPressIn={(event) => {
        setPressed(true);
        props.onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        props.onPressOut?.(event);
      }}
    >
      <View style={[surfaceStyle, hovered && hoverStyle, pressed && pressedStyle]}>{children}</View>
    </Pressable>
  );
}
