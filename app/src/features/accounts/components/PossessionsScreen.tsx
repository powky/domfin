import { Link, type Href } from 'expo-router';
import type { TFunction } from 'i18next';
import { CalendarPlus, ChevronRight, Plus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { DataNotice } from '@/components/DataNotice';
import { PageHeader } from '@/components/PageHeader';
import { Screen } from '@/components/Screen';
import { Button, Card, ProgressBar, Text, Touchable } from '@/components/ui';
import { inDisplay, useConverter } from '@/features/currency';
import { schedule, useAssets, type Asset } from '@/features/ledger';
import { sumCents } from '@/lib/currency';
import { formatDate, today } from '@/lib/dates';
import { formatCurrency, formatPercent, keepTogether } from '@/lib/format';

import type { Institution } from '../types';
import { scheduleLabel } from './AssetDetail';
import { InstitutionAvatar } from './InstitutionAvatar';

type Owned = Exclude<Asset['kind'], 'debt'>;

/** The order kinds are listed in, and the icon each shows. */
const kinds: { kind: Owned; icon: NonNullable<Institution['icon']> }[] = [
  { kind: 'property', icon: 'property' },
  { kind: 'shares', icon: 'shares' },
  { kind: 'pension', icon: 'pension' },
  { kind: 'vehicle', icon: 'vehicle' },
];

/**
 * What you own outside your accounts, by kind: what each is worth and, for
 * a home, where its payment plan stands. Debts outside your statements
 * live in Loans.
 */
export function PossessionsScreen() {
  const { t } = useTranslation();
  const converter = useConverter();
  const { assets, status } = useAssets();
  const owned = assets.filter((asset) => asset.kind !== 'debt');
  // What they're worth today, so at today's rate.
  const total = sumCents(owned.map((asset) => inDisplay(converter, asset.value / 100, asset.currency)));

  return (
    <Screen
      header={
        <PageHeader
          title={t('nav.possessions')}
          subtitle={
            owned.length > 0
              ? t('possessions.subtitle', { count: owned.length, total: formatCurrency(total) })
              : undefined
          }
          desktopAction={<AddButton />}
          mobileAction={<AddButton iconOnly />}
        />
      }
    >
      {owned.length === 0 ? (
        status === 'ready' ? (
          <Card>
            <Text tone="secondary">{t('possessions.empty')}</Text>
          </Card>
        ) : (
          <DataNotice status={status} />
        )
      ) : (
        kinds.map(({ kind, icon }) => {
          const items = owned.filter((asset) => asset.kind === kind);
          if (items.length === 0) return null;
          return (
            <Card key={kind} title={t(`possessions.groups.${kind}`)}>
              <View accessibilityRole="list">
                {items.map((asset, index) => (
                  <View
                    key={asset.id}
                    style={[styles.item, index > 0 && styles.divider, index < items.length - 1 && styles.spaced]}
                  >
                    <PossessionRow asset={asset} icon={icon} />
                    {asset.kind === 'property' ? <PlanSummary asset={asset} /> : null}
                  </View>
                ))}
              </View>
            </Card>
          );
        })
      )}
      <Text variant="caption" tone="tertiary">
        {t('possessions.debts')}
      </Text>
    </Screen>
  );
}

function AddButton({ iconOnly = false }: { iconOnly?: boolean }) {
  const { t } = useTranslation();
  return (
    <Link href="/investments/new" asChild>
      <Button
        icon={Plus}
        iconOnly={iconOnly}
        label={iconOnly ? undefined : t('assets.add')}
        accessibilityLabel={t('assets.add')}
      />
    </Link>
  );
}

/** One possession, opening its page: its name, a line about it and what it's worth. */
function PossessionRow({ asset, icon }: { asset: Asset; icon: NonNullable<Institution['icon']> }) {
  const { t } = useTranslation();
  const { theme, rt } = useUnistyles();
  const money = (cents: number) => formatCurrency(cents / 100, asset.currency);
  const href: Href = { pathname: '/accounts/[id]', params: { id: `asset:${asset.id}` } };
  const caption = captionOf(asset, t, money);
  return (
    <Link href={href} asChild>
      <Touchable
        accessibilityRole="link"
        accessibilityLabel={`${asset.name}, ${money(asset.value)}`}
        surfaceStyle={styles.row}
        hoverStyle={styles.hovered}
        pressedStyle={styles.hovered}
      >
        <InstitutionAvatar institution={{ name: asset.name, initials: '', tone: 'neutral', icon, syncedAt: '' }} />
        <View style={styles.info}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {asset.name}
          </Text>
          {caption ? (
            <Text variant="caption" tone="secondary" numberOfLines={2}>
              {caption}
            </Text>
          ) : null}
        </View>
        <Text variant="bodyStrong" align="right" numberOfLines={1}>
          {money(asset.value)}
        </Text>
        {/* The narrowest phones drop the chevron to save room. */}
        {rt.breakpoint === 'xs' ? null : (
          <ChevronRight size={16} strokeWidth={2} color={theme.colors.text.tertiary} />
        )}
      </Touchable>
    </Link>
  );
}

function captionOf(asset: Asset, t: TFunction, money: (cents: number) => string) {
  switch (asset.kind) {
    case 'property': {
      const price = asset.property?.price ?? 0;
      return price > 0
        ? t('possessions.caption.paidOf', { paid: money(asset.paid), price: money(price) })
        : t('possessions.caption.paid', { amount: money(asset.paid) });
    }
    case 'shares':
      return t('possessions.caption.shares', { count: asset.shares?.quantity ?? 0 });
    case 'pension': {
      const balances = asset.pension?.balances ?? [];
      const latest = balances[balances.length - 1];
      return latest ? t('possessions.caption.asOf', { date: formatDate(latest.date) }) : undefined;
    }
    case 'vehicle':
      return asset.vehicle
        ? t('possessions.caption.vehicle', {
            price: money(asset.vehicle.price),
            rate: formatPercent(asset.vehicle.rate, 0),
          })
        : undefined;
  }
  return undefined;
}

/**
 * Where a home's payment plan stands: how much of its price is paid, the
 * next payment and what's left for handover. Without a plan, a way to add it.
 */
function PlanSummary({ asset }: { asset: Asset }) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const plan = asset.property;
  const money = (cents: number) => formatCurrency(cents / 100, asset.currency);
  if (!plan || plan.price <= 0) {
    return (
      <View style={styles.plan}>
        <Text variant="caption" tone="secondary">
          {t('possessions.plan.missing')}
        </Text>
        <View style={styles.action}>
          <Link href={{ pathname: '/investments/[id]', params: { id: asset.id } }} asChild>
            <Button icon={CalendarPlus} label={t('possessions.plan.add')} />
          </Link>
        </View>
      </View>
    );
  }
  const items = schedule(plan, asset.paid, today());
  const next = items.find((item) => item.status !== 'paid' && item.kind !== 'delivery');
  const delivery = items.find((item) => item.kind === 'delivery');
  const done = !next && (!delivery || delivery.status === 'paid');
  return (
    <View style={styles.plan}>
      <ProgressBar value={asset.paid / plan.price} color={theme.colors.chart.amber} />
      {next ? (
        <Text variant="caption" tone={next.status === 'overdue' ? 'accent' : 'secondary'}>
          {t(next.status === 'overdue' ? 'possessions.plan.overdue' : 'possessions.plan.next', {
            amount: money(next.amount - next.covered),
            date: next.date ? keepTogether(formatDate(next.date)) : '',
            label: keepTogether(scheduleLabel(next, t)),
          })}
        </Text>
      ) : null}
      {delivery && delivery.status !== 'paid' ? (
        <Text variant="caption" tone="secondary">
          {delivery.date
            ? t('possessions.plan.delivery', {
                amount: money(delivery.amount - delivery.covered),
                date: formatDate(delivery.date),
              })
            : t('possessions.plan.deliveryUndated', { amount: money(delivery.amount - delivery.covered) })}
        </Text>
      ) : null}
      {done ? (
        <Text variant="caption" tone="positive">
          {t('possessions.plan.done')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  item: {
    gap: theme.space[1],
  },
  // Room before the next one's divider; the last one has the card's padding.
  spaced: {
    paddingBottom: theme.space[2],
  },
  divider: {
    borderTopWidth: theme.layout.hairline,
    borderTopColor: theme.colors.border,
    paddingTop: theme.space[1],
  },
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
  plan: {
    gap: theme.space[1.5],
  },
  action: {
    flexDirection: 'row',
  },
}));
