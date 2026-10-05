import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import Svg, { Path, Rect } from 'react-native-svg';

import { Wipe, timing, useEntranceDelay, useReducedMotion } from '@/components/motion';
import { Text } from '@/components/ui';
import { formatCurrency, formatPercent, formatWholeCurrency } from '@/lib/format';

import { buildFlowGraph, type FlowGrouping } from '../lib/buildFlow';
import { layoutSankey, type SankeyNode } from '../lib/sankey';
import type { CashFlowSummary } from '../types';

/** Sizes of one way of drawing the chart. */
type Metrics = {
  nodeWidth: number;
  /** Two lines of caption: the name, then the amount and its share. */
  labelHeight: number;
  labelGap: number;
  gap: number;
  /** The Income label sits above its node: two lines of caption and a gap. */
  topLabelHeight: number;
  /** Extra room beyond the label slots so the large flows read as thick ribbons. */
  flowRoom: number;
  /** Room on each side for the labels outside the chart; 0 puts them inside. */
  gutter: number;
};

// Labels beside the chart, which scrolls sideways when the card is narrower.
const FULL: Metrics = { nodeWidth: 8, labelHeight: 36, labelGap: 8, gap: 6, topLabelHeight: 44, flowRoom: 200, gutter: 170 };
// Phones: the chart fits the card and the labels go inside, over the ribbons.
const COMPACT: Metrics = { nodeWidth: 6, labelHeight: 32, labelGap: 6, gap: 6, topLabelHeight: 40, flowRoom: 112, gutter: 0 };
/** Narrowest card for the labels beside the chart without scrolling, with three columns. */
const FULL_WIDTH = 720;

/** Room around the chart: the Income label on top, the labels outside on each side. */
const paddingOf = (metrics: Metrics) => {
  const side = metrics.gutter && metrics.gutter + metrics.labelGap;
  return { top: metrics.topLabelHeight + 4, right: side, bottom: 4, left: side };
};

export type SankeyChartProps = {
  summary: CashFlowSummary;
  grouping: FlowGrouping;
};

export function SankeyChart({ summary, grouping }: SankeyChartProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const [containerWidth, setContainerWidth] = useState(0);
  const incomeLabel = t('cashFlow.income');
  const savingsLabel = t('cashFlow.savings');
  const investmentsLabel = t('cashFlow.investments');
  const loansLabel = t('cashFlow.loans');
  const drawnLabel = t('cashFlow.drawn');

  const graph = useMemo(
    () =>
      buildFlowGraph(summary, grouping, theme, {
        income: incomeLabel,
        savings: savingsLabel,
        investments: investmentsLabel,
        loans: loansLabel,
        drawn: drawnLabel,
      }),
    [summary, grouping, theme, incomeLabel, savingsLabel, investmentsLabel, loansLabel, drawnLabel],
  );

  // Three columns fit a phone with their labels inside; four keep the full chart and scroll.
  const compact = containerWidth > 0 && containerWidth < FULL_WIDTH && graph.columns <= 3;
  const metrics = compact ? COMPACT : FULL;
  const minWidth = compact ? 0 : graph.columns > 3 ? 1040 : FULL_WIDTH;
  const width = Math.max(containerWidth, minWidth);
  const busiestColumn = Math.max(
    ...Array.from({ length: graph.columns }, (_, column) => graph.nodes.filter((node) => node.column === column).length),
  );
  const padding = paddingOf(metrics);
  const height = padding.top + padding.bottom + busiestColumn * (metrics.labelHeight + metrics.gap) + metrics.flowRoom;
  // Inside the chart, a label fills the space between its node and the next column.
  const columnStep = graph.columns > 1 ? (width - padding.left - padding.right - metrics.nodeWidth) / (graph.columns - 1) : width;
  const labelWidth = compact ? columnStep - metrics.nodeWidth - 2 * metrics.labelGap : metrics.gutter;

  const layout = useMemo(
    () =>
      containerWidth > 0
        ? layoutSankey(graph.nodes, graph.links, {
            width,
            height,
            nodeWidth: metrics.nodeWidth,
            labelHeight: metrics.labelHeight,
            gap: metrics.gap,
            padding: paddingOf(metrics),
            // Inside a phone's card the columns start together at the top, with no gap above.
            align: compact ? 'top' : 'center',
          })
        : null,
    [graph, width, height, containerWidth, metrics, compact],
  );

  const reveal = useFlowReveal(graph);

  const onLayout = (event: LayoutChangeEvent) => setContainerWidth(Math.round(event.nativeEvent.layout.width));

  return (
    <View onLayout={onLayout}>
      {layout ? (
        <ScrollView horizontal scrollEnabled={width > containerWidth} showsHorizontalScrollIndicator={width > containerWidth}>
          <View style={{ width, height }}>
            <Wipe reveal={reveal} width={width}>
              <Svg width={width} height={height}>
                {layout.links.map((link) => (
                  <Path key={`${link.source}->${link.target}`} d={link.path} fill={link.color} />
                ))}
                {layout.nodes.map((node) => (
                  <Rect
                    key={node.id}
                    x={node.x0}
                    y={node.y0}
                    width={node.x1 - node.x0}
                    height={node.y1 - node.y0}
                    rx={2}
                    fill={node.color}
                  />
                ))}
              </Svg>
            </Wipe>
            {layout.nodes.map((node) => (
              <NodeLabel
                key={node.id}
                node={node}
                meta={graph.meta[node.id]}
                reveal={reveal}
                chartWidth={width}
                metrics={metrics}
                labelWidth={labelWidth}
                inside={compact}
              />
            ))}
          </View>
        </ScrollView>
      ) : (
        <View style={{ height }} />
      )}
    </View>
  );
}

