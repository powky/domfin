/**
 * Chart shapes that can morph into each other. A curve is a flat list of
 * cubic Bézier segments: [x0, y0, c1x, c1y, c2x, c2y, x1, y1, …], so point k
 * of the curve sits at indices 6k and 6k + 1.
 *
 * Two curves with different point counts morph by splitting segments of the
 * shorter one until both match. Splitting doesn't change a curve's shape, so
 * the last frame of a morph is exactly the new chart.
 */
export type Curve = number[];

export const segmentCount = (curve: Curve) => (curve.length - 2) / 6;

/**
 * Smooth curve through the points that never overshoots them: monotone cubic
 * interpolation (Steffen 1990), the same curve as d3's curveMonotoneX. Two
 * points make a straight segment and one point a zero-length one.
 */
export function monotoneCurve(points: [number, number][]): Curve {
  const n = points.length;
  if (n === 0) return [];
  if (n === 1) {
    const [x, y] = points[0];
    return [x, y, x, y, x, y, x, y];
  }
  if (n === 2) {
    const [[x0, y0], [x1, y1]] = points;
    const dx = (x1 - x0) / 3;
    const dy = (y1 - y0) / 3;
    return [x0, y0, x0 + dx, y0 + dy, x1 - dx, y1 - dy, x1, y1];
  }
  const sign = (v: number) => (v < 0 ? -1 : 1);
  const secants = points.slice(1).map(([px, py], i) => (py - points[i][1]) / (px - points[i][0]));
  const tangents = points.map((_, i) => {
    if (i === 0 || i === n - 1) return 0;
    const h0 = points[i][0] - points[i - 1][0];
    const h1 = points[i + 1][0] - points[i][0];
    const [s0, s1] = [secants[i - 1], secants[i]];
    const p = (s0 * h1 + s1 * h0) / (h0 + h1);
    return (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
  });
  // One-sided tangents at both ends.
  tangents[0] = (3 * secants[0] - tangents[1]) / 2;
  tangents[n - 1] = (3 * secants[n - 2] - tangents[n - 2]) / 2;

  const curve: Curve = [points[0][0], points[0][1]];
  for (let i = 0; i < n - 1; i++) {
    const [[x0, y0], [x1, y1]] = [points[i], points[i + 1]];
    const third = (x1 - x0) / 3;
    curve.push(x0 + third, y0 + third * tangents[i], x1 - third, y1 - third * tangents[i + 1], x1, y1);
  }
  return curve;
}

/** How many pieces segment `index` of `from` segments becomes when resampled to `to` segments. */
const piecesBefore = (index: number, from: number, to: number) => Math.floor((index * to) / from);

/** Point `index` of a curve with `from` segments, once resampled to `to` segments. */
export const resampledPoint = (index: number, from: number, to: number) => piecesBefore(index, from, to);

/** Splits the curve's segments evenly until it has `count` of them (at least as many as now). */
export function resample(curve: Curve, count: number): Curve {
  const from = segmentCount(curve);
  if (from >= count || from === 0) return curve;
  const out: Curve = [curve[0], curve[1]];
  for (let s = 0; s < from; s++) {
    const pieces = piecesBefore(s + 1, from, count) - piecesBefore(s, from, count);
    let p0x = curve[6 * s];
    let p0y = curve[6 * s + 1];
    let [p1x, p1y, p2x, p2y, p3x, p3y] = curve.slice(6 * s + 2, 6 * s + 8);
    for (let k = pieces; k > 1; k--) {
      // Cut off the first 1/k of what's left (de Casteljau).
      const t = 1 / k;
      const ax = p0x + (p1x - p0x) * t;
      const ay = p0y + (p1y - p0y) * t;
      const bx = p1x + (p2x - p1x) * t;
      const by = p1y + (p2y - p1y) * t;
      const cx = p2x + (p3x - p2x) * t;
      const cy = p2y + (p3y - p2y) * t;
      const abx = ax + (bx - ax) * t;
      const aby = ay + (by - ay) * t;
      const bcx = bx + (cx - bx) * t;
      const bcy = by + (cy - by) * t;
      const mx = abx + (bcx - abx) * t;
      const my = aby + (bcy - aby) * t;
      out.push(ax, ay, abx, aby, mx, my);
      [p0x, p0y, p1x, p1y, p2x, p2y] = [mx, my, bcx, bcy, cx, cy];
    }
    out.push(p1x, p1y, p2x, p2y, p3x, p3y);
  }
  return out;
}

/** The same x positions with every point on one horizontal line, e.g. the baseline. */
export function flatten(curve: Curve, y: number): Curve {
  return curve.map((value, index) => (index % 2 === 1 ? y : value));
}

export function lerpCurve(a: Curve, b: Curve, t: number): Curve {
  'worklet';
  if (t >= 1) return b;
  if (t <= 0) return a;
  const out = new Array<number>(b.length);
  for (let i = 0; i < b.length; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}

const round = (value: number) => {
  'worklet';
  return Math.round(value * 100) / 100;
};

/** SVG path data for a curve. */
export function curvePath(curve: Curve): string {
  'worklet';
  if (curve.length < 2) return '';
  let d = `M${round(curve[0])},${round(curve[1])}`;
  for (let i = 2; i + 5 < curve.length; i += 6) {
    d += ` C${round(curve[i])},${round(curve[i + 1])} ${round(curve[i + 2])},${round(curve[i + 3])} ${round(curve[i + 4])},${round(curve[i + 5])}`;
  }
  return d;
}

/** SVG path data for the area between a curve and the horizontal line at `baseline`. */
export function areaPath(curve: Curve, baseline: number): string {
  'worklet';
  if (curve.length < 2) return '';
  const lastX = curve[curve.length - 2];
  return `${curvePath(curve)} L${round(lastX)},${round(baseline)} L${round(curve[0])},${round(baseline)} Z`;
}

export const lerp = (a: number, b: number, t: number) => {
  'worklet';
  return a + (b - a) * t;
};

export const clamp01 = (value: number) => {
  'worklet';
  return Math.min(Math.max(value, 0), 1);
};
