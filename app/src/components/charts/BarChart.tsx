import { useEffect, useState } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import Svg, { G, Line, Rect } from 'react-native-svg';

import { ease, useEntranceDelay, useFadeInOnChange, useReducedMotion } from '@/components/motion';
import { Text } from '@/components/ui';
import { motion } from '@/theme';

import { clamp01, lerp } from './morph';

import { tickWidth } from './axis';

export type BarSeries = { id: string; color: string; values: number[] };

export type BarChartProps = {
  labels: string[];
  /** Stacked bottom-up in the given order. */
  series: BarSeries[];
  height?: number;
  formatTick: (value: number) => string;
  onBarPress?: (index: number) => void;
  accessibilityLabelForBar?: (index: number, total: number) => string;
  /** Highlights one bar by fading the others. */
  activeIndex?: number;
};

const AXIS_WIDTH = 48;
const X_AXIS_HEIGHT = 24;
const TOP_PADDING = 8;
/** Rough width of one caption character, to skip x labels that would overlap. */
const LABEL_CHAR_WIDTH = 7;
/** Bars growing in start one after another, spread over at most this share of the animation. */
const MAX_STAGGER = 0.35;

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedG = Animated.createAnimatedComponent(G);

export function BarChart({
  labels,
  series,
  height = 260,
  formatTick,
  onBarPress,
  accessibilityLabelForBar,
  activeIndex,
}: BarChartProps) {
  const { theme } = useUnistyles();
  const [width, setWidth] = useState(0);

  const totals = labels.map((_, index) => series.reduce((sum, s) => sum + (s.values[index] ?? 0), 0));
  const ticks = niceTicks(Math.max(...totals, 0));
  const max = ticks[ticks.length - 1] || 1;
  // Wide enough for the longest tick (RD$1.25M), plus the gap to the bars.
  const axisWidth = Math.max(AXIS_WIDTH, ...ticks.map((tick) => tickWidth(formatTick(tick)) + theme.space[2]));

  const plotHeight = height - X_AXIS_HEIGHT - TOP_PADDING;
  const plotWidth = Math.max(width - axisWidth, 0);
  const slot = labels.length ? plotWidth / labels.length : 0;
  const barWidth = Math.min(slot * 0.56, 44);
  const labelWidth = Math.max(0, ...labels.map((label) => label.length)) * LABEL_CHAR_WIDTH + 6;
  const labelStep = slot > 0 ? Math.max(1, Math.ceil(labelWidth / slot)) : 1;
  // Kept labels may be wider than their bar's slot, so center them over it.
  const labelBoxWidth = Math.max(slot, labelWidth);
  const y = (value: number) => TOP_PADDING + plotHeight - (value / max) * plotHeight;
  const baseline = y(0);

  // Every stacked piece, keyed by its bar's label so a month keeps its bar when the period changes.
  const seen = new Map<string, number>();
  const segments: Segment[] =
    width > 0
      ? labels.flatMap((label, index) => {
          const occurrence = seen.get(label) ?? 0;
          seen.set(label, occurrence + 1);
          const bar = occurrence ? `${label}#${occurrence}` : label;
          const x = axisWidth + slot * index + (slot - barWidth) / 2;
          const stack = series.filter((s) => (s.values[index] ?? 0) > 0);
          let base = 0;
          return stack.map((s, stackIndex) => {
            const value = s.values[index];
            const bottom = y(base);
            base += value;
            const isTop = stackIndex === stack.length - 1;
            return {
              key: `${bar}|${s.id}`,
              bar,
              index,
              color: s.color,
              rx: isTop ? 3 : 0,
              // A hairline gap between stacked pieces.
              gap: isTop ? 0 : 1,
              shape: { x, width: barWidth, top: y(base), bottom, opacity: 1 },
            };
          });
        })
      : [];
  const { morph, progress } = useBarMorph(segments, labels.length, width, height, baseline);
  // A new scale or new bars: the axis fades in while the bars morph.
  const axis = useFadeInOnChange(`${ticks.join()}|${labels.join()}`);

  const onLayout = (event: LayoutChangeEvent) => setWidth(Math.round(event.nativeEvent.layout.width));

  return (
    <View onLayout={onLayout} style={{ height }}>
      {width > 0 ? (
        <>
          <Svg width={width} height={height}>
            <AnimatedG animatedProps={axis.props}>
              {ticks.map((tick) => (
                <Line
                  key={tick}
                  x1={axisWidth}
                  x2={width}
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke={theme.colors.border}
                  strokeWidth={1}
                />
              ))}
            </AnimatedG>
            {morph.segments.map((segment) => (
              <MorphRect
                key={segment.key}
                segment={segment}
                generation={morph.generation}
                progress={progress}
                dimmed={activeIndex !== undefined && !segment.exiting && segment.index !== activeIndex}
              />
            ))}
          </Svg>
          <Animated.View style={[styles.axis, axis.style]}>
            {ticks.map((tick) => (
              <View key={tick} style={[styles.tick, { top: y(tick) - 8, width: axisWidth - theme.space[2] }]}>
                <Text variant="caption" tone="secondary" align="right" numberOfLines={1}>
                  {formatTick(tick)}
                </Text>
              </View>
            ))}
          </Animated.View>
          {labels.map((label, index) => (
            <Pressable
              key={`${label}-${index}`}
              disabled={!onBarPress}
              onPress={() => onBarPress?.(index)}
              accessibilityRole="button"
              accessibilityLabel={accessibilityLabelForBar?.(index, totals[index]) ?? label}
              style={[styles.hitArea, { left: axisWidth + slot * index, width: slot, height }]}
            >
              <Animated.View
                style={[styles.xLabel, { width: labelBoxWidth, marginLeft: (slot - labelBoxWidth) / 2 }, axis.style]}
              >
                {index % labelStep === 0 ? (
                  <Text variant="caption" tone="secondary" align="center" numberOfLines={1}>
                    {label}
                  </Text>
                ) : null}
              </Animated.View>
            </Pressable>
          ))}
        </>
      ) : null}
    </View>
  );
}

