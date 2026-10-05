import { Children, type ReactNode } from 'react';
import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { hideAmounts, useAmountsHidden } from '@/lib/privacy';

export type TextVariant =
  | 'display'
  | 'kpi'
  | 'title'
  | 'heading'
  | 'body'
  | 'bodyMedium'
  | 'bodyStrong'
  | 'label'
  | 'caption'
  | 'captionStrong'
  | 'overline';

export type TextTone = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'positive' | 'inverse';

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  tone?: TextTone;
  align?: 'left' | 'center' | 'right';
  /** Keeps its amounts in view when they're hidden, like an exchange rate: it's public. */
  revealAmounts?: boolean;
};

export function Text({
  variant = 'body',
  tone = 'primary',
  align = 'left',
  revealAmounts = false,
  style,
  children,
  ...props
}: TextProps) {
  styles.useVariants({ variant, tone });
  const hidden = useAmountsHidden() && !revealAmounts;
  return (
    <RNText {...props} style={[styles.text, { textAlign: align }, style]}>
      {hidden ? withAmountsHidden(children) : children}
    </RNText>
  );
}

/** The text's amounts as x's ("RD$x,xxx.xx"), wherever they come from. */
function withAmountsHidden(children: ReactNode): ReactNode {
  if (typeof children === 'string') return hideAmounts(children);
  // "{label} {amount}" comes in pieces: read them as the line they make.
  if (Array.isArray(children) && children.every((child) => typeof child === 'string' || typeof child === 'number')) {
    return hideAmounts(children.join(''));
  }
  return Children.map(children, (child) => (typeof child === 'string' ? hideAmounts(child) : child));
}

const styles = StyleSheet.create((theme) => ({
  text: {
    fontFamily: theme.font.family.regular,
    fontSize: theme.font.size.base,
    lineHeight: theme.font.lineHeight.base,
    color: theme.colors.text.primary,
    variants: {
      variant: {
        display: {
          fontFamily: theme.font.family.bold,
          // 26 on phones fits every page title on one line at 375 points, beside the logo and two buttons.
          fontSize: { xs: 26, md: theme.font.size['3xl'] },
          lineHeight: { xs: 32, md: theme.font.lineHeight['3xl'] },
          letterSpacing: theme.font.letterSpacing.tight,
        },
        kpi: {
          fontFamily: theme.font.family.semibold,
          // 20 on phones keeps seven-figure amounts on one line in a 2×2 grid.
          fontSize: { xs: 20, md: 26 },
          lineHeight: { xs: 26, md: 32 },
          letterSpacing: theme.font.letterSpacing.tight,
        },
        title: {
          fontFamily: theme.font.family.semibold,
          fontSize: theme.font.size.xl,
          lineHeight: theme.font.lineHeight.xl,
          letterSpacing: theme.font.letterSpacing.tight,
        },
        heading: {
          fontFamily: theme.font.family.semibold,
          fontSize: theme.font.size.lg,
          lineHeight: theme.font.lineHeight.lg,
        },
        body: {},
        bodyMedium: { fontFamily: theme.font.family.medium },
        bodyStrong: { fontFamily: theme.font.family.semibold },
        label: {
          fontFamily: theme.font.family.medium,
          fontSize: theme.font.size.md,
          lineHeight: theme.font.lineHeight.md,
        },
        caption: {
          fontSize: theme.font.size.sm,
          lineHeight: theme.font.lineHeight.sm,
        },
        captionStrong: {
          fontFamily: theme.font.family.semibold,
          fontSize: theme.font.size.sm,
          lineHeight: theme.font.lineHeight.sm,
        },
        overline: {
          fontFamily: theme.font.family.semibold,
          fontSize: theme.font.size.xs,
          lineHeight: theme.font.lineHeight.xs,
          letterSpacing: theme.font.letterSpacing.wide,
          textTransform: 'uppercase',
        },
      },
      tone: {
        primary: { color: theme.colors.text.primary },
        secondary: { color: theme.colors.text.secondary },
        tertiary: { color: theme.colors.text.tertiary },
        accent: { color: theme.colors.text.accent },
        positive: { color: theme.colors.text.positive },
        inverse: { color: theme.colors.text.inverse },
      },
    },
  },
}));
