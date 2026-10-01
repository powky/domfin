import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Card, SegmentedControl, Text } from '@/components/ui';
import { formatCurrency } from '@/lib/format';

import type { AccountGroup, AccountGrouping, AccountsOverview } from '../types';
import { AccountRow } from './AccountRow';
import { SyncStatusLabel } from './SyncStatusLabel';

export function AccountListCard({ overview }: { overview: AccountsOverview }) {
  const { t } = useTranslation();
  const [grouping, setGrouping] = useState<AccountGrouping>('type');
  const groups = overview.groups[grouping];
  const groupingOptions = [
    { value: 'type', label: t('accounts.list.grouping.type') },
    { value: 'institution', label: t('accounts.list.grouping.institution') },
  ] as const;

  return (
    <Card
      title={t('accounts.list.title')}
      actions={
        <SegmentedControl
          options={groupingOptions}
          value={grouping}
          onChange={setGrouping}
          accessibilityLabel={t('accounts.list.groupBy')}
        />
      }
    >
      <View style={styles.groups}>
        {groups.map((group) => (
          <View key={group.id} style={styles.group} accessibilityRole="list">
            <GroupHeader group={group} grouping={grouping} />
            {group.accounts.map((account) => (
              <AccountRow key={account.id} account={account} showStatus={grouping === 'type'} />
            ))}
          </View>
        ))}
      </View>
    </Card>
  );
}

function GroupHeader({ group, grouping }: { group: AccountGroup; grouping: AccountGrouping }) {
  const { t } = useTranslation();
  const count = t('accounts.list.count', { count: group.accounts.length });
  return (
    <View style={styles.groupHeader} accessibilityRole="header">
      <Text variant="overline" tone="secondary" numberOfLines={1} style={styles.groupLabel}>
        {group.label}
        <Text variant="overline" tone="tertiary">
          {`  ${count}`}
        </Text>
      </Text>
      {grouping === 'institution' && group.institution ? (
        <SyncStatusLabel institution={group.institution} />
      ) : (
        <Text variant="captionStrong" tone="secondary">
          {formatCurrency(group.total)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  groups: {
    gap: theme.space[5],
  },
  group: {
    gap: theme.space[1],
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space[3],
    paddingBottom: theme.space[2],
    marginBottom: theme.space[1],
    borderBottomWidth: theme.layout.hairline,
    borderBottomColor: theme.colors.border,
  },
  groupLabel: {
    flexShrink: 1,
  },
}));