type Shape = { x: number; width: number; top: number; bottom: number; opacity: number };

type Segment = { key: string; bar: string; index: number; color: string; rx: number; gap: number; shape: Shape };

/** A piece moving from one shape to another; `start` and `span` place it within the animation. */
type SegmentMorph = Omit<Segment, 'shape'> & {
  from: Shape;
  to: Shape;
  start: number;
  span: number;
  /** Gone from the data: it shrinks away and is dropped on the next change. */
  exiting?: boolean;
};

type BarMorphState = {
  signature: string;
  /** Morph n plays while progress goes from n - 1 to n (linearly; each piece eases itself). */
  generation: number;
  startedAt: number;
  duration: number;
  width: number;
  height: number;
  mode: 'grow' | 'morph' | 'jump';
  segments: SegmentMorph[];
};

const emptyMorph: BarMorphState = {
  signature: '',
  generation: 0,
  startedAt: 0,
  duration: 0,
  width: 0,
  height: 0,
  mode: 'jump',
  segments: [],
};

/** Eased progress of one piece at overall progress `t`. */
function pieceProgress(t: number, start: number, span: number) {
  'worklet';
  return ease.standard(clamp01((t - start) / span));
}

function lerpShape(a: Shape, b: Shape, t: number): Shape {
  return {
    x: lerp(a.x, b.x, t),
    width: lerp(a.width, b.width, t),
    top: lerp(a.top, b.top, t),
    bottom: lerp(a.bottom, b.bottom, t),
    opacity: lerp(a.opacity, b.opacity, t),
  };
}

/**
 * Keeps the bars in step with the data. The first time, they grow from the
 * baseline one after another; after that each piece morphs from where it is
 * on screen, new bars grow in place and bars that left shrink away.
 */