/**
 * Draws the flow left to right, like money moving through it: on first show
 * and again whenever the grouping changes. Returns how much is drawn, 0..1.
 */
function useFlowReveal(graph: unknown) {
  const reduced = useReducedMotion();
  const entranceDelay = useEntranceDelay();
  const reveal = useSharedValue(reduced ? 1 : 0);
  const first = useRef(true);

  useEffect(() => {
    if (reduced) {
      reveal.value = 1;
      return;
    }
    reveal.value = 0;
    reveal.value = withDelay(first.current ? entranceDelay : 0, withTiming(1, timing('draw')), ReduceMotion.Never);
    first.current = false;
    // Redraws for a new graph only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  return reveal;
}

type NodeLabelProps = {
  node: SankeyNode;
  meta: { title: string; amount: number; share: number };
  reveal: SharedValue<number>;
  chartWidth: number;
  metrics: Metrics;
  labelWidth: number;
  /** Labels over the ribbons, next to their node on the inner side (phones). */
  inside: boolean;
};

/**
 * A node's name in bold, and below it its amount with its share of income:
 * "Salary" over "RD$6,928,995.13 (29.1%)". Income, the whole, shows only
 * its amount. Inside the chart the amounts drop the cents, and a halo of the
 * card's color keeps the text clear of the ribbons under it.
 */
function NodeLabel({ node, meta, reveal, chartWidth, metrics, labelWidth, inside }: NodeLabelProps) {
  const { t } = useTranslation();
  const amount = inside ? formatWholeCurrency(meta.amount) : formatCurrency(meta.amount);
  const lines = [styles.line, inside && styles.halo];

  let position: { left: number; top: number; width: number; alignItems: 'flex-start' | 'center' | 'flex-end' };
  if (node.label === 'top') {
    const width = inside ? Math.min(2 * labelWidth, chartWidth) : labelWidth + metrics.nodeWidth;
    const left = node.x0 + metrics.nodeWidth / 2 - width / 2;
    position = { left: Math.min(Math.max(left, 0), chartWidth - width), top: node.y0 - metrics.topLabelHeight, width, alignItems: 'center' };
  } else {
    // Sources sit at the left edge and destinations at the right: inside the
    // chart their labels face each other, outside they face away.
    const before = (node.label === 'left') !== inside;
    const left = before ? node.x0 - metrics.labelGap - labelWidth : node.x1 + metrics.labelGap;
    const top = (node.y0 + node.y1) / 2 - metrics.labelHeight / 2;
    position = { left, top, width: labelWidth, alignItems: before ? 'flex-end' : 'flex-start' };
  }
  // It shows once the drawing reaches it.
  const at = Math.max(position.left, 0) / chartWidth;
  const fade = useAnimatedStyle(() => ({ opacity: Math.min(Math.max((reveal.value - at) * 6, 0), 1) }));

  return (
    <Animated.View
      style={[styles.label, node.label === 'top' ? null : { height: metrics.labelHeight }, position, fade]}
    >
      <Text variant="captionStrong" numberOfLines={1} style={lines}>
        {meta.title}
      </Text>
      <Text variant="caption" tone="secondary" numberOfLines={1} style={lines}>
        {node.label === 'top' ? amount : t('cashFlow.amountShare', { amount, percent: formatPercent(meta.share) })}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme) => ({
  label: {
    position: 'absolute',
    pointerEvents: 'none',
    justifyContent: 'center',
  },
  // A long name gives way within the label's width.
  line: {
    maxWidth: '100%',
  },
  halo: {
    textShadowColor: theme.colors.surface,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 3,
  },
}));
