import { Link } from 'expo-router';
import { ArrowUpCircle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Text, Touchable } from '@/components/ui';

import { useUpdates } from '../api/useUpdates';

/** "A new version is out", only when one is: goes to Settings, which says what and how to update. */
export function UpdateNotice() {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const { available, latest } = useUpdates();
  if (!available || !latest) return null;
  return (
    <Link href="/settings" asChild>
      <Touchable accessibilityRole="link" surfaceStyle={styles.row} hoverStyle={styles.hovered}>
        <ArrowUpCircle size={18} strokeWidth={1.75} color={theme.colors.accent.default} />
        <View style={styles.text}>
          <Text variant="captionStrong" tone="accent" numberOfLines={1}>
            {t('updates.notice')}
          </Text>
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {t('updates.release', { version: latest })}
          </Text>
        </View>
      </Touchable>
    </Link>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2.5],
    paddingVertical: theme.space[2],
    paddingHorizontal: theme.space[3],
    borderRadius: theme.radius.md,
  },
  hovered: {
    backgroundColor: theme.colors.surfaceHover,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: theme.space[0.5],
  },
}));
