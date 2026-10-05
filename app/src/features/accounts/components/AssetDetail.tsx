import type { TFunction } from 'i18next';
import { Link } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Button, Card, StatCard, Text } from '@/components/ui';
import { accountName, schedule, useAssets, useLedger, type Asset, type ScheduleItem } from '@/features/ledger';
import { formatDate, formatShortDate, today } from '@/lib/dates';
import { dotSeparator, formatCurrency, formatPercent, formatSignedCurrency, keepTogether } from '@/lib/format';

/** The asset's ID from its account's: "asset:torre-las-palmas" is "torre-las-palmas". */
export const assetIdOf = (accountId: string) => accountId.replace(/^asset:/, '');

/** Edits the asset: its plan, its shares' price, the texts that link its payments. */
export function EditAssetButton({ accountId, iconOnly = false }: { accountId: string; iconOnly?: boolean }) {
  const { t } = useTranslation();
  return (
    <Link href={{ pathname: '/investments/[id]', params: { id: assetIdOf(accountId) } }} asChild>
      <Button label={iconOnly ? undefined : t('assets.detail.edit')} accessibilityLabel={t('assets.detail.edit')} />
    </Link>
  );
}

/**
 * A home's plan and payments, shares' value, what a debt still owes, a
 * pension fund's statements or what a vehicle is worth, for its account page.
 */
export function AssetDetail({ accountId }: { accountId: string }) {
  const { t } = useTranslation();
  const { assets, status } = useAssets();
  const asset = assets.find((item) => item.id === assetIdOf(accountId));
  if (!asset) {
    return (
      <Card>
        <Text tone="secondary">{status === 'loading' ? t('common.data.loading') : t('common.data.offline')}</Text>
      </Card>
    );
  }
  return (
    <>
      {asset.kind === 'property' ? (
        <PropertyKpis asset={asset} />
      ) : asset.kind === 'debt' ? (
        asset.schedule ? (
          <ScheduleKpis asset={asset} />
        ) : (
          <DebtKpis asset={asset} />
        )
      ) : asset.kind === 'vehicle' ? (
        <VehicleKpis asset={asset} />
      ) : asset.kind === 'pension' ? (
        <PensionKpis asset={asset} />
      ) : (
        <SharesKpis asset={asset} />
      )}
      {asset.kind === 'property' ? <PlanCard asset={asset} /> : null}
      {asset.kind === 'pension' ? <BalancesCard asset={asset} /> : null}
      {/* Only linked movements show: a fund's payroll contributions, a vehicle and a loan paid by someone else have none. */}
      {asset.payments.length > 0 || (asset.kind !== 'pension' && asset.kind !== 'vehicle' && !asset.schedule) ? (
        <PaymentsCard asset={asset} />
      ) : null}
    </>
  );
}

/** "Installment 3 of 8", "Reservation"… */
export function scheduleLabel(item: ScheduleItem, t: TFunction) {
  return item.kind === 'installment'
    ? t('assets.detail.labels.installment', { number: item.number ?? 0, count: item.count ?? 0 })
    : t(`assets.detail.labels.${item.kind}`);
}

function PropertyKpis({ asset }: { asset: Asset }) {
  const { t } = useTranslation();
  const plan = asset.property ?? { price: 0 };
  const items = schedule(plan, asset.paid, today());
  const next = items.find((item) => item.status !== 'paid');
  const delivery = items.find((item) => item.kind === 'delivery');
  const money = (cents: number) => formatCurrency(cents / 100, asset.currency);
  return (
    <View style={styles.grid}>
      <StatCard
        label={t('assets.detail.paid')}
        value={money(asset.paid)}
        caption={
          plan.price > 0
            ? t('assets.detail.paidOfPrice', { percent: formatPercent(asset.paid / plan.price, 0), price: money(plan.price) })
            : t('assets.detail.noPrice')
        }
      />
      <StatCard
        label={t('assets.detail.nextPayment')}
        value={next ? money(next.amount - next.covered) : t('assets.detail.nothingDue')}
        caption={
          next
            ? t('assets.detail.nextPaymentCaption', {
                date: next.date ? formatShortDate(next.date) : t('assets.detail.noDate'),
                label: scheduleLabel(next, t),
              })
            : undefined
        }
      />
      {delivery ? (
        <StatCard
          label={t('assets.detail.onDelivery')}
          value={money(delivery.amount - delivery.covered)}
          caption={
            delivery.date ? t('assets.detail.onDeliveryCaption', { date: formatDate(delivery.date) }) : t('assets.detail.noDate')
          }
        />
      ) : null}
    </View>
  );
}

