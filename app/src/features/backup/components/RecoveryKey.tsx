import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';
import { Copy } from 'lucide-react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button, Checkbox, Text } from '@/components/ui';

/** The browser's clipboard, on the web; the app shows the key as selectable text instead. */
const clipboard = Platform.OS === 'web' ? globalThis.navigator?.clipboard : undefined;

/**
 * The recovery key, shown once, right after backups are turned on with a
 * new key: it opens them if the password is forgotten.
 */
export function RecoveryKey({ recoveryKey, onDone }: { recoveryKey: string; onDone: () => void }) {
  const { t } = useTranslation();
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <View style={styles.panel}>
      <Text variant="bodyStrong">{t('backup.recovery.title')}</Text>
      <Text tone="secondary">{t('backup.recovery.body')}</Text>
      <View style={styles.key}>
        <Text selectable style={styles.keyText} accessibilityLabel={t('backup.recovery.label')}>
          {recoveryKey}
        </Text>
      </View>
      {clipboard ? (
        <View style={styles.row}>
          <Button
            icon={Copy}
            label={copied ? t('backup.recovery.copied') : t('backup.recovery.copy')}
            onPress={() => {
              clipboard.writeText(recoveryKey).then(
                () => setCopied(true),
                () => setCopied(false),
              );
            }}
          />
        </View>
      ) : null}
      <View style={styles.row}>
        <Checkbox checked={saved} onChange={setSaved} accessibilityLabel={t('backup.recovery.saved')} />
        <Text onPress={() => setSaved(!saved)}>{t('backup.recovery.saved')}</Text>
      </View>
      <View style={styles.row}>
        <Button variant="primary" label={t('backup.recovery.done')} onPress={onDone} disabled={!saved} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  panel: {
    gap: theme.space[3],
  },
  key: {
    padding: theme.space[3],
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceMuted,
  },
  keyText: {
    fontFamily: theme.font.family.medium,
    letterSpacing: theme.font.letterSpacing.wide,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.space[2],
  },
}));
