/**
 * Minimal, dependency-free Sankey layout for a left-to-right flow with a
 * fixed column per node. Nodes keep the order they are given in; each column
 * is scaled so node labels never overlap.
 */
export type LabelPlacement = 'left' | 'right' | 'top';

export type SankeyNodeInput = {
  id: string;
  column: number;
  color: string;
  label: LabelPlacement;
};

export type SankeyLinkInput = {
  source: string;
  target: string;
  value: number;
  color: string;
};

export type SankeyNode = SankeyNodeInput & {
  value: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
};

export type SankeyLink = SankeyLinkInput & {
  path: string;
};

export type SankeyLayoutOptions = {
  width: number;
  height: number;
  nodeWidth: number;
  /** Minimum vertical space a node with a side label needs. */
  labelHeight: number;
  /** How far above its node a top label starts (its box is `labelHeight` tall). */
  topLabelHeight?: number;
  gap: number;
  padding: { top: number; right: number; bottom: number; left: number };
  /**
   * Where a column shorter than the chart sits: centered (the default) or at
   * the top. At the top, a column between two others still moves down to the
   * weighted middle of the nodes it connects, so its ribbons curve.
   */
  align?: 'center' | 'top';
};

export type SankeyLayout = {
  nodes: SankeyNode[];
  links: SankeyLink[];
  /** How much shorter than `height` the drawing came out: the chart can drop it. */
  lift: number;
};

const MIN_BAR = 2;

