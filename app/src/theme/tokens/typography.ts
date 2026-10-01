/**
 * Font family names match the ones registered by @expo-google-fonts/inter
 * (see src/app/_layout.tsx).
 */
export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const fontSize = {
  xs: 11,
  sm: 12,
  md: 13,
  base: 14,
  lg: 16,
  xl: 18,
  '2xl': 22,
  '3xl': 28,
} as const;

export const lineHeight = {
  xs: 14,
  sm: 16,
  md: 18,
  base: 20,
  lg: 22,
  xl: 24,
  '2xl': 28,
  '3xl': 34,
} as const;

export const letterSpacing = {
  tight: -0.2,
  normal: 0,
  wide: 0.8,
} as const;
