import { Check, ChevronDown, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Card, ColorSwatch, Text, Touchable } from '@/components/ui';
import { formatCurrency, formatPercent } from '@/lib/format';

import type { AccountSummary, AccountType, AccountTypeSummary, BalanceSheetSide, SelectedAccount } from '../types';

export type AccountListCardProps = {
  title: string;
  side: BalanceSheetSide;
  selected: SelectedAccount[];
  onToggleAccount: (id: string) => void;
};

/** Assets or liabilities by type. Types expand into accounts that can be charted. */
export function AccountListCard({ title, side, selected, onToggleAccount }: AccountListCardProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const [open, setOpen] = useState<Partial<Record<AccountType, boolean>>>({});
  const colorById = new Map(selected.map((item) => [item.id, theme.colors.chart[item.color]]));

  const toggleType = (type: AccountType) => setOpen((current) => ({ ...current, [type]: !current[type] }));

  return (
    <Card title={title} style={styles.card} actions={<Text variant="heading">{formatCurrency(side.total)}</Text>}>
      <View>
        <View style={styles.headerRow}>
          <Text variant="caption" tone="secondary" style={styles.nameCol}>
            {t('netWorth.list.type')}
          </Text>
          <View style={[styles.percentCol, styles.desktopOnly]}>
            <Text variant="caption" tone="secondary" align="right">
              {t('netWorth.list.share')}
            </Text>
          </View>
          <Text variant="caption" tone="secondary" align="right" style={styles.amountCol}>
            {t('netWorth.list.balance')}
          </Text>
        </View>
        {side.types.map((type) => {
          const expanded = !!open[type.type];
          return (
            <View key={type.type}>
              <TypeRow type={type} expanded={expanded} onPress={() => toggleType(type.type)} />
              {expanded
                ? type.accounts.map((account) => (
                    <AccountRow
                      key={account.id}
                      account={account}
                      color={colorById.get(account.id)}
                      onPress={() => onToggleAccount(account.id)}
                    />
                  ))
                : null}
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function TypeRow({ type, expanded, onPress }: { type: AccountTypeSummary; expanded: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const accountCount = t('netWorth.list.accounts', { count: type.accounts.length });
  return (
    <Touchable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={`${type.label}, ${formatCurrency(type.balance)}, ${accountCount}`}
      surfaceStyle={styles.row}
      hoverStyle={styles.rowHovered}
    >
      <View style={[styles.nameCol, styles.nameCell]}>
        <Chevron size={16} strokeWidth={2} color={theme.colors.text.secondary} />
        <ColorSwatch shape="square" color={theme.colors.chart[type.color]} />
        <Text variant="bodyMedium" numberOfLines={1} style={styles.label}>
          {type.label}
        </Text>
      </View>
      <Amounts amount={type.balance} share={type.share} strong />
    </Touchable>
  );
}

function AccountRow({ account, color, onPress }: { account: AccountSummary; color?: string; onPress: () => void }) {
  const { t } = useTranslation();
  const selected = !!color;
  const institution = account.mask ? `${account.institution} ••${account.mask}` : account.institution;
  return (
    <Touchable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${account.name}, ${formatCurrency(account.balance)}`}
      accessibilityHint={t('netWorth.list.accountHint')}
      surfaceStyle={[styles.row, styles.accountRow]}
      hoverStyle={styles.rowHovered}
    >
      <View style={[styles.nameCol, styles.nameCell, styles.accountIndent]}>
        <Checkbox color={color} />
        <View style={styles.label}>
          <Text variant={selected ? 'bodyMedium' : 'body'} numberOfLines={1}>
            {account.name}
          </Text>
          <View style={styles.detail}>
            <Text variant="caption" tone="secondary" numberOfLines={1} style={styles.label}>
              {institution}
            </Text>
            {/* Accounts in the other currency also show what they hold in it, in full: the institution gives way first. */}
            {account.native ? (
              <Text variant="caption" tone="secondary" style={styles.nativeBalance}>
                {` · ${formatCurrency(account.native.balance, account.native.currency)}`}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
      <Amounts amount={account.balance} share={account.share} />
    </Touchable>
  );
}

/** Share and balance columns; on phones the share sits under the balance. */
function Amounts({ amount, share, strong }: { amount: number; share: number; strong?: boolean }) {
  return (
    <>
      <View style={[styles.percentCol, styles.desktopOnly]}>
        <Text tone="secondary" align="right">
          {formatPercent(share)}
        </Text>
      </View>
      <View style={styles.amountCol}>
        <Text variant={strong ? 'bodyStrong' : 'body'} align="right">
          {formatCurrency(amount)}
        </Text>
        <View style={styles.phoneOnly}>
          <Text variant="caption" tone="secondary" align="right">
            {formatPercent(share)}
          </Text>
        </View>
      </View>
    </>
  );
}

/** Filled with the account's line color while it is charted. */
function Checkbox({ color }: { color?: string }) {
  const { theme } = useUnistyles();
  return (
    <View style={[styles.checkbox, color ? { backgroundColor: color, borderColor: color } : null]}>
      {color ? <Check size={12} strokeWidth={3} color={theme.colors.text.inverse} /> : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    flex: { xs: undefined, xl: 1 },
    minWidth: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: { xs: theme.space[1], md: theme.space[2] },
    paddingBottom: theme.space[2],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: { xs: theme.space[1], md: theme.space[2] },
    borderTopWidth: theme.layout.hairline,
    borderTopColor: theme.colors.border,
  },
  rowHovered: {
    backgroundColor: theme.colors.surfaceHover,
  },
  accountRow: {
    paddingVertical: theme.space[2],
  },
  nameCol: {
    flex: 1,
    minWidth: 0,
  },
  nameCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2],
  },
  accountIndent: {
    paddingLeft: theme.space[6],
  },
  label: {
    flexShrink: 1,
    minWidth: 0,
  },
  detail: {
    flexDirection: 'row',
  },
  nativeBalance: {
    flexShrink: 0,
  },
  percentCol: {
    width: 72,
  },
  amountCol: {
    width: { xs: 112, md: 128 },
  },
  desktopOnly: {
    display: { xs: 'none', md: 'flex' },
  },
  phoneOnly: {
    display: { xs: 'flex', md: 'none' },
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: theme.radius.xs,
    borderWidth: 1.5,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
