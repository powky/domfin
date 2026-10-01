import { ExternalLink } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Linking, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button, Card, Text } from '@/components/ui';

import { useUpdates } from '../api/useUpdates';

/** Which versions are running, and whether a newer release is out on GitHub. */
export function AboutCard() {
  const { t } = useTranslation();
  const { status, app, api, latest, url, available } = useUpdates();
  return (
    <Card title={t('updates.title')}>
      <VersionRow label={t('updates.app')} version={app} />
      <VersionRow label={t('updates.api')} version={status === 'offline' ? undefined : api} />
      {available && latest ? (
        <View style={styles.row}>
          <Text variant="bodyMedium" tone="accent" style={styles.text}>
            {t('updates.newer', { version: latest })}
          </Text>
          {url ? <Button icon={ExternalLink} label={t('updates.notes')} onPress={() => Linking.openURL(url)} /> : null}
        </View>
      ) : null}
      <Text tone="secondary">
        {status === 'offline' ? t('common.data.offline') : available ? t('updates.howTo') : t('updates.upToDate')}
      </Text>
      <Text variant="caption" tone="tertiary">
        {t('updates.privacy')}
      </Text>
    </Card>
  );
}

function VersionRow({ label, version }: { label: string; version?: string }) {
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      <Text variant="bodyMedium" style={styles.text}>
        {label}
      </Text>
      <Text tone="secondary">{version ? t('updates.running', { version }) : t('updates.unknown')}</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[3],
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
}));