function useBarMorph(segments: Segment[], bars: number, width: number, height: number, baseline: number) {
  const reduced = useReducedMotion();
  const entranceDelay = useEntranceDelay();
  const signature = JSON.stringify(segments.map((s) => [s.key, s.color, s.rx, s.shape]));
  const [morph, setMorph] = useState(emptyMorph);
  if (morph.signature !== signature) {
    setMorph(nextBarMorph(morph, segments, bars, signature, width, height, baseline));
  }

  const progress = useSharedValue(0);

  useEffect(() => {
    if (morph.generation === 0) return;
    if (reduced || morph.mode === 'jump') {
      progress.value = morph.generation;
      return;
    }
    progress.value = morph.generation - 1;
    const animation = withTiming(morph.generation, {
      duration: morph.duration,
      easing: Easing.linear,
      reduceMotion: ReduceMotion.Never,
    });
    progress.value = morph.mode === 'grow' ? withDelay(entranceDelay, animation, ReduceMotion.Never) : animation;
    // Only a new morph starts an animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [morph.generation]);

  return { morph, progress };
}

function nextBarMorph(
  previous: BarMorphState,
  segments: Segment[],
  bars: number,
  signature: string,
  width: number,
  height: number,
  baseline: number,
): BarMorphState {
  const now = Date.now();
  const first = previous.segments.length === 0;
  const resized = !first && (width !== previous.width || height !== previous.height);
  const collapsed = (shape: Shape, at: number): Shape => ({ ...shape, top: at, bottom: at });

  if (first || resized) {
    const stagger = bars > 1 ? Math.min(0.04, MAX_STAGGER / (bars - 1)) : 0;
    const span = 1 - stagger * Math.max(bars - 1, 0);
    return {
      signature,
      generation: previous.generation + 1,
      startedAt: now,
      duration: motion.duration.draw,
      width,
      height,
      mode: first ? 'grow' : 'jump',
      segments: segments.map((segment) => ({
        ...segment,
        from: first ? collapsed(segment.shape, baseline) : segment.shape,
        to: segment.shape,
        start: first ? segment.index * stagger : 0,
        span: first ? span : 1,
      })),
    };
  }

  // Where each piece is right now, estimated from the clock (a morph may be mid-way).
  const t = previous.duration > 0 ? clamp01((now - previous.startedAt) / previous.duration) : 1;
  const onScreen = new Map(
    previous.segments.map((segment) => [
      segment.key,
      { segment, shape: lerpShape(segment.from, segment.to, pieceProgress(t, segment.start, segment.span)) },
    ]),
  );
  const previousBars = new Set(previous.segments.filter((s) => !s.exiting).map((s) => s.bar));
  const keys = new Set(segments.map((s) => s.key));

  const current: SegmentMorph[] = segments.map((segment) => {
    const known = onScreen.get(segment.key);
    const from = known
      ? known.shape
      : // A new piece in a bar that stays grows from the top of the piece under it; a new bar from the baseline.
        collapsed(segment.shape, previousBars.has(segment.bar) ? segment.shape.bottom : baseline);
    return { ...segment, from, to: segment.shape, start: 0, span: 1 };
  });
  const leaving: SegmentMorph[] = [...onScreen.values()]
    .filter(({ segment, shape }) => !keys.has(segment.key) && shape.bottom - shape.top > 0.5 && shape.opacity > 0.01)
    .map(({ segment, shape }) => ({
      ...segment,
      from: shape,
      to: { ...collapsed(shape, baseline), opacity: 0 },
      start: 0,
      span: 1,
      exiting: true,
    }));

  return {
    signature,
    generation: previous.generation + 1,
    startedAt: now,
    duration: motion.duration.morph,
    width,
    height,
    mode: 'morph',
    // Leaving pieces first, so they sink behind the ones that stay.
    segments: [...leaving, ...current],
  };
}

type MorphRectProps = {
  segment: SegmentMorph;
  generation: number;
  progress: SharedValue<number>;
  dimmed: boolean;
};

function MorphRect({ segment, generation, progress, dimmed }: MorphRectProps) {
  const { from, to, start, span, gap } = segment;
  const animatedProps = useAnimatedProps(() => {
    const t = pieceProgress(clamp01(progress.value - (generation - 1)), start, span);
    const top = lerp(from.top, to.top, t);
    const bottom = lerp(from.bottom, to.bottom, t);
    return {
      x: lerp(from.x, to.x, t),
      y: top,
      width: lerp(from.width, to.width, t),
      height: Math.max(bottom - top - gap, 0),
      opacity: lerp(from.opacity, to.opacity, t) * (dimmed ? 0.35 : 1),
    };
  });
  return <AnimatedRect animatedProps={animatedProps} rx={segment.rx} fill={segment.color} />;
}

/** 0-based ticks with a 1/2/2.5/5 × 10^n step, about four intervals. */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0];
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((candidate) => candidate >= rough) ?? rough;
  const count = Math.ceil(max / step);
  return Array.from({ length: count + 1 }, (_, i) => i * step);
}

const styles = StyleSheet.create((theme) => ({
  axis: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'none',
  },
  tick: {
    position: 'absolute',
    pointerEvents: 'none',
    left: 0,
  },
  hitArea: {
    position: 'absolute',
    top: 0,
    justifyContent: 'flex-end',
  },
  xLabel: {
    height: X_AXIS_HEIGHT,
    justifyContent: 'flex-end',
  },
}));
