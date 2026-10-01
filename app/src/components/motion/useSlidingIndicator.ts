import { useEffect, useRef } from 'react';
import { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { spring, timing } from './animations';
import { useReducedMotion } from './reducedMotion';

/** Where the selected item sits along the indicator's axis, in its parent's coordinates. */
export type IndicatorSpan = { start: number; size: number };

/**
 * Animated style for a selection indicator (tab pill, sidebar highlight,
 * segmented thumb) that slides to the selected item. The edge in front moves
 * a little faster than the one behind, so it stretches as it travels.
 *
 * Give it an absolute position at the start of `axis`; the style sets the
 * offset and the length. `key` names the selected item: a new span for the
 * same key (a resize) is followed without sliding.
 */
export function useSlidingIndicator(axis: 'x' | 'y', span: IndicatorSpan | null, key: string | null) {
  const reduced = useReducedMotion();
  const start = useSharedValue(span?.start ?? 0);
  const end = useSharedValue(span ? span.start + span.size : 0);
  const opacity = useSharedValue(0);
  const placed = useRef<string | null>(null);

  const spanStart = span?.start;
  const spanSize = span?.size;

  useEffect(() => {
    if (spanStart === undefined || spanSize === undefined) {
      // Nothing selected here (e.g. a page that isn't in this nav): fade out and
      // appear in place next time instead of sliding from the old item.
      placed.current = null;
      opacity.value = withTiming(0, timing('fast'));
      return;
    }
    const nextEnd = spanStart + spanSize;
    if (placed.current === null || placed.current === key || reduced) {
      start.value = spanStart;
      end.value = nextEnd;
    } else {
      const forward = spanStart > start.value;
      start.value = withSpring(spanStart, spring(forward ? 'trail' : 'lead'));
      end.value = withSpring(nextEnd, spring(forward ? 'lead' : 'trail'));
    }
    placed.current = key;
    opacity.value = withTiming(1, timing('fast'));
  }, [spanStart, spanSize, key, reduced, start, end, opacity]);

  return useAnimatedStyle(() =>
    axis === 'x'
      ? { opacity: opacity.value, width: end.value - start.value, transform: [{ translateX: start.value }] }
      : { opacity: opacity.value, height: end.value - start.value, transform: [{ translateY: start.value }] },
  );
}
