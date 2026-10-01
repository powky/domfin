import { Easing, ReduceMotion, type WithSpringConfig, type WithTimingConfig } from 'react-native-reanimated';

import { motion } from '@/theme';

type EasingName = keyof typeof motion.easing;

/**
 * Motion easings as worklet functions: usable in `withTiming`, inside
 * worklets (e.g. to ease each bar of a chart on its own) and in plain JS.
 */
export const ease: Record<EasingName, (t: number) => number> = {
  standard: Easing.bezierFn(...motion.easing.standard),
  enter: Easing.bezierFn(...motion.easing.enter),
};

/**
 * `withTiming` config from the motion tokens. Reduced motion is decided by
 * each component (fade instead of move, jump instead of roll), so Reanimated
 * is told never to skip these on its own.
 */
export function timing(
  duration: keyof typeof motion.duration | number,
  easing: EasingName | 'linear' = 'standard',
): WithTimingConfig {
  return {
    duration: typeof duration === 'number' ? duration : motion.duration[duration],
    easing: easing === 'linear' ? Easing.linear : ease[easing],
    reduceMotion: ReduceMotion.Never,
  };
}

/** `withSpring` config from the motion tokens. */
export function spring(name: keyof typeof motion.spring): WithSpringConfig {
  return { ...motion.spring[name], reduceMotion: ReduceMotion.Never };
}
