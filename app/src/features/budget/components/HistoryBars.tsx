import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Text } from '@/components/ui';
import { formatDateValue } from '@/lib/dates';

export type HistoryBarsProps = {
  /** 'YYYY-MM', oldest first. */
  months: readonly string[];
  /** What was paid each month, in any one unit; 0 for nothing. */
  values: readonly number[];
  color: string;
  /** The month the screen is about, in full color; the rest are lighter. */
  current?: string;
  accessibilityLabel: string;
};

/** What a payment was month by month, as small bars with each month's initial: the habit at a glance. */
export function HistoryBars({ months, values, color, current, accessibilityLabel }: HistoryBarsProps) {
  const max = Math.max(...values, 1);
  return (
    <View style={styles.bars} accessible accessibilityLabel={accessibilityLabel}>
      {months.map((month, index) => {
        const value = values[index] ?? 0;
        const faded = current !== undefined && month !== current;
        return (
          <View key={month} style={styles.column}>
            <View style={styles.slot}>
              {value > 0 ? (
                <View
                  style={[
                    styles.bar,
                    { height: `${Math.max(value / max, 0.15) * 100}%`, backgroundColor: color },
                    faded && styles.faded,
                  ]}
                />
              ) : (
                <View style={styles.none} />
              )}
            </View>
            <Text variant="caption" tone={month === current ? 'primary' : 'tertiary'} style={styles.label}>
              {formatDateValue(month, { month: 'narrow' })}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.space[1],
  },
  column: {
    alignItems: 'center',
    gap: theme.space[0.5],
  },
  slot: {
    width: 12,
    height: 22,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {
    width: '100%',
    borderRadius: theme.radius.xs,
  },
  faded: {
    opacity: 0.45,
  },
  // A month without a payment: a small mark on the baseline.
  none: {
    width: 6,
    height: 2,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.borderStrong,
  },
  label: {
    fontSize: theme.font.size.xs,
    lineHeight: theme.font.lineHeight.xs,
  },
}));
