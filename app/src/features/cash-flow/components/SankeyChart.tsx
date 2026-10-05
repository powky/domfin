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
import { formatCurrency, formatPercent } from '@/lib/format';

import { buildFlowGraph, type FlowGrouping } from '../lib/buildFlow';
import { layoutSankey, type SankeyNode } from '../lib/sankey';
import type { CashFlowSummary } from '../types';

const NODE_WIDTH = 8;
// Two lines of caption: the name, then the amount and its share.
const LABEL_HEIGHT = 36;
const LABEL_WIDTH = 170;
const LABEL_GAP = 8;
const GAP = 6;
// The Income label sits above its node: two lines of caption and a gap.
const TOP_LABEL_HEIGHT = 44;
// Extra room beyond the label slots so the large flows read as thick ribbons.
const FLOW_ROOM = 200;
const PADDING = { top: TOP_LABEL_HEIGHT + 4, right: LABEL_WIDTH + LABEL_GAP, bottom: 4, left: LABEL_WIDTH + LABEL_GAP };

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

  const minWidth = graph.columns > 3 ? 1040 : 720;
  const width = Math.max(containerWidth, minWidth);
  const busiestColumn = Math.max(
    ...Array.from({ length: graph.columns }, (_, column) => graph.nodes.filter((node) => node.column === column).length),
  );
  const height = PADDING.top + PADDING.bottom + busiestColumn * (LABEL_HEIGHT + GAP) + FLOW_ROOM;

  const layout = useMemo(
    () =>
      containerWidth > 0
        ? layoutSankey(graph.nodes, graph.links, {
            width,
            height,
            nodeWidth: NODE_WIDTH,
            labelHeight: LABEL_HEIGHT,
            gap: GAP,
            padding: PADDING,
          })
        : null,
    [graph, width, height, containerWidth],
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
              <NodeLabel key={node.id} node={node} meta={graph.meta[node.id]} reveal={reveal} at={node.x0 / width} />
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
  /** Where the node sits across the chart, 0..1: its label shows once the drawing gets there. */
  at: number;
};

/**
 * A node's name in bold, and below it its amount with its share of income:
 * "Salary" over "RD$6,928,995.13 (29.1%)". Income, the whole, shows only
 * its amount.
 */
function NodeLabel({ node, meta, reveal, at }: NodeLabelProps) {
  const { t } = useTranslation();
  const centerY = (node.y0 + node.y1) / 2;
  const fade = useAnimatedStyle(() => ({ opacity: Math.min(Math.max((reveal.value - at) * 6, 0), 1) }));

  if (node.label === 'top') {
    return (
      <Animated.View
        style={[styles.topLabel, { left: node.x0 - LABEL_WIDTH / 2, top: node.y0 - TOP_LABEL_HEIGHT }, fade]}
      >
        <Text variant="captionStrong" numberOfLines={1} style={styles.line}>
          {meta.title}
        </Text>
        <Text variant="caption" tone="secondary" numberOfLines={1} style={styles.line}>
          {formatCurrency(meta.amount)}
        </Text>
      </Animated.View>
    );
  }

  const isLeft = node.label === 'left';
  const position = isLeft
    ? { left: node.x0 - LABEL_GAP - LABEL_WIDTH, alignItems: 'flex-end' as const }
    : { left: node.x1 + LABEL_GAP, alignItems: 'flex-start' as const };

  return (
    <Animated.View style={[styles.sideLabel, position, { top: centerY - LABEL_HEIGHT / 2 }, fade]}>
      <Text variant="captionStrong" numberOfLines={1} style={styles.line}>
        {meta.title}
      </Text>
      <Text variant="caption" tone="secondary" numberOfLines={1} style={styles.line}>
        {t('cashFlow.amountShare', { amount: formatCurrency(meta.amount), percent: formatPercent(meta.share) })}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create(() => ({
  topLabel: {
    position: 'absolute',
    pointerEvents: 'none',
    width: LABEL_WIDTH + NODE_WIDTH,
    alignItems: 'center',
  },
  sideLabel: {
    position: 'absolute',
    pointerEvents: 'none',
    width: LABEL_WIDTH,
    height: LABEL_HEIGHT,
    justifyContent: 'center',
  },
  // A long name gives way within the label's width.
  line: {
    maxWidth: '100%',
  },
}));