export function layoutSankey(
  nodesIn: SankeyNodeInput[],
  linksIn: SankeyLinkInput[],
  options: SankeyLayoutOptions,
): SankeyLayout {
  const { width, height, nodeWidth, labelHeight, topLabelHeight = labelHeight, gap, padding, align = 'center' } = options;

  const inValue = new Map<string, number>();
  const outValue = new Map<string, number>();
  for (const link of linksIn) {
    outValue.set(link.source, (outValue.get(link.source) ?? 0) + link.value);
    inValue.set(link.target, (inValue.get(link.target) ?? 0) + link.value);
  }

  const columnCount = Math.max(...nodesIn.map((node) => node.column)) + 1;
  const columns: SankeyNodeInput[][] = Array.from({ length: columnCount }, () => []);
  for (const node of nodesIn) columns[node.column].push(node);

  const value = (id: string) => Math.max(inValue.get(id) ?? 0, outValue.get(id) ?? 0);
  const slotMin = (node: SankeyNodeInput) => (node.label === 'top' ? 0 : labelHeight);
  const available = height - padding.top - padding.bottom;

  // Largest scale (px per unit) that fits every column.
  const columnFits = (column: SankeyNodeInput[], k: number) =>
    column.reduce((total, node) => total + Math.max(value(node.id) * k, slotMin(node)), 0) +
      gap * (column.length - 1) <=
    available;

  const maxValue = Math.max(...nodesIn.map((node) => value(node.id)), 1);
  let lo = 0;
  let hi = available / maxValue;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (columns.every((column) => columnFits(column, mid))) lo = mid;
    else hi = mid;
  }
  const k = lo;

  const innerWidth = width - padding.left - padding.right;
  const step = columnCount > 1 ? (innerWidth - nodeWidth) / (columnCount - 1) : 0;

  const positioned = new Map<string, SankeyNode>();
  columns.forEach((column, columnIndex) => {
    const slots = column.map((node) => Math.max(value(node.id) * k, slotMin(node)));
    const used = slots.reduce((a, b) => a + b, 0) + gap * (column.length - 1);
    let y = padding.top + (align === 'top' ? 0 : (available - used) / 2);
    const x0 = padding.left + columnIndex * step;

    column.forEach((node, index) => {
      const bar = Math.max(value(node.id) * k, MIN_BAR);
      const y0 = y + (slots[index] - bar) / 2;
      positioned.set(node.id, { ...node, value: value(node.id), x0, x1: x0 + nodeWidth, y0, y1: y0 + bar });
      y += slots[index] + gap;
    });
  });

  // Top-aligned, the first ribbons into and out of a middle column would run
  // flat. Like a Sankey usually does, the column moves to the weighted middle
  // of the nodes it connects (within the chart), so the flow curves.
  if (align === 'top') {
    for (let index = 1; index < columnCount - 1; index++) {
      const ids = new Set(columns[index].map((node) => node.id));
      let sum = 0;
      let weight = 0;
      for (const link of linksIn) {
        const other = ids.has(link.target) ? link.source : ids.has(link.source) ? link.target : null;
        if (other === null || ids.has(other)) continue;
        const node = positioned.get(other)!;
        sum += ((node.y0 + node.y1) / 2) * link.value;
        weight += link.value;
      }
      if (weight === 0) continue;
      const placed = columns[index].map((node) => positioned.get(node.id)!);
      const top = Math.min(...placed.map((node) => node.y0));
      const bottom = Math.max(...placed.map((node) => node.y1));
      // A top label (Income's) stays above the first labels beside it.
      const firstLabels = [columns[index - 1][0], columns[index + 1][0]].map((node) => {
        const placedNode = positioned.get(node.id)!;
        return (placedNode.y0 + placedNode.y1) / 2 - labelHeight / 2;
      });
      const topLabels = placed.filter((node) => node.label === 'top');
      const labelRoom = topLabels.length
        ? Math.min(...firstLabels) - gap - Math.max(...topLabels.map((node) => node.y0 - topLabelHeight + labelHeight))
        : Infinity;
      const shift = Math.max(
        Math.min(sum / weight - (top + bottom) / 2, labelRoom, height - padding.bottom - bottom),
        0,
      );
      for (const node of placed) {
        node.y0 += shift;
        node.y1 += shift;
      }
    }
  }

  // A top label that moved down with its node leaves its room above the
  // columns empty: everything moves up into it, keeping the margin on top.
  let lift = 0;
  if (align === 'top') {
    const tops = [...positioned.values()].map((node) =>
      node.label === 'top' ? node.y0 - topLabelHeight : Math.min(node.y0, (node.y0 + node.y1) / 2 - labelHeight / 2),
    );
    lift = Math.max(Math.min(...tops) - (padding.top - topLabelHeight), 0);
    for (const node of positioned.values()) {
      node.y0 -= lift;
      node.y1 -= lift;
    }
  }

  // Stack links on each side of a node, ordered by the vertical position of
  // the node at the other end so ribbons do not cross unnecessarily.
  const sourceOffset = new Map<string, number>();
  const targetOffset = new Map<string, number>();
  const byTargetY = [...linksIn].sort(
    (a, b) => positioned.get(a.target)!.y0 - positioned.get(b.target)!.y0,
  );
  const sourceY = new Map<SankeyLinkInput, number>();
  for (const link of byTargetY) {
    const source = positioned.get(link.source)!;
    const offset = sourceOffset.get(link.source) ?? 0;
    sourceY.set(link, source.y0 + offset);
    sourceOffset.set(link.source, offset + link.value * k);
  }
  const bySourceY = [...linksIn].sort((a, b) => sourceY.get(a)! - sourceY.get(b)!);
  const targetY = new Map<SankeyLinkInput, number>();
  for (const link of bySourceY) {
    const target = positioned.get(link.target)!;
    const offset = targetOffset.get(link.target) ?? 0;
    targetY.set(link, target.y0 + offset);
    targetOffset.set(link.target, offset + link.value * k);
  }

  const links = linksIn.map((link) => {
    const source = positioned.get(link.source)!;
    const target = positioned.get(link.target)!;
    const thickness = Math.max(link.value * k, 0.5);
    const sy0 = sourceY.get(link)!;
    const ty0 = targetY.get(link)!;
    return { ...link, path: ribbonPath(source.x1, sy0, target.x0, ty0, thickness) };
  });

  return { nodes: [...positioned.values()], links, lift };
}

function ribbonPath(x0: number, y0: number, x1: number, y1: number, thickness: number) {
  const xm = (x0 + x1) / 2;
  return [
    `M${x0},${y0}`,
    `C${xm},${y0} ${xm},${y1} ${x1},${y1}`,
    `L${x1},${y1 + thickness}`,
    `C${xm},${y1 + thickness} ${xm},${y0 + thickness} ${x0},${y0 + thickness}`,
    'Z',
  ].join(' ');
}
