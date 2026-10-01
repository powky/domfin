import { Link } from 'expo-router';
import { Banknote } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Text, Touchable } from '@/components/ui';
import { formatDate } from '@/lib/dates';

import { useExchangeRate } from '../api/useExchangeRate';
import { formatRateShort } from '../lib/format';
import { midRate } from '../lib/rates';

/** "US$1 = RD$59.41 · BCRD · Sep 28, 2026": the rate totals are converted at, linking to its details. */
export function ExchangeRateSummary() {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const { rate, status } = useExchangeRate();
  const short = formatRateShort(midRate(rate));
  const date = formatDate(rate.date);
  const lastKnown = status === 'stale' || status === 'offline';

  return (
    <Link href="/settings" asChild>
      <Touchable
        accessibilityRole="link"
        accessibilityLabel={t('currency.rate.summaryLabel', { rate: short, date })}
        surfaceStyle={styles.row}
        hoverStyle={styles.hovered}
      >
        <Banknote size={18} strokeWidth={1.75} color={theme.colors.text.secondary} />
        <View style={styles.text}>
          <Text variant="captionStrong" numberOfLines={1} revealAmounts>
            {short}
          </Text>
          {/* "Last known" doesn't fit next to the date in the sidebar, so it may wrap. */}
          <Text variant="caption" tone="tertiary" numberOfLines={lastKnown ? 2 : 1}>
            {t(lastKnown ? 'currency.rate.summaryLastKnown' : 'currency.rate.summary', { date })}
          </Text>
        </View>
      </Touchable>
    </Link>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[3],
    paddingHorizontal: theme.space[2.5],
    paddingVertical: theme.space[2],
    borderRadius: theme.radius.md,
  },
  hovered: {
    backgroundColor: theme.colors.surfaceHover,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
}));
