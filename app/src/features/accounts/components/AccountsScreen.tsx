import { Link } from 'expo-router';
import { FileUp, Plus, RefreshCw } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PageHeader } from '@/components/PageHeader';
import { PeriodControls, usePeriod } from '@/components/PeriodHeader';
import { Screen } from '@/components/Screen';
import { Button, Card, Text } from '@/components/ui';
import { formatDate } from '@/lib/dates';

import { refreshLiveAccounts } from '../api/liveAccounts';
import { useAccounts } from '../api/useAccounts';
import { AccountListCard } from './AccountListCard';
import { AccountsKpis } from './AccountsKpis';
import { BalanceSheetCard } from './BalanceSheetCard';
import { CreditUtilizationCard } from './CreditUtilizationCard';

/** The accounts found in the imported statements. */
export function AccountsScreen() {
  const { t } = useTranslation();
  const { preset, range, setPreset, setRange } = usePeriod('ytd');
  const overview = useAccounts(range);
  const { status, accounts, latestStatement } = overview;

  return (
    <Screen
      header={
        <PageHeader
          title={t('nav.accounts')}
          subtitle={
            latestStatement
              ? t('accounts.live.subtitle', { date: formatDate(latestStatement) })
              : t('accounts.live.subtitleEmpty')
          }
          actions={<PeriodControls range={range} preset={preset} onRangeChange={setRange} onPresetChange={setPreset} />}
          desktopAction={<ImportButton />}
          mobileAction={<ImportButton iconOnly />}
        />
      }
    >
      {accounts.length === 0 ? (
        <EmptyState status={status} />
      ) : (
        <>
          {status === 'offline' ? <OfflineNotice /> : null}
          <AccountsKpis overview={overview} />
          <AccountListCard overview={overview} />
          <View style={styles.action}>
            <Link href="/investments/new" asChild>
              <Button icon={Plus} label={t('assets.add')} />
            </Link>
          </View>
          <View style={styles.row}>
            <CreditUtilizationCard overview={overview} />
            <BalanceSheetCard overview={overview} />
          </View>
        </>
      )}
    </Screen>
  );
}

/** Goes to the page that imports statements, where accounts come from. */
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

function EmptyState({ status }: { status: 'loading' | 'ready' | 'offline' }) {
  const { t } = useTranslation();
  if (status === 'loading') {
    return (
      <Card>
        <Text tone="secondary">{t('accounts.live.loading')}</Text>
      </Card>
    );
  }
  if (status === 'offline') return <OfflineNotice />;
  return (
    <Card title={t('accounts.live.emptyTitle')}>
      <Text tone="secondary">{t('accounts.live.emptyBody')}</Text>
      <View style={styles.action}>
        <Link href="/imports" asChild>
          <Button variant="primary" icon={FileUp} label={t('accounts.live.import')} />
        </Link>
      </View>
    </Card>
  );
}

function OfflineNotice() {
  const { t } = useTranslation();
  return (
    <Card>
      <Text tone="secondary">{t('accounts.live.offline')}</Text>
      <View style={styles.action}>
        <Button icon={RefreshCw} label={t('accounts.live.retry')} onPress={() => void refreshLiveAccounts()} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: { xs: 'column', md: 'row' },
    alignItems: { xs: 'stretch', md: 'flex-start' },
    gap: theme.space[4],
  },
  action: {
    flexDirection: 'row',
  },
}));
