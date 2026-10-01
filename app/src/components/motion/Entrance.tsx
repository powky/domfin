import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ViewProps } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { motion } from '@/theme';

import { timing } from './animations';
import { useReducedMotion } from './reducedMotion';

/** Surfaces that mount later than this after their screen opened just appear. */
const ENTRANCE_WINDOW = 600;

type Scope = { next: () => number | null };

const ScopeContext = createContext<Scope | null>(null);

/**
 * Inside a surface: when its entrance starts (a timestamp), or null when it
 * has none. Undefined outside any surface. Nested surfaces never animate
 * twice: only the outermost one rises.
 */
const SurfaceContext = createContext<number | null | undefined>(undefined);

function createScope(): Scope {
  const openedAt = Date.now();
  let index = 0;
  return {
    next: () =>
      Date.now() - openedAt > ENTRANCE_WINDOW
        ? null
        : Math.min(index++, motion.stagger.maxSteps) * motion.stagger.step,
  };
}

/** Wraps a screen so the surfaces inside rise into place one after another, in reading order. */
export function EntranceScope({ children }: { children: ReactNode }) {
  const [scope] = useState(createScope);
  return <ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider>;
}

/**
 * View that rises into place when its screen opens, right after the surfaces
 * above it. Cards use it as their root; it does nothing outside a screen.
 */
export function Reveal({ style, children, ...props }: ViewProps) {
  const scope = useContext(ScopeContext);
  const parent = useContext(SurfaceContext);
  const reduced = useReducedMotion();
  const [delay] = useState(() => (scope && parent === undefined ? scope.next() : null));
  const [startsAt] = useState(() => (delay === null ? null : Date.now() + delay));
  const progress = useSharedValue(delay === null ? 1 : 0);

  useEffect(() => {
    if (delay === null) return;
    // Reduced motion: a quick fade in place, all at once.
    progress.value = reduced
      ? withTiming(1, timing('fast'))
      : withDelay(delay, withTiming(1, timing('slow', 'enter')), ReduceMotion.Never);
    // The entrance plays once, when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: reduced ? 0 : (1 - progress.value) * motion.travel.rise }],
  }));

  return (
    <Animated.View {...props} style={[style, delay === null ? null : animatedStyle]}>
      <SurfaceContext.Provider value={parent === undefined ? startsAt : parent}>{children}</SurfaceContext.Provider>
    </Animated.View>
  );
}

/**
 * How long until the enclosing surface starts rising in, frozen at mount, so
 * a chart can wait for its card before drawing. 0 once the screen is open.
 */
export function useEntranceDelay() {
  const startsAt = useContext(SurfaceContext);
  const [delay] = useState(() => (startsAt ? Math.max(startsAt - Date.now(), 0) : 0));
  return delay;
}

/**
 * Style for a screen's content as it opens: a fade plus a short slide from
 * the side the user is heading to (1 forward, -1 back, 0 in place).
 */
export function useScreenArrival(direction: -1 | 0 | 1) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, timing(reduced ? 'fast' : 'base', 'enter'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateX: reduced ? 0 : (1 - progress.value) * direction * motion.travel.screen }],
  }));
}

/**
 * Fades content in whenever `key` changes (not on mount), e.g. a chart's axis
 * labels when the scale changes. Returns a style for views and props for SVG.
 */
export function useFadeInOnChange(key: string) {
  const reduced = useReducedMotion();
  const [state, setState] = useState({ key, generation: 0 });
  if (state.key !== key) setState({ key, generation: state.generation + 1 });
  const { generation } = state;
  const progress = useSharedValue(0);

  useEffect(() => {
    if (generation === 0) return;
    progress.value = reduced ? generation : generation - 1;
    if (!reduced) progress.value = withTiming(generation, timing('morph'));
    // Only a change of key fades.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation]);

  // Right after a change the new content starts transparent, so it never flashes in.
  const style = useAnimatedStyle(() => ({ opacity: Math.min(Math.max(progress.value - (generation - 1), 0), 1) }));
  const props = useAnimatedProps(() => ({ opacity: Math.min(Math.max(progress.value - (generation - 1), 0), 1) }));
  return { style, props };
}
