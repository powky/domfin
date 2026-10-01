/**
 * Motion tokens. Durations are in ms and easings are cubic-bezier control
 * points, so the same curve works in Reanimated and in CSS.
 */
const duration = {
  /** Small state changes: a color, a fade. */
  fast: 160,
  /** Screens and most UI. */
  base: 280,
  /** Cards and other large surfaces arriving. */
  slow: 420,
  /** Charts reshaping to new data. */
  morph: 650,
  /** Charts drawing themselves the first time. */
  draw: 900,
} as const;

const easing = {
  /** Something moving from one place to another. */
  standard: [0.2, 0, 0, 1],
  /** Something arriving: quick start, long soft landing. */
  enter: [0.05, 0.7, 0.1, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;

/**
 * Springs by perceived duration. A damping ratio of 1 settles without
 * bouncing; lower values overshoot a little.
 */
const spring = {
  /** Selection indicators: the edge in front. */
  lead: { duration: 380, dampingRatio: 1 },
  /** Selection indicators: the edge behind, so the pill stretches as it travels. */
  trail: { duration: 560, dampingRatio: 1 },
  /** Odometer digits: a hint of overshoot, like a mechanical counter. */
  roll: { duration: 800, dampingRatio: 0.78 },
} as const;

const stagger = {
  /** Delay between items entering one after another. */
  step: 45,
  /** Later items share the last delay so long pages don't lag. */
  maxSteps: 8,
} as const;

const travel = {
  /** Horizontal offset of a screen sliding in. */
  screen: 28,
  /** Vertical offset of a card rising in. */
  rise: 14,
} as const;

export const motion = { duration, easing, spring, stagger, travel } as const;
