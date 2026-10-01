import { useEffect, useId, useRef, useState } from 'react';
import { Platform, Pressable, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import Svg, { Circle, ClipPath, Defs, G, Line, Path, Rect } from 'react-native-svg';

import { ease, timing, useEntranceDelay, useFadeInOnChange, useReducedMotion } from '@/components/motion';
import { ColorSwatch, Text } from '@/components/ui';
import { motion } from '@/theme';

import {
  areaPath,
  clamp01,
  curvePath,
  flatten,
  lerp,
  lerpCurve,
  monotoneCurve,
  resample,
  resampledPoint,
  segmentCount,
  type Curve,
} from './morph';

import { tickWidth } from './axis';

export type LineSeries = { id: string; label: string; color: string; values: number[] };

export type LineChartProps = {
  /** One axis label per point. Labels are thinned out when they would overlap. */
  labels: string[];
  series: LineSeries[];
  formatTick: (value: number) => string;
  formatValue: (value: number) => string;
  /** Tooltip heading for a point. Defaults to its axis label. */
  formatTitle?: (index: number) => string;
  /** Soft flat fill under the first series, meant for single-series charts. */
  area?: boolean;
  /** Defaults to a height that grows with the width. */
  height?: number;
  accessibilityLabel?: string;
};

const AXIS_WIDTH = 48;
const AXIS_GAP = 8;
const X_AXIS_HEIGHT = 28;
const TOP_PADDING = 10;
/** Room for the last dot at the right edge. */
const END_INSET = 8;
const AREA_OPACITY = 0.11;
const X_LABEL_WIDTH = 64;
const MIN_LABEL_SPACING = 56;
const TOOLTIP_OFFSET = 12;
const HOVER_OUT_DELAY = 80;

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedG = Animated.createAnimatedComponent(G);

export function LineChart({
  labels,
  series,
  formatTick,
  formatValue,
  formatTitle = (index) => labels[index],
  area,
  height: fixedHeight,
  accessibilityLabel,
}: LineChartProps) {
  const { theme } = useUnistyles();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const [tooltipWidth, setTooltipWidth] = useState(0);
  const hoverOut = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close to square on phones, capped on wide screens.
  const height = fixedHeight ?? Math.round(Math.min(Math.max(width * 0.9, 240), 320));
  const plotBottom = height - X_AXIS_HEIGHT;
  const count = labels.length;
  const scale = niceScale(series.flatMap((s) => s.values));
  const axisWidth = Math.max(AXIS_WIDTH, ...scale.ticks.map((tick) => tickWidth(formatTick(tick))));
  const left = axisWidth + AXIS_GAP;
  const right = width - END_INSET;
  const step = count > 1 ? (right - left) / (count - 1) : right - left;
  const x = (index: number) => (count > 1 ? left + step * index : (left + right) / 2);

  const y = (value: number) =>
    plotBottom - ((value - scale.min) / (scale.max - scale.min)) * (plotBottom - TOP_PADDING);

  const labelEvery = Math.max(1, Math.ceil(MIN_LABEL_SPACING / Math.max(step, 1)));
  const activeIndex = active !== null && active < count ? active : null;

  const shapes: SeriesShape[] =
    width > 0 && count > 0
      ? series.map((s) => {
          const points = s.values.map((value, i) => [x(i), y(value)] as [number, number]);
          return { id: s.id, color: s.color, points, curve: monotoneCurve(points) };
        })
      : [];
  const { morph, progress, reveal } = useLineMorph(shapes, width, height, plotBottom);
  const clipId = `line-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const clipProps = useAnimatedProps(() => ({ width: reveal.value * width }));
  // A new scale or new months: the axis fades in while the lines morph.
  const axis = useFadeInOnChange(`${scale.ticks.join()}|${labels.join()}`);

  const show = (index: number) => {
    if (hoverOut.current) clearTimeout(hoverOut.current);
    setActive(index);
  };
  const hide = () => {
    if (hoverOut.current) clearTimeout(hoverOut.current);
    hoverOut.current = setTimeout(() => setActive(null), HOVER_OUT_DELAY);
  };
  // Touch has no hover: tapping the open point again closes its tooltip.
  const press = (index: number) =>
    Platform.OS === 'web' ? show(index) : setActive((current) => (current === index ? null : index));

  const onLayout = (event: LayoutChangeEvent) => setWidth(Math.round(event.nativeEvent.layout.width));

  const describe = (index: number) =>
    `${formatTitle(index)}: ${series.map((s) => `${s.label} ${formatValue(s.values[index])}`).join(', ')}`;

  const main = morph.series.find((shape) => !shape.leaving);

  return (
    <View onLayout={onLayout} style={{ height }} accessibilityLabel={accessibilityLabel}>
      {width > 0 && count > 0 ? (
        <>
          <Svg width={width} height={height}>
            <Defs>
              <ClipPath id={clipId}>
                <AnimatedRect x={0} y={0} height={height} animatedProps={clipProps} />
              </ClipPath>
            </Defs>
            <AnimatedG animatedProps={axis.props}>
              {scale.ticks.map((tick) => (
                <Line
                  key={tick}
                  x1={x(0)}
                  x2={x(count - 1)}
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke={theme.colors.border}
                  strokeWidth={1}
                />
              ))}
            </AnimatedG>
            {activeIndex !== null ? (
              <Line
                x1={x(activeIndex)}
                x2={x(activeIndex)}
                y1={TOP_PADDING}
                y2={plotBottom}
                stroke={theme.colors.borderStrong}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            ) : null}
            <G clipPath={`url(#${clipId})`}>
              {area && main ? (
                <MorphPath shape={main} generation={morph.generation} progress={progress} baseline={plotBottom} />
              ) : null}
              {morph.series.map((shape) => (
                <MorphPath key={shape.id} shape={shape} generation={morph.generation} progress={progress} />
              ))}
              {morph.series.map((shape) =>
                shape.dots.map((dot, i) => (
                  <MorphDot
                    key={`${shape.id}-${i}`}
                    dot={dot}
                    generation={morph.generation}
                    progress={progress}
                    r={i === activeIndex ? 6 : 4.5}
                    fill={shape.color}
                    stroke={theme.colors.surface}
                  />
                )),
              )}
            </G>
          </Svg>

          <Animated.View style={[styles.axis, axis.style]}>
            {scale.ticks.map((tick) => (
              <View key={tick} style={[styles.tick, { top: y(tick) - 8, width: axisWidth }]}>
                <Text variant="caption" tone="secondary" align="right" numberOfLines={1}>
                  {formatTick(tick)}
                </Text>
              </View>
            ))}

            {labels.map((label, i) => {
              if (i % labelEvery !== 0) return null;
              const centered = x(i) - X_LABEL_WIDTH / 2;
              const clamped = Math.min(Math.max(centered, 0), width - X_LABEL_WIDTH);
              const align = clamped > centered ? 'left' : clamped < centered ? 'right' : 'center';
              return (
                <View key={`${label}-${i}`} style={[styles.xLabel, { left: clamped, top: plotBottom + 8 }]}>
                  <Text variant="caption" tone="secondary" align={align} numberOfLines={1}>
                    {label}
                  </Text>
                </View>
              );
            })}
          </Animated.View>

          {labels.map((label, i) => (
            <Pressable
              key={`hit-${label}-${i}`}
              onHoverIn={() => show(i)}
              onHoverOut={hide}
              onFocus={() => show(i)}
              onBlur={hide}
              onPress={() => press(i)}
              accessibilityLabel={describe(i)}
              style={[styles.hitArea, { left: x(i) - step / 2, width: step, height: plotBottom }]}
            />
          ))}

          {activeIndex !== null ? (
            <View
              onLayout={(event) => setTooltipWidth(Math.round(event.nativeEvent.layout.width))}
              style={[
                styles.tooltip,
                {
                  opacity: tooltipWidth ? 1 : 0,
                  left: tooltipLeft(x(activeIndex), tooltipWidth, width),
                },
              ]}
            >
              <Text variant="caption" tone="secondary">
                {formatTitle(activeIndex)}
              </Text>
              {series.map((s) => (
                <View key={s.id} style={styles.tooltipRow}>
                  <ColorSwatch color={s.color} />
                  <Text variant="caption" numberOfLines={1} style={styles.tooltipLabel}>
                    {s.label}
                  </Text>
                  <Text variant="captionStrong">{formatValue(s.values[activeIndex])}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

type SeriesShape = { id: string; color: string; points: [number, number][]; curve: Curve };

/** One series mid-morph: both curves have the same segment count. */
type SeriesMorph = {
  id: string;
  color: string;
  from: Curve;
  to: Curve;
  dots: { from: [number, number]; to: [number, number] }[];
  /** No longer in the data: it melts into the main line and fades out. */
  leaving?: boolean;
};

type MorphState = {
  signature: string;
  /** Bumped on every change; morph n plays while progress goes from n - 1 to n. */
  generation: number;
  startedAt: number;
  width: number;
  height: number;
  /** How the change is shown: drawn left to right, morphed, or swapped at once (resizes). */
  mode: 'draw' | 'morph' | 'jump';
  series: SeriesMorph[];
};

const emptyMorph: MorphState = { signature: '', generation: 0, startedAt: 0, width: 0, height: 0, mode: 'jump', series: [] };

/**
 * Keeps the drawn lines in step with the data. The first time there is data
 * the lines draw themselves left to right; after that every change morphs
 * from what's on screen (even mid-morph) to the new lines. A new series grows
 * out of the previous main line (or the baseline) and a series that's gone
 * melts into the new main line, so one line can split into many and back.
 */
function useLineMorph(shapes: SeriesShape[], width: number, height: number, baseline: number) {
  const reduced = useReducedMotion();
  const entranceDelay = useEntranceDelay();
  const signature = JSON.stringify(shapes.map((shape) => [shape.id, shape.curve]));
  const [morph, setMorph] = useState(emptyMorph);
  if (morph.signature !== signature) setMorph(nextMorph(morph, shapes, signature, width, height, baseline));

  const progress = useSharedValue(0);
  const reveal = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (morph.generation === 0) return;
    progress.value = morph.generation;
    if (morph.mode === 'draw') {
      reveal.value = reduced ? 1 : 0;
      if (!reduced) reveal.value = withDelay(entranceDelay, withTiming(1, timing('draw')), ReduceMotion.Never);
    } else if (morph.mode === 'morph' && !reduced) {
      progress.value = morph.generation - 1;
      progress.value = withTiming(morph.generation, timing('morph'));
    }
    // Only a new morph starts an animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [morph.generation]);

  return { morph, progress, reveal };
}

function nextMorph(
  previous: MorphState,
  shapes: SeriesShape[],
  signature: string,
  width: number,
  height: number,
  baseline: number,
): MorphState {
  const now = Date.now();
  const first = previous.series.length === 0;
  const resized = !first && (width !== previous.width || height !== previous.height);
  // What's on screen right now, estimated from the clock (a morph may be mid-way).
  const t =
    previous.mode === 'morph' ? ease.standard(clamp01((now - previous.startedAt) / motion.duration.morph)) : 1;
  const staying = previous.series.filter((s) => !s.leaving);
  const onScreen = new Map(staying.map((s) => [s.id, lerpCurve(s.from, s.to, t)]));
  const main = staying[0] ? onScreen.get(staying[0].id) : undefined;

  const series = shapes.map((shape): SeriesMorph => {
    const origin =
      first || resized ? shape.curve : (onScreen.get(shape.id) ?? main ?? flatten(shape.curve, baseline));
    const segments = Math.max(segmentCount(origin), segmentCount(shape.curve));
    const from = resample(origin, segments);
    const to = resample(shape.curve, segments);
    const own = segmentCount(shape.curve);
    return {
      id: shape.id,
      color: shape.color,
      from,
      to,
      dots: shape.points.map((point, i) => {
        const k = resampledPoint(i, own, segments);
        return { from: [from[6 * k], from[6 * k + 1]], to: point };
      }),
    };
  });

  const ids = new Set(shapes.map((shape) => shape.id));
  const leaving =
    first || resized
      ? []
      : staying
          .filter((s) => !ids.has(s.id))
          .map((s): SeriesMorph => {
            const origin = onScreen.get(s.id)!;
            const destination = shapes[0]?.curve ?? flatten(origin, baseline);
            const segments = Math.max(segmentCount(origin), segmentCount(destination));
            return {
              id: s.id,
              color: s.color,
              from: resample(origin, segments),
              to: resample(destination, segments),
              dots: [],
              leaving: true,
            };
          });

  return {
    signature,
    generation: previous.generation + 1,
    startedAt: now,
    width,
    height,
    mode: first ? 'draw' : resized ? 'jump' : 'morph',
    // Leaving lines first, so they sink behind the ones that stay.
    series: [...leaving, ...series],
  };
}

type MorphPathProps = {
  shape: SeriesMorph;
  generation: number;
  progress: SharedValue<number>;
  /** Draws the area down to this line instead of the line itself. */
  baseline?: number;
};

function MorphPath({ shape, generation, progress, baseline }: MorphPathProps) {
  const { from, to, leaving } = shape;
  const animatedProps = useAnimatedProps(() => {
    const t = clamp01(progress.value - (generation - 1));
    const curve = lerpCurve(from, to, t);
    return {
      d: baseline === undefined ? curvePath(curve) : areaPath(curve, baseline),
      opacity: leaving ? 1 - t : 1,
    };
  });
  return baseline === undefined ? (
    <AnimatedPath
      animatedProps={animatedProps}
      stroke={shape.color}
      strokeWidth={2.5}
      strokeLinejoin="round"
      strokeLinecap="round"
      fill="none"
    />
  ) : (
    <AnimatedPath animatedProps={animatedProps} fill={shape.color} fillOpacity={AREA_OPACITY} />
  );
}

type MorphDotProps = {
  dot: SeriesMorph['dots'][number];
  generation: number;
  progress: SharedValue<number>;
  r: number;
  fill?: string;
  stroke: string;
};

function MorphDot({ dot, generation, progress, r, fill, stroke }: MorphDotProps) {
  const [fromX, fromY] = dot.from;
  const [toX, toY] = dot.to;
  const animatedProps = useAnimatedProps(() => {
    const t = clamp01(progress.value - (generation - 1));
    return { cx: lerp(fromX, toX, t), cy: lerp(fromY, toY, t) };
  });
  return <AnimatedCircle animatedProps={animatedProps} r={r} fill={fill} stroke={stroke} strokeWidth={1.5} />;
}

/** Right of the point when it fits, otherwise to its left. */
function tooltipLeft(pointX: number, tooltipWidth: number, chartWidth: number) {
  const rightSide = pointX + TOOLTIP_OFFSET;
  if (rightSide + tooltipWidth <= chartWidth) return rightSide;
  return Math.max(pointX - TOOLTIP_OFFSET - tooltipWidth, 0);
}

/** Ticks with a 1/2/2.5/5 × 10^n step, about six intervals, not anchored at zero. */
function niceScale(values: number[]): { min: number; max: number; ticks: number[] } {
  if (values.length === 0) return { min: 0, max: 1, ticks: [0, 1] };
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    const pad = Math.abs(min) * 0.05 || 1;
    min -= pad;
    max += pad;
  }
  const rough = (max - min) / 6;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((candidate) => candidate >= rough) ?? rough;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let tick = lo; tick <= hi + step / 2; tick += step) ticks.push(Math.round(tick * 100) / 100);
  return { min: lo, max: hi, ticks };
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
  xLabel: {
    position: 'absolute',
    pointerEvents: 'none',
    width: X_LABEL_WIDTH,
  },
  hitArea: {
    position: 'absolute',
    top: 0,
  },
  tooltip: {
    position: 'absolute',
    pointerEvents: 'none',
    top: TOP_PADDING,
    minWidth: 160,
    maxWidth: 300,
    gap: theme.space[1],
    paddingVertical: theme.space[2],
    paddingHorizontal: theme.space[2.5],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: theme.layout.hairline,
    borderColor: theme.colors.border,
    shadowColor: theme.colors.text.primary,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  tooltipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[1.5],
  },
  tooltipLabel: {
    flex: 1,
    marginRight: theme.space[2],
  },
}));
