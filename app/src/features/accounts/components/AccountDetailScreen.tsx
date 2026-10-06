import { Link } from 'expo-router';
import { FileUp } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { BackLink } from '@/components/BackLink';
import { PageHeader } from '@/components/PageHeader';
import { PeriodControls, usePeriod } from '@/components/PeriodHeader';
import { Screen } from '@/components/Screen';
import { Button, Card, Text } from '@/components/ui';
// Not the feature's index, which imports this one's back.
import { LoanPlanSection } from '@/features/loans/components/LoanPlanSection';

import { useAccount } from '../api/useAccounts';
import { institutionLine } from '../lib/accountTypes';
import { AccountDetailKpis } from './AccountDetailKpis';
import { AssetDetail, EditAssetButton } from './AssetDetail';
import { BalanceHistoryCard } from './BalanceHistoryCard';
import { InstitutionAvatar } from './InstitutionAvatar';
import { RecentTransactionsCard } from './RecentTransactionsCard';
import { syncSentence } from './SyncStatusLabel';

export function AccountDetailScreen({ id }: { id: string }) {
  const { t } = useTranslation();
  const { preset, range, setPreset, setRange } = usePeriod('ytd');
  const detail = useAccount(id, range);

  if (detail === undefined) return <AccountLoading />;
  if (!detail) return <AccountNotFound />;
  const { account } = detail;
  // An asset no statement shows: its plan or holding, edited here.
  const asset = account.id.startsWith('asset:');
  const subtitle = asset
    ? account.institution.name
    : `${institutionLine(account)} · ${syncSentence(account.institution)}`;

  return (
    <Screen
      header={
        <PageHeader
          back={{ href: '/accounts', label: t('accounts.detail.back') }}
          title={account.name}
          subtitle={subtitle}
          subtitleIcon={<InstitutionAvatar institution={account.institution} size="xs" />}
          actions={
            <PeriodControls range={range} preset={preset} onRangeChange={setRange} onPresetChange={setPreset} />
          }
          desktopAction={asset ? <EditAssetButton accountId={account.id} /> : <ImportButton />}
          mobileAction={asset ? <EditAssetButton accountId={account.id} /> : <ImportButton iconOnly />}
        />
      }
    >
      {asset ? (
        <>
          <AssetDetail accountId={account.id} />
          <BalanceHistoryCard account={account} months={detail.months} />
        </>
      ) : (
        <>
          <AccountDetailKpis detail={detail} />
          {account.type === 'loan' ? <LoanPlanSection accountId={account.id} currency={account.currency} /> : null}
          <BalanceHistoryCard account={account} months={detail.months} />
          <RecentTransactionsCard detail={detail} />
        </>
      )}
    </Screen>
  );
}

/** Imported accounts update by importing their statements. */
function ImportButton({ iconOnly = false }: { iconOnly?: boolean }) {
  const { t } = useTranslation();
  return (
    <Link href="/imports" asChild>
      <Button
        icon={FileUp}
        iconOnly={iconOnly}
        label={iconOnly ? undefined : t('accounts.live.import')}
        accessibilityLabel={t('accounts.live.import')}
      />
    </Link>
  );
}

function AccountLoading() {
  const { t } = useTranslation();
  return (
    <Screen header={<BackLink href="/accounts" label={t('accounts.detail.back')} />}>
      <Card>
        <Text tone="secondary">{t('accounts.live.loading')}</Text>
      </Card>
    </Screen>
  );
}

function AccountNotFound() {
  const { t } = useTranslation();
  return (
    <Screen
      header={
        <PageHeader
          back={{ href: '/accounts', label: t('accounts.detail.back') }}
          title={t('accounts.detail.notFoundTitle')}
        />
      }
    >
      <Card>
        <Text tone="secondary">{t('accounts.detail.notFoundBody')}</Text>
      </Card>
    </Screen>
  );
}
