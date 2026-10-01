import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { timing, useEntranceDelay, useReducedMotion } from '@/components/motion';

export type StackedBarSegment = { id: string; value: number; color: string };

export type StackedBarProps = {
  /** Drawn left to right, each one as wide as its share of the total. */
  segments: StackedBarSegment[];
};

/**
 * Horizontal bar split into proportional segments (e.g. principal vs
 * interest). It grows in from the left when it appears and its segments
 * slide to their new shares when the values change.
 */
export function StackedBar({ segments }: StackedBarProps) {
  const reduced = useReducedMotion();
  const entranceDelay = useEntranceDelay();
  const reveal = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      reveal.value = 1;
      return;
    }
    reveal.value = withDelay(entranceDelay, withTiming(1, timing('slow')), ReduceMotion.Never);
    // Grows in once, when it first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const revealStyle = useAnimatedStyle(() => ({ width: `${reveal.value * 100}%` }));
  const visible = segments.filter((segment) => segment.value > 0);

  return (
    <View style={styles.track}>
      <Animated.View style={[styles.row, revealStyle]}>
        {visible.map((segment) => (
          <Piece key={segment.id} value={segment.value} color={segment.color} reduced={reduced} />
        ))}
      </Animated.View>
    </View>
  );
}

function Piece({ value, color, reduced }: { value: number; color: string; reduced: boolean }) {
  const grow = useSharedValue(value);

  useEffect(() => {
    grow.value = reduced ? value : withTiming(value, timing('slow'));
  }, [value, reduced, grow]);

  const growStyle = useAnimatedStyle(() => ({ flexGrow: grow.value }));
  return <Animated.View style={[styles.segment, { backgroundColor: color }, growStyle]} />;
}

const styles = StyleSheet.create((theme) => ({
  track: {
    height: 8,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.track,
    overflow: 'hidden',
  },
  row: {
    height: '100%',
    flexDirection: 'row',
    gap: theme.space[0.5],
  },
  segment: {
    flexBasis: 0,
    height: '100%',
  },
}));
