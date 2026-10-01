import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import Svg, { Path } from 'react-native-svg';

import { ease, timing, useEntranceDelay, useReducedMotion } from '@/components/motion';
import { motion } from '@/theme';

import { clamp01, lerp } from './morph';

export type DonutSegment = { id: string; value: number; color: string };

export type DonutChartProps = {
  segments: DonutSegment[];
  size: number;
  thickness: number;
  /** Gap between segments, in degrees. */
  gapDegrees?: number;
  children?: ReactNode;
};

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * Donut starting at 12 o'clock, clockwise, with small gaps between segments.
 * It sweeps in the first time and its segments slide to their new share when
 * the data changes.
 */
export function DonutChart({ segments, size, thickness, gapDegrees = 1.2, children }: DonutChartProps) {
  const { theme } = useUnistyles();
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const center = size / 2;
  const outer = size / 2;
  const inner = outer - thickness;
  const visible = segments.filter((segment) => segment.value > 0);
  const gap = visible.length > 1 ? gapDegrees : 0;

  const arcs: Arc[] = [];
  let angle = 0;
  for (const segment of visible) {
    const sweep = (segment.value / total) * 360;
    arcs.push({
      id: segment.id,
      color: segment.color,
      start: angle + gap / 2,
      end: angle + Math.max(sweep - gap / 2, gap / 2 + 0.01),
    });
    angle += sweep;
  }
  const { morph, progress, reveal } = useDonutMorph(arcs);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {total === 0 ? (
          <Path d={arcPath(center, outer, inner, 0, 359.99)} fill={theme.colors.track} />
        ) : (
          morph.arcs.map((arc) => (
            <MorphArc
              key={arc.id}
              arc={arc}
              generation={morph.generation}
              progress={progress}
              reveal={reveal}
              center={center}
              outer={outer}
              inner={inner}
            />
          ))
        )}
      </Svg>
      <View style={styles.center}>{children}</View>
    </View>
  );
}

type Arc = { id: string; color: string; start: number; end: number };

type ArcMorph = Arc & { from: [number, number]; exiting?: boolean };

type DonutMorphState = {
  signature: string;
  generation: number;
  startedAt: number;
  mode: 'draw' | 'morph';
  arcs: ArcMorph[];
};

const emptyMorph: DonutMorphState = { signature: '', generation: 0, startedAt: 0, mode: 'draw', arcs: [] };

function useDonutMorph(arcs: Arc[]) {
  const reduced = useReducedMotion();
  const entranceDelay = useEntranceDelay();
  const signature = JSON.stringify(arcs);
  const [morph, setMorph] = useState(emptyMorph);
  if (morph.signature !== signature) setMorph(nextDonutMorph(morph, arcs, signature));

  const progress = useSharedValue(0);
  const reveal = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (morph.generation === 0) return;
    progress.value = morph.generation;
    if (morph.mode === 'draw') {
      reveal.value = reduced ? 1 : 0;
      if (!reduced) reveal.value = withDelay(entranceDelay, withTiming(1, timing('draw')), ReduceMotion.Never);
    } else if (!reduced) {
      progress.value = morph.generation - 1;
      progress.value = withTiming(morph.generation, timing('morph'));
    }
    // Only a new morph starts an animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [morph.generation]);

  return { morph, progress, reveal };
}

/** Segments keep their place by id; new ones open from their start and gone ones close up. */
function nextDonutMorph(previous: DonutMorphState, arcs: Arc[], signature: string): DonutMorphState {
  const now = Date.now();
  if (previous.arcs.length === 0) {
    return {
      signature,
      generation: previous.generation + 1,
      startedAt: now,
      mode: 'draw',
      arcs: arcs.map((arc) => ({ ...arc, from: [arc.start, arc.end] })),
    };
  }
  const t = previous.mode === 'morph' ? ease.standard(clamp01((now - previous.startedAt) / motion.duration.morph)) : 1;
  const onScreen = new Map(
    previous.arcs.map((arc) => [
      arc.id,
      { arc, start: lerp(arc.from[0], arc.start, t), end: lerp(arc.from[1], arc.end, t) },
    ]),
  );
  const ids = new Set(arcs.map((arc) => arc.id));
  const leaving: ArcMorph[] = [...onScreen.values()]
    .filter(({ arc, start, end }) => !ids.has(arc.id) && end - start > 0.05)
    .map(({ arc, start, end }) => {
      const middle = (start + end) / 2;
      return { ...arc, from: [start, end], start: middle, end: middle, exiting: true };
    });
  const current: ArcMorph[] = arcs.map((arc) => {
    const known = onScreen.get(arc.id);
    return { ...arc, from: known ? [known.start, known.end] : [arc.start, arc.start] };
  });
  return { signature, generation: previous.generation + 1, startedAt: now, mode: 'morph', arcs: [...leaving, ...current] };
}

type MorphArcProps = {
  arc: ArcMorph;
  generation: number;
  progress: SharedValue<number>;
  /** Share of the circle drawn so far, clockwise from 12 o'clock. */
  reveal: SharedValue<number>;
  center: number;
  outer: number;
  inner: number;
};

function MorphArc({ arc, generation, progress, reveal, center, outer, inner }: MorphArcProps) {
  const [fromStart, fromEnd] = arc.from;
  const { start: toStart, end: toEnd } = arc;
  const animatedProps = useAnimatedProps(() => {
    const t = clamp01(progress.value - (generation - 1));
    const limit = reveal.value * 360;
    const start = lerp(fromStart, toStart, t);
    const end = Math.min(lerp(fromEnd, toEnd, t), limit);
    return { d: end - start > 0.01 ? arcPath(center, outer, inner, start, end) : '' };
  });
  return <AnimatedPath animatedProps={animatedProps} fill={arc.color} />;
}

function point(center: number, radius: number, degrees: number) {
  'worklet';
  const radians = ((degrees - 90) * Math.PI) / 180;
  return { x: center + radius * Math.cos(radians), y: center + radius * Math.sin(radians) };
}

function arcPath(center: number, outer: number, inner: number, start: number, end: number) {
  'worklet';
  const large = end - start > 180 ? 1 : 0;
  const o0 = point(center, outer, start);
  const o1 = point(center, outer, end);
  const i1 = point(center, inner, end);
  const i0 = point(center, inner, start);
  return [
    `M${o0.x},${o0.y}`,
    `A${outer},${outer} 0 ${large} 1 ${o1.x},${o1.y}`,
    `L${i1.x},${i1.y}`,
    `A${inner},${inner} 0 ${large} 0 ${i0.x},${i0.y}`,
    'Z',
  ].join(' ');
}

const styles = StyleSheet.create(() => ({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'none',
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
