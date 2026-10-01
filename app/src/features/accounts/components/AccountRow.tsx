import { Link } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Text, Touchable } from '@/components/ui';
import { formatCurrency, formatSignedCurrency } from '@/lib/format';

import { institutionLine, isFavorable } from '../lib/accountTypes';
import type { AccountSummary } from '../types';
import { InstitutionAvatar } from './InstitutionAvatar';
import { SyncStatusLabel } from './SyncStatusLabel';

/** Change over the period: green when it is good news, gray otherwise. */
export function ChangeText({ account, align = 'right' }: { account: AccountSummary; align?: 'left' | 'right' }) {
  const { t } = useTranslation();
  const favorable = isFavorable(account);
  if (favorable === null) {
    return (
      <Text variant="caption" tone="tertiary" align={align}>
        {t('accounts.list.noChange')}
      </Text>
    );
  }
  return (
    <Text variant="caption" tone={favorable ? 'positive' : 'secondary'} align={align}>
      {formatSignedCurrency(account.change, account.currency)}
    </Text>
  );
}

export type AccountRowProps = {
  account: AccountSummary;
  /** Hide the sync column when the group header already shows it. */
  showStatus?: boolean;
};

export function AccountRow({ account, showStatus = true }: AccountRowProps) {
  const { theme } = useUnistyles();

  return (
    <Link href={account.href} asChild>
      <Touchable
        accessibilityRole="link"
        accessibilityLabel={`${account.name}, ${institutionLine(account)}, ${formatCurrency(account.balance, account.currency)}`}
        surfaceStyle={styles.row}
        hoverStyle={styles.hovered}
        pressedStyle={styles.hovered}
      >
        <InstitutionAvatar institution={account.institution} />
        <View style={styles.info}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {account.name}
          </Text>
          <View style={styles.subtitle}>
            <Text variant="caption" tone="secondary" numberOfLines={1} style={styles.shrink}>
              {institutionLine(account)}
            </Text>
          </View>
        </View>
        {showStatus ? (
          <View style={styles.status}>
            <SyncStatusLabel institution={account.institution} />
          </View>
        ) : null}
        <View style={styles.amounts}>
          <Text variant="bodyStrong" align="right" numberOfLines={1}>
            {formatCurrency(account.balance, account.currency)}
          </Text>
          <ChangeText account={account} />
        </View>
        <View style={styles.chevron}>
          <ChevronRight size={16} strokeWidth={2} color={theme.colors.text.tertiary} />
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
    paddingVertical: theme.space[2.5],
    paddingHorizontal: theme.space[2],
    marginHorizontal: -theme.space[2],
    borderRadius: theme.radius.md,
  },
  hovered: {
    backgroundColor: theme.colors.surfaceHover,
  },
  info: {
    flex: 1,
    minWidth: 0,
    gap: theme.space[0.5],
  },
  subtitle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  shrink: {
    flexShrink: 1,
  },
  status: {
    display: { xs: 'none', md: 'flex' },
    width: 180,
  },
  amounts: {
    alignItems: 'flex-end',
    gap: theme.space[0.5],
  },
  chevron: {
    display: { xs: 'none', sm: 'flex' },
  },
}));
