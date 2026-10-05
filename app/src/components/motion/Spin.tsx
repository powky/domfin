import { useEffect, type ReactNode } from 'react';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { useReducedMotion } from './reducedMotion';

/** Turns its content round, once a second, while something is in progress. Still with reduced motion. */
export function Spin({ size, children }: { size: number; children: ReactNode }) {
  const reduced = useReducedMotion();
  const turn = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      cancelAnimation(turn);
      turn.value = 0;
      return;
    }
    turn.value = withRepeat(withTiming(1, { duration: 1000, easing: Easing.linear }), -1);
    return () => cancelAnimation(turn);
  }, [reduced, turn]);

  const turning = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 360}deg` }] }));
  return <Animated.View style={[styles.box(size), turning]}>{children}</Animated.View>;
}

const styles = StyleSheet.create(() => ({
  box: (size: number) => ({
    width: size,
    height: size,
  }),
}));
