import { CircleCheck, CircleDashed, TriangleAlert, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Card, Text } from '@/components/ui';
import { formatLongMonthYear, formatMonthYear } from '@/lib/dates';

import type { CoverageState } from '../api/useStatementCoverage';
import { accountLabel } from '../lib/labels';
import type { AccountCoverage, CoverageMonth, MonthStatus } from '../types';

/** Each account's months: the ones that add up, the ones to look at and the missing ones. */
export function CoverageCard({ coverage }: { coverage: CoverageState }) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const { status, accounts, error } = coverage;

  return (
    <Card title={t('imports.coverage.title')}>
      <Text variant="caption" tone="secondary" style={styles.description}>
        {t('imports.coverage.description')}
      </Text>
      {status === 'error' && error ? (
        <View style={styles.notice} accessibilityRole="alert">
          <TriangleAlert size={18} strokeWidth={2} color={theme.colors.accent.default} />
          <Text variant="bodyMedium" style={styles.noticeText}>
            {t(`imports.errors.${error}`)}
          </Text>
        </View>
      ) : null}
      {accounts.length === 0 && status !== 'error' ? (
        <Text tone="tertiary">{status === 'loading' ? t('imports.coverage.loading') : t('imports.coverage.empty')}</Text>
      ) : null}
      {accounts.map((item, index) => (
        <AccountMonths key={`${item.account.kind}-${item.account.institution}-${item.account.last4}`} item={item} divided={index > 0} />
      ))}
      {accounts.length > 0 ? <Legend /> : null}
    </Card>
  );
}

function AccountMonths({ item, divided }: { item: AccountCoverage; divided: boolean }) {
  const { t } = useTranslation();
  const { account, months } = item;
  const kind = account.kind === 'credit_card' && account.brand ? account.brand : t(`imports.kinds.${account.kind}`);
  const flagged = months.filter((month) => month.status === 'review');

  return (
    <View style={[styles.account, divided && styles.divider]}>
      <View style={styles.accountHeader}>
        <Text variant="bodyStrong">{accountLabel(account)}</Text>
        <Text variant="caption" tone="tertiary">
          {kind}
        </Text>
      </View>
      <View style={styles.months}>
        {/* An account can have two statements in a month, when its cut day changes. */}
        {months.map((month) => (
          <MonthChip key={`${month.month}-${month.date ?? ''}`} month={month} />
        ))}
      </View>
      {flagged.flatMap((month) =>
        (month.issues ?? []).map((issue) => (
          <Text key={`${month.month}-${month.date ?? ''}-${issue}`} variant="caption" tone="secondary">
            {t('imports.coverage.issue', { month: formatMonthYear(month.month), issue })}
          </Text>
        )),
      )}
    </View>
  );
}

function useStatusIcon(status: MonthStatus): { Icon: LucideIcon; color: string } {
  const { theme } = useUnistyles();
  switch (status) {
    case 'ok':
      return { Icon: CircleCheck, color: theme.colors.positive };
    case 'review':
      return { Icon: TriangleAlert, color: theme.colors.accent.default };
    default:
      return { Icon: CircleDashed, color: theme.colors.text.tertiary };
  }
}

function MonthChip({ month }: { month: CoverageMonth }) {
  const { t } = useTranslation();
  const { Icon, color } = useStatusIcon(month.status);
  const status = t(`imports.coverage.status.${month.status}`);
  return (
    <View
      style={[styles.chip, month.status === 'missing' && styles.chipMissing]}
      accessible
      accessibilityLabel={t('imports.coverage.monthLabel', { month: formatLongMonthYear(month.month), status })}
    >
      <Icon size={14} strokeWidth={2} color={color} />
      <Text variant="captionStrong" tone={month.status === 'missing' ? 'tertiary' : 'primary'}>
        {formatMonthYear(month.month)}
      </Text>
    </View>
  );
}

function Legend() {
  const { t } = useTranslation();
  const statuses: MonthStatus[] = ['ok', 'review', 'missing'];
  return (
    <View style={styles.legend}>
      {statuses.map((status) => (
        <LegendItem key={status} status={status} label={t(`imports.coverage.status.${status}`)} />
      ))}
    </View>
  );
}

function LegendItem({ status, label }: { status: MonthStatus; label: string }) {
  const { Icon, color } = useStatusIcon(status);
  return (
    <View style={styles.legendItem}>
      <Icon size={14} strokeWidth={2} color={color} />
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  description: {
    marginTop: -theme.space[2],
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space[3],
    padding: theme.space[3],
    borderRadius: theme.radius.md,
    borderWidth: theme.layout.hairline,
    borderColor: theme.colors.accent.muted,
    backgroundColor: theme.colors.accent.subtle,
  },
  noticeText: {
    flex: 1,
  },
  account: {
    gap: theme.space[3],
  },
  divider: {
    paddingTop: theme.space[4],
    borderTopWidth: theme.layout.hairline,
    borderTopColor: theme.colors.border,
  },
  accountHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: theme.space[2],
  },
  months: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space[2],
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[1],
    paddingHorizontal: theme.space[2],
    paddingVertical: theme.space[1],
    borderRadius: theme.radius.full,
    borderWidth: theme.layout.hairline,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
  },
  chipMissing: {
    borderStyle: 'dashed',
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surface,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space[4],
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[1],
  },
}));