function SharesKpis({ asset }: { asset: Asset }) {
  const { t } = useTranslation();
  const holding = asset.shares ?? { quantity: 0 };
  const money = (cents: number) => formatCurrency(cents / 100, asset.currency);
  const perShare = holding.price ?? (holding.quantity > 0 ? asset.paid / holding.quantity : 0);
  const gain = asset.value - asset.paid;
  return (
    <View style={styles.grid}>
      <StatCard
        label={t('assets.detail.value')}
        value={money(asset.value)}
        caption={
          holding.price
            ? t('assets.detail.gain', { amount: formatSignedCurrency(gain / 100, asset.currency) })
            : t('assets.detail.atCost')
        }
      />
      <StatCard label={t('assets.detail.quantity')} value={String(holding.quantity)} />
      <StatCard
        label={t('assets.detail.pricePerShare')}
        value={money(perShare)}
        caption={holding.priceDate ? formatDate(holding.priceDate) : undefined}
      />
      <StatCard label={t('assets.detail.cost')} value={money(asset.paid)} />
    </View>
  );
}

/** A debt's value is what's still owed and what's paid into it is what went back. */
function DebtKpis({ asset }: { asset: Asset }) {
  const { t } = useTranslation();
  const money = (cents: number) => formatCurrency(cents / 100, asset.currency);
  const borrowed = asset.value + asset.paid;
  return (
    <View style={styles.grid}>
      <StatCard label={t('assets.detail.owed')} value={money(asset.value)} />
      <StatCard label={t('assets.detail.borrowed')} value={money(borrowed)} />
      <StatCard
        label={t('assets.detail.repaid')}
        value={money(asset.paid)}
        caption={
          borrowed > 0 ? t('assets.detail.repaidShare', { percent: formatPercent(asset.paid / borrowed, 0) }) : undefined
        }
      />
    </View>
  );
}

/** A vehicle is worth what it cost less its yearly depreciation. */
function VehicleKpis({ asset }: { asset: Asset }) {
  const { t } = useTranslation();
  const vehicle = asset.vehicle;
  const money = (cents: number) => formatCurrency(cents / 100, asset.currency);
  return (
    <View style={styles.grid}>
      <StatCard
        label={t('assets.detail.value')}
        value={money(asset.value)}
        caption={
          vehicle ? t('assets.detail.boughtFor', { price: money(vehicle.price), date: formatDate(vehicle.date) }) : undefined
        }
      />
      {vehicle ? (
        <StatCard
          label={t('assets.detail.depreciation')}
          value={formatPercent(vehicle.rate, 0)}
          caption={t('assets.detail.lost', { amount: money(vehicle.price - asset.value) })}
        />
      ) : null}
    </View>
  );
}

/** A loan someone else pays: what's owed by its installments, each one, and its rate. */
function ScheduleKpis({ asset }: { asset: Asset }) {
  const { t } = useTranslation();
  const schedule = asset.schedule;
  const money = (cents: number) => formatCurrency(cents / 100, asset.currency);
  if (!schedule) return null;
  return (
    <View style={styles.grid}>
      <StatCard label={t('assets.detail.owed')} value={money(asset.value)} caption={t('assets.detail.owedBySchedule')} />
      <StatCard
        label={t('assets.detail.installment')}
        value={money(asset.installment ?? 0)}
        caption={t('assets.detail.installmentsLeft', { count: asset.remaining ?? 0 })}
      />
      <StatCard
        label={t('assets.detail.rate')}
        value={formatPercent(schedule.rate)}
        caption={t('assets.detail.lastInstallment', { date: formatDate(schedule.last) })}
      />
    </View>
  );
}

/** A fund is worth its latest statement; how much it grew since the first one you entered. */
function PensionKpis({ asset }: { asset: Asset }) {
  const { t } = useTranslation();
  const balances = asset.pension?.balances ?? [];
  const first = balances[0];
  const latest = balances[balances.length - 1];
  return (
    <View style={styles.grid}>
      <StatCard
        label={t('assets.detail.balance')}
        value={formatCurrency(asset.value / 100, asset.currency)}
        caption={latest ? t('assets.detail.asOf', { date: formatDate(latest.date) }) : undefined}
      />
      {first && latest && first !== latest ? (
        <StatCard
          label={t('assets.detail.change')}
          value={formatSignedCurrency((latest.amount - first.amount) / 100, asset.currency)}
          caption={t('assets.detail.since', { date: formatDate(first.date) })}
        />
      ) : null}
    </View>
  );
}

