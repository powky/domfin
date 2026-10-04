import { palette } from './palette';

/**
 * Shadows under what floats over the page. They stay out of the theme on
 * purpose: on the web Unistyles turns the theme's colors into CSS variables,
 * and a variable can't take the shadow's opacity. Black in both themes: on
 * the dark one they barely show, and `surfaceRaised` sets those apart.
 */
export const elevation = {
  /** Menus (`Select`). */
  menu: {
    shadowColor: palette.black,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  /** A chart's tooltip. */
  tooltip: {
    shadowColor: palette.black,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
} as const;
