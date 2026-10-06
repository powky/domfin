import { Link } from 'expo-router';
import { CalendarCheck, ChevronRight, HandCoins } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Reveal } from '@/components/motion';
import { Text, Touchable } from '@/components/ui';
import { InstitutionAvatar, institutionLine } from '@/features/accounts';
import { formatMonthYear, formatShortDate } from '@/lib/dates';
import { dotSeparator, formatCurrency } from '@/lib/format';

import type { LoanSummary } from '../types';

/** Rises into place with the other cards when the screen opens. */
export function LoanCard({ loan }: { loan: LoanSummary }) {
  return (
    <Reveal style={styles.container}>
      <LoanLink loan={loan} />
    </Reveal>
  );
}

function LoanLink({ loan }: { loan: LoanSummary }) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();

  return (
    <Link href={loan.href} asChild>
      <Touchable
        accessibilityRole="link"
        accessibilityLabel={t('loans.card.label', {
          name: loan.name,
          amount: formatCurrency(loan.balance, loan.currency),
        })}
        containerStyle={styles.link}
        surfaceStyle={styles.card}
        hoverStyle={styles.hovered}
        pressedStyle={styles.hovered}
      >
        <View style={styles.header}>
          <View style={styles.tile}>
            <HandCoins size={20} strokeWidth={1.75} color={theme.colors.text.secondary} />
          </View>
          <View style={styles.titleBlock}>
            <Text variant="heading" numberOfLines={1}>
              {loan.name}
            </Text>
            <View style={styles.subtitle}>
              <InstitutionAvatar institution={loan.institution} size="xs" />
              <Text variant="caption" tone="secondary" numberOfLines={1} style={styles.subtitleText}>
                {institutionLine(loan)}
              </Text>
            </View>
          </View>
          <ChevronRight size={18} strokeWidth={2} color={theme.colors.text.tertiary} />
        </View>

        <View style={styles.balance}>
          <Text variant="kpi" numberOfLines={1}>
            {formatCurrency(loan.balance, loan.currency)}
          </Text>
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {loan.change <= 0
              ? t('loans.card.down', { amount: formatCurrency(-loan.change, loan.currency) })
              : t('loans.card.up', { amount: formatCurrency(loan.change, loan.currency) })}
          </Text>
        </View>

        <View style={styles.facts}>
          <Fact label={t('loans.card.paid')} value={formatCurrency(loan.paidInPeriod, loan.currency)} amount />
          <Fact
            label={t('loans.card.lastPayment')}
            value={loan.lastPayment ? formatShortDate(loan.lastPayment.date) : '—'}
          />
          <Fact label={t('loans.card.asOf')} value={formatShortDate(loan.asOf)} />
        </View>

        <PlanLine loan={loan} />
      </Touchable>
    </Link>
  );
}

/** When it ends and the interest left, or how to find out: what its rate and installment tell. */
function PlanLine({ loan }: { loan: LoanSummary }) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  // Nothing while the plans load, nor for a loan already paid.
  if (!loan.plan || loan.balance <= 0) return null;
  const payoff = loan.plan.payoff;
  if (payoff?.status === 'paid') return null;
  const text =
    payoff?.status === 'ends'
      ? [
          t('loans.card.endsIn', { month: formatMonthYear(payoff.last) }),
          t('loans.card.interestLeft', { amount: formatCurrency(payoff.interest / 100, loan.currency) }),
        ].join(dotSeparator)
      : payoff?.status === 'never'
        ? t('loans.card.never')
        : t('loans.card.noPlan');
  return (
    <View style={styles.plan}>
      <CalendarCheck
        size={16}
        strokeWidth={2}
        color={payoff?.status === 'ends' ? theme.colors.text.secondary : theme.colors.text.tertiary}
      />
      <Text variant="caption" tone={payoff?.status === 'ends' ? 'secondary' : 'tertiary'} style={styles.planText}>
        {text}
      </Text>
    </View>
  );
}

/** The amount keeps its full width; the dates share what's left. */
function Fact({ label, value, amount }: { label: string; value: string; amount?: boolean }) {
  return (
    <View style={amount ? styles.amountFact : styles.fact}>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
      <Text variant="bodyStrong" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flexGrow: 1,
    flexBasis: { xs: '100%', md: '40%' },
    minWidth: 0,
  },
  link: {
    flexGrow: 1,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: theme.layout.hairline,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: { xs: theme.space[4], md: theme.space[5] },
    gap: theme.space[4],
  },
  hovered: {
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surfaceHover,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[3],
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    gap: theme.space[0.5],
  },
  subtitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[1.5],
  },
  subtitleText: {
    flexShrink: 1,
  },
  tile: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceMuted,
  },
  balance: {
    gap: theme.space[0.5],
  },
  facts: {
    flexDirection: 'row',
    gap: theme.space[3],
    paddingTop: theme.space[3],
    borderTopWidth: theme.layout.hairline,
    borderTopColor: theme.colors.border,
  },
  fact: {
    flex: 1,
    minWidth: 0,
    gap: theme.space[0.5],
  },
  amountFact: {
    flexShrink: 1,
    gap: theme.space[0.5],
  },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2],
    marginTop: -theme.space[1],
  },
  planText: {
    flex: 1,
    minWidth: 0,
  },
}));
