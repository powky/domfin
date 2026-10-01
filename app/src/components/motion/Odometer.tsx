import { useEffect, useRef, useState } from 'react';
import { Platform, View, type StyleProp, type TextStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { Text, type TextTone, type TextVariant } from '@/components/ui/Text';
import { hideAmounts, useAmountsHidden } from '@/lib/privacy';

import { spring } from './animations';
import { useReducedMotion } from './reducedMotion';

/** Every digit once, plus a closing 0 so 9 rolls into 0 without a jump. */
const REEL = '0\n1\n2\n3\n4\n5\n6\n7\n8\n9\n0';

export type OdometerProps = {
  /** Already formatted ("$12,345.67", "3.25%"). Digits roll, everything else stays put. */
  value: string;
  variant?: TextVariant;
  tone?: TextTone;
  style?: StyleProp<TextStyle>;
};

type Token = { key: string; digit: number } | { key: string; text: string };

/**
 * Number whose digits roll to the new value when it changes, like an
 * odometer: up when the value grows, down when it shrinks. Digits are keyed
 * from the right, so the units stay the units when the number gains a digit.
 */
export function Odometer({ value, variant, tone, style }: OdometerProps) {
  const reduced = useReducedMotion();
  const [trend, setTrend] = useState({ value, direction: 1 as 1 | -1, changed: false });
  if (trend.value !== value) setTrend({ value, direction: compare(value, trend.value), changed: true });

  // Hidden amounts show their x's still: nothing to roll.
  const shown = useAmountsHidden() ? hideAmounts(value) : value;
  const textStyle = [style, styles.digits];
  // Screen readers get the whole value once instead of a column of digits.
  const label = Platform.OS === 'web' ? null : { accessible: true, accessibilityLabel: value };

  return (
    <View style={styles.row} {...label}>
      {Platform.OS === 'web' ? (
        <Text variant={variant} style={styles.screenReaderOnly}>
          {value}
        </Text>
      ) : null}
      {tokenize(shown).map((token) =>
        'digit' in token ? (
          <DigitReel
            key={token.key}
            digit={token.digit}
            direction={trend.direction}
            rollIn={trend.changed}
            reduced={reduced}
            variant={variant}
            tone={tone}
            style={textStyle}
          />
        ) : (
          <Text key={token.key} variant={variant} tone={tone} style={textStyle} aria-hidden>
            {token.text}
          </Text>
        ),
      )}
    </View>
  );
}

type DigitReelProps = {
  digit: number;
  direction: 1 | -1;
  /** A digit that appears after the first render rolls up from 0. */
  rollIn: boolean;
  reduced: boolean;
  variant?: TextVariant;
  tone?: TextTone;
  style: StyleProp<TextStyle>;
};

function DigitReel({ digit, direction, rollIn, reduced, variant, tone, style }: DigitReelProps) {
  const [initial] = useState(() => (rollIn && !reduced ? 0 : digit));
  // Continuous reel position: 7.5 is halfway between 7 and 8.
  const position = useSharedValue(initial);
  // Height of one digit, measured; 0 until the slot has been laid out.
  const step = useSharedValue(0);
  const target = useRef(initial);

  useEffect(() => {
    if (target.current === digit) return;
    target.current = digit;
    if (reduced) {
      position.value = digit;
      return;
    }
    const current = position.value;
    const from = mod10(current);
    const distance = direction > 0 ? mod10(digit - from) : -mod10(from - digit);
    position.value = withSpring(current + distance, spring('roll'));
  }, [digit, direction, reduced, position]);

  // The static digit stands in until the reel can be placed; both switch in the same frame.
  const standInStyle = useAnimatedStyle(() => ({ opacity: step.value > 0 ? 0 : 1 }));
  const reelStyle = useAnimatedStyle(() => ({
    opacity: step.value > 0 ? 1 : 0,
    transform: [{ translateY: -mod10(position.value) * step.value }],
  }));

  return (
    <View style={styles.slot} aria-hidden>
      <Animated.View style={standInStyle}>
        <Text
          variant={variant}
          tone={tone}
          style={style}
          onLayout={(event) => {
            step.value = event.nativeEvent.layout.height;
          }}
        >
          {digit}
        </Text>
      </Animated.View>
      <Animated.View style={[styles.reel, reelStyle]}>
        <Text variant={variant} tone={tone} style={style} align="center">
          {REEL}
        </Text>
      </Animated.View>
    </View>
  );
}

function mod10(value: number) {
  'worklet';
  return ((value % 10) + 10) % 10;
}

function tokenize(value: string): Token[] {
  const tokens: Token[] = [];
  const chars = [...value];
  chars.forEach((char, index) => {
    const fromRight = chars.length - 1 - index;
    if (char >= '0' && char <= '9') {
      tokens.push({ key: `d${fromRight}`, digit: Number(char) });
      return;
    }
    const last = tokens[tokens.length - 1];
    if (last && 'text' in last) {
      last.text += char;
      last.key = `t${fromRight}`;
    } else {
      tokens.push({ key: `t${fromRight}`, text: char });
    }
  });
  return tokens;
}

/** 1 when `next` reads as a larger number than `previous`, -1 otherwise. */
function compare(next: string, previous: string): 1 | -1 {
  const parse = (text: string) => ({
    digits: text.replace(/\D/g, '').replace(/^0+/, ''),
    negative: /^\D*[-−(]/.test(text),
  });
  const a = parse(next);
  const b = parse(previous);
  if (a.negative !== b.negative) return a.negative ? -1 : 1;
  const magnitude =
    a.digits.length !== b.digits.length
      ? a.digits.length - b.digits.length
      : a.digits > b.digits
        ? 1
        : a.digits < b.digits
          ? -1
          : 0;
  return (a.negative ? magnitude < 0 : magnitude > 0) ? 1 : -1;
}

const styles = StyleSheet.create(() => ({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  digits: {
    fontVariant: ['tabular-nums'],
    // Android pads the first and last line; the reel's lines must match the slot exactly.
    includeFontPadding: false,
  },
  slot: {
    overflow: 'hidden',
  },
  // Selecting the number picks the stand-in digits under the reels, so copying reads right.
  reel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    userSelect: 'none',
  },
  screenReaderOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    opacity: 0,
  },
}));
