import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Card, Text } from '@/components/ui';

import { PageHeader } from './PageHeader';
import { Screen } from './Screen';

export function ComingSoon({ title }: { title: string }) {
  const { t } = useTranslation();
  return (
    <Screen header={<PageHeader title={title} />}>
      <Card>
        <View style={styles.body}>
          <Text variant="heading">{t('common.comingSoon.title')}</Text>
          <Text tone="secondary">{t('common.comingSoon.body')}</Text>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create((theme) => ({
  body: {
    gap: theme.space[1],
  },
}));