/** The balances of the fund's statements, newest first, each with what it grew since the one before. */
function BalancesCard({ asset }: { asset: Asset }) {
  const { t } = useTranslation();
  const balances = asset.pension?.balances ?? [];
  const rows = balances
    .map((balance, index) => ({ ...balance, change: index > 0 ? balance.amount - (balances[index - 1]?.amount ?? 0) : null }))
    .reverse();
  return (
    <Card title={t('assets.detail.balancesTitle')}>
      <View accessibilityRole="list">
        {rows.map((row, index) => (
          <View key={row.date} style={[styles.row, index > 0 && styles.divider]}>
            <View style={styles.rowText}>
              <Text variant="bodyMedium">{formatDate(row.date)}</Text>
              {row.change !== null ? (
                <Text variant="caption" tone="secondary">
                  {t('assets.detail.sincePrevious', {
                    amount: formatSignedCurrency(row.change / 100, asset.currency),
                  })}
                </Text>
              ) : null}
            </View>
            <Text variant="bodyStrong">{formatCurrency(row.amount / 100, asset.currency)}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function PlanCard({ asset }: { asset: Asset }) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const plan = asset.property;
  const items = plan ? schedule(plan, asset.paid, today()) : [];
  if (!plan || items.length === 0) {
    return (
      <Card title={t('assets.detail.emptyPlanTitle')}>
        <Text tone="secondary">{t('assets.detail.emptyPlan')}</Text>
        <View style={styles.action}>
          <EditAssetButton accountId={`asset:${asset.id}`} />
        </View>
      </Card>
    );
  }
  const money = (cents: number) => formatCurrency(cents / 100, asset.currency);
  return (
    <Card title={t('assets.detail.scheduleTitle')}>
      <View accessibilityRole="list">
        {items.map((item, index) => (
          <View key={item.key} style={[styles.row, index > 0 && styles.divider]}>
            <View style={styles.status}>
              {item.status === 'paid' ? (
                <Check size={16} strokeWidth={2.25} color={theme.colors.positive} />
              ) : (
                <View style={[styles.dot, item.status === 'overdue' && styles.dotOverdue]} />
              )}
            </View>
            <View style={styles.rowText}>
              <Text variant="bodyMedium" numberOfLines={1}>
                {scheduleLabel(item, t)}
              </Text>
              <Text variant="caption" tone={item.status === 'overdue' ? 'accent' : 'secondary'}>
                {[
                  item.date ? formatDate(item.date) : t('assets.detail.noDate'),
                  item.status === 'partial'
                    ? t('assets.detail.status.partial', { amount: money(item.covered) })
                    : t(`assets.detail.status.${item.status}`),
                ].join(' · ')}
              </Text>
            </View>
            <Text variant="bodyStrong" tone={item.status === 'paid' ? 'secondary' : 'primary'}>
              {money(item.amount)}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function PaymentsCard({ asset }: { asset: Asset }) {
  const { t } = useTranslation();
  const ledger = useLedger();
  const accounts = new Map(ledger.accounts.map((account) => [account.id, account]));
  const payments = [...asset.payments].reverse();
  // A debt's money comes in and goes back out: signed, as its account shows it.
  const debt = asset.kind === 'debt';
  return (
    <Card title={debt ? t('assets.detail.debtMovementsTitle') : t('assets.detail.paymentsTitle')}>
      {payments.length === 0 ? (
        <Text tone="secondary">{debt ? t('assets.detail.noDebtMovements') : t('assets.detail.noPayments')}</Text>
      ) : (
        <View accessibilityRole="list">
          {payments.map((payment, index) => {
            const account = accounts.get(payment.accountId);
            return (
              <View key={payment.movementId} style={[styles.row, index > 0 && styles.divider]}>
                <View style={styles.rowText}>
                  <Text variant="bodyMedium" numberOfLines={1}>
                    {payment.description}
                  </Text>
                  <Text variant="caption" tone="secondary" numberOfLines={2}>
                    {[
                      formatShortDate(payment.date),
                      account ? accountName(account, ledger.accounts, t) : undefined,
                      payment.auto ? t('assets.detail.linkedByText') : undefined,
                    ]
                      .filter((part): part is string => !!part)
                      .map(keepTogether)
                      .join(dotSeparator)}
                  </Text>
                </View>
                <View style={styles.amounts}>
                  <Text variant="bodyStrong">
                    {debt
                      ? formatSignedCurrency(payment.amount / 100, payment.currency)
                      : formatCurrency(-payment.amount / 100, payment.currency)}
                  </Text>
                  {payment.currency !== asset.currency ? (
                    <Text variant="caption" tone="secondary">
                      {t('assets.detail.paymentValue', {
                        value: formatCurrency(Math.abs(payment.value) / 100, asset.currency),
                      })}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create((theme) => ({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: { xs: theme.space[3], md: theme.space[4] },
  },
  action: {
    flexDirection: 'row',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[3],
    paddingVertical: theme.space[2.5],
  },
  divider: {
    borderTopWidth: theme.layout.hairline,
    borderTopColor: theme.colors.border,
  },
  status: {
    width: 16,
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: theme.radius.full,
    borderWidth: theme.layout.hairline,
    borderColor: theme.colors.control,
  },
  dotOverdue: {
    backgroundColor: theme.colors.accent.default,
    borderColor: theme.colors.accent.default,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: theme.space[0.5],
  },
  amounts: {
    alignItems: 'flex-end',
    gap: theme.space[0.5],
  },
}));
