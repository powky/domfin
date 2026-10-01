import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { timing, useEntranceDelay, useReducedMotion } from '@/components/motion';

export type ProgressBarProps = {
  /** 0..1 */
  value: number;
  color: string;
};

/** Thin bar that fills up when it appears and slides to its new length when the value changes. */
export function ProgressBar({ value, color }: ProgressBarProps) {
  const reduced = useReducedMotion();
  const entranceDelay = useEntranceDelay();
  const target = Math.max(0, Math.min(1, value));
  const fill = useSharedValue(reduced ? target : 0);

  useEffect(() => {
    if (reduced) {
      fill.value = target;
      return;
    }
    const animation = withTiming(target, timing('slow'));
    // The first fill waits for its card to start appearing.
    fill.value = fill.value === 0 ? withDelay(entranceDelay, animation, ReduceMotion.Never) : animation;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, reduced]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, { backgroundColor: color }, fillStyle]} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  track: {
    height: 4,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.track,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: theme.radius.full,
  },
}));
