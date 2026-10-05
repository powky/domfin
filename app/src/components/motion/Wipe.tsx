import type { ReactNode } from 'react';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

export type WipeProps = {
  /** How much is shown, 0..1, from the left. */
  reveal: SharedValue<number>;
  /** The content's width. */
  width: number;
  children: ReactNode;
};

/**
 * Shows a chart left to right as `reveal` goes from 0 to 1: a frame that
 * clips it slides in while the chart slides the other way, so it stays put.
 * It covers its parent and lets touches through. Charts used an animated
 * ClipPath inside the SVG before, but Android doesn't redraw one that changes.
 */
export function Wipe({ reveal, width, children }: WipeProps) {
  const frame = useAnimatedStyle(() => ({ transform: [{ translateX: (reveal.value - 1) * width }] }));
  const content = useAnimatedStyle(() => ({ transform: [{ translateX: (1 - reveal.value) * width }] }));
  return (
    <Animated.View style={[styles.frame, frame]}>
      <Animated.View style={content}>{children}</Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create(() => ({
  frame: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    pointerEvents: 'none',
  },
}));
