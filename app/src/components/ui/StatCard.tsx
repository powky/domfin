import { useState, type ReactNode } from 'react';
import { Platform, View, type ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Odometer, Reveal } from '@/components/motion';

import { Text, type TextProps } from './Text';

export type StatCardProps = {
  label: string;
  value: string;
  caption?: string;
  /** Optional marker (e.g. a color swatch) shown before the label. */
  leading?: ReactNode;
  /** Lines the value may wrap to (text values like names). */
  valueLines?: number;
};

/** KPI tile. Its digits roll when the value changes, e.g. on a new period. */
export function StatCard({ label, value, caption, leading, valueLines = 1 }: StatCardProps) {
  return (
    <Reveal style={styles.card}>
      <View style={styles.labelRow}>
        {leading}
        <FitText variant="bodyMedium" tone="secondary" style={styles.label} containerStyle={styles.labelFit}>
          {label}
        </FitText>
      </View>
      {valueLines === 1 ? (
        <FitText variant="kpi" roll>
          {value}
        </FitText>
      ) : (
        <Text variant="kpi" numberOfLines={valueLines}>
          {value}
        </Text>
      )}
      {caption ? (
        <Text variant="caption" tone="secondary" numberOfLines={2}>
          {caption}
        </Text>
      ) : null}
    </Reveal>
  );
}

type FitTextProps = Pick<TextProps, 'variant' | 'tone' | 'style'> & {
  children: string;
  containerStyle?: ViewStyle;
  /** Draws the text as an odometer whose digits roll when it changes. */
  roll?: boolean;
};

/** One line of text that shrinks to fit instead of being cut off. */
function FitText({ children, variant, tone, style, containerStyle, roll }: FitTextProps) {
  const [available, setAvailable] = useState(0);
  const [natural, setNatural] = useState(0);

  // Native text can shrink itself; the web and odometers measure their natural width.
  if (Platform.OS !== 'web' && !roll) {
    return (
      <Text variant={variant} tone={tone} style={style} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {children}
      </Text>
    );
  }

  const scale = available > 0 && natural > available ? available / natural : 1;
  const scaled = scale < 1 && [styles.scaled, { width: natural, maxWidth: natural, transform: [{ scale }] }];
  return (
    <View style={containerStyle} onLayout={(event) => setAvailable(event.nativeEvent.layout.width)}>
      {roll ? (
        <View style={scaled}>
          <Odometer value={children} variant={variant} tone={tone} style={style} />
        </View>
      ) : (
        <Text variant={variant} tone={tone} numberOfLines={1} style={[style, scaled]}>
          {children}
        </Text>
      )}
      <View style={styles.measureClip} aria-hidden>
        <View style={styles.measureRow}>
          {/* A pixel of slack: the web reports whole pixels, and a width a fraction short cuts the text. */}
          <Text
            variant={variant}
            style={[style, roll && styles.tabular]}
            onLayout={(event) => setNatural(event.nativeEvent.layout.width + 1)}
          >
            {children}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    flexGrow: 1,
    // Four in a row only where the amounts fit; two by two below that.
    flexBasis: { xs: '40%', xl: 0 },
    minWidth: 0,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.layout.hairline,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: { xs: theme.space[4], md: theme.space[5] },
    gap: theme.space[1.5],
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2],
  },
  labelFit: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    flexShrink: 1,
    fontSize: { xs: theme.font.size.md, md: theme.font.size.base },
    lineHeight: { xs: theme.font.lineHeight.md, md: theme.font.lineHeight.base },
  },
  scaled: {
    transformOrigin: 'left center',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  measureClip: {
    position: 'absolute',
    pointerEvents: 'none',
    width: 0,
    height: 0,
    overflow: 'hidden',
  },
  measureRow: {
    position: 'absolute',
    width: 2000,
    alignItems: 'flex-start',
  },
}));
