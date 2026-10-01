import { Link } from 'expo-router';
import { FileUp } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button, Card, Text } from '@/components/ui';

/**
 * Stands in for a screen's cards while it has nothing to show: while
 * domfin-api answers, when it doesn't, or when no imported statement covers
 * the period.
 */
export function DataNotice({ status }: { status: 'loading' | 'ready' | 'offline' }) {
  const { t } = useTranslation();
  if (status !== 'ready') {
    return (
      <Card>
        <Text tone="secondary">{status === 'loading' ? t('common.data.loading') : t('common.data.offline')}</Text>
      </Card>
    );
  }
  return (
    <Card>
      <Text tone="secondary">{t('common.data.empty')}</Text>
      <View style={styles.action}>
        <Link href="/imports" asChild>
          <Button variant="primary" icon={FileUp} label={t('nav.imports')} />
        </Link>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  action: {
    flexDirection: 'row',
  },
});
