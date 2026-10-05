import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button, Card, Checkbox, Text } from '@/components/ui';

import { backupErrorOf, useBackup } from '../api/backup';
import { useRestored } from '../api/restored';
import { formatSize, formatWhen, placeName } from '../lib/format';
import type { BackupErrorCode, BackupStatus } from '../types';
import { BackupPassword } from './BackupPassword';
import { BackupRestore } from './BackupRestore';
import { BackupSetup } from './BackupSetup';
import { RecoveryKey } from './RecoveryKey';

type Mode = 'overview' | 'setup' | 'restore' | 'password' | 'disable';

type Message =
  | { kind: 'ran' | 'adopted' | 'enabled' | 'passwordChanged' | 'disabled' | 'restored' }
  | { kind: 'error'; code: BackupErrorCode };

/**
 * Encrypted backups of domfin-api's database in a cloud folder: turning them
 * on, how they're going, and bringing one back.
 */
export function BackupCard() {
  const { t } = useTranslation();
  const backup = useBackup();
  const restored = useRestored();
  const [mode, setMode] = useState<Mode>('overview');
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  // Settings remounts its cards after a restore: this one then says how it went.
  const [message, setMessage] = useState<Message | null>(() => (restored.safetyCopy ? { kind: 'restored' } : null));
  const [busy, setBusy] = useState(false);

  const done = (next: Message | null) => {
    setMode('overview');
    setMessage(next);
  };
  const fail = (reason: unknown) => setMessage({ kind: 'error', code: backupErrorOf(reason) });
  const overview = () => setMode('overview');
  const open = (next: Mode) => {
    setMessage(null);
    setMode(next);
  };

  const run = () => {
    setBusy(true);
    setMessage(null);
    backup
      .run()
      .then(() => setMessage({ kind: 'ran' }))
      .catch((reason) => {
        // A backup that failed says why in the status; only a missing domfin-api needs saying here.
        if (backupErrorOf(reason) === 'offline') fail(reason);
      })
      .finally(() => setBusy(false));
  };

  let body: ReactNode;
  if (recoveryKey !== null) {
    body = (
      <RecoveryKey
        recoveryKey={recoveryKey}
        onDone={() => {
          setRecoveryKey(null);
          done({ kind: 'enabled' });
        }}
      />
    );
  } else if (backup.status === 'loading') {
    body = <Text tone="secondary">{t('backup.loading')}</Text>;
  } else if (backup.status === 'offline' || !backup.backup) {
    body = <Text tone="secondary">{t('common.data.offline')}</Text>;
  } else if (mode === 'setup') {
    body = (
      <BackupSetup
        setup={backup.setup}
        onCancel={overview}
        onDone={(key) => {
          if (key) {
            setMode('overview');
            setRecoveryKey(key);
          } else {
            done({ kind: 'adopted' });
          }
        }}
      />
    );
  } else if (mode === 'restore') {
    body = <BackupRestore status={backup.backup} onCancel={overview} onRestored={() => done({ kind: 'restored' })} />;
  } else if (mode === 'password') {
    body = (
      <BackupPassword
        needsPassword={backup.backup.needsPassword}
        changePassword={backup.changePassword}
        onCancel={overview}
        onDone={() => done({ kind: 'passwordChanged' })}
      />
    );
  } else if (mode === 'disable') {
    body = (
      <>
        <Text>{t('backup.actions.disableConfirm')}</Text>
        <View style={styles.actions}>
          <Button
            variant="primary"
            label={t('backup.actions.disable')}
            onPress={() =>
              backup
                .disable()
                .then(() => done({ kind: 'disabled' }))
                .catch((reason) => done({ kind: 'error', code: backupErrorOf(reason) }))
            }
          />
          <Button label={t('backup.cancel')} onPress={overview} />
        </View>
      </>
    );
  } else if (backup.backup.configured) {
    body = (
      <Overview
        status={backup.backup}
        busy={busy}
        onRun={run}
        onRestore={() => open('restore')}
        onPassword={() => open('password')}
        onDisable={() => open('disable')}
        onAutomatic={(automatic) => backup.update({ automatic }).catch(fail)}
      />
    );
  } else {
    body = (
      <>
        <Text tone="secondary" style={styles.description}>
          {t('backup.description')}
        </Text>
        <View style={styles.actions}>
          <Button variant="primary" label={t('backup.turnOn')} onPress={() => open('setup')} />
          <Button label={t('backup.restoreOne')} onPress={() => open('restore')} />
        </View>
      </>
    );
  }

  const showMessage = message !== null && mode === 'overview' && recoveryKey === null;
  return (
    <Card title={t('backup.title')}>
      <View style={styles.body}>
        {body}
        {showMessage ? (
          <Text tone={message.kind === 'error' ? 'accent' : 'secondary'}>
            {message.kind === 'error'
              ? t(`backup.errors.${message.code}`)
              : message.kind === 'restored'
                ? t('backup.messages.restored', {
                    date: restored.backupAt ? formatWhen(restored.backupAt) : '',
                    path: restored.safetyCopy ?? '',
                  })
                : t(`backup.messages.${message.kind}`)}
          </Text>
        ) : null}
        <Text variant="caption" tone="tertiary">
          {t('backup.privacy')}
        </Text>
      </View>
    </Card>
  );
}

function Overview({
  status,
  busy,
  onRun,
  onRestore,
  onPassword,
  onDisable,
  onAutomatic,
}: {
  status: BackupStatus;
  busy: boolean;
  onRun: () => void;
  onRestore: () => void;
  onPassword: () => void;
  onDisable: () => void;
  onAutomatic: (automatic: boolean) => void;
}) {
  const { t } = useTranslation();
  const { place, last } = status;
  // The last backup from here, or the newest in the folder (from another computer, before a restore).
  const latest = last?.file ? { at: last.at, bytes: last.bytes ?? 0 } : status.backups[0];

  return (
    <>
      <View>
        <Text variant="bodyMedium">
          {place
            ? t('backup.status.in', { place: placeName(place, t) })
            : t('backup.status.inFolder', { folder: status.folder })}
        </Text>
        {place ? (
          <Text variant="caption" tone="tertiary" numberOfLines={1} ellipsizeMode="middle">
            {status.folder}
          </Text>
        ) : null}
      </View>
      {status.available ? null : <Text tone="accent">{t('backup.status.unavailable')}</Text>}
      {status.available && last?.error ? (
        <Text tone="accent">{t('backup.status.failed', { reason: t(`backup.errors.${last.error}`) })}</Text>
      ) : null}
      <Text tone="secondary">
        {latest
          ? t('backup.status.last', { date: formatWhen(latest.at), size: formatSize(latest.bytes, t) })
          : t('backup.status.never')}
      </Text>
      {status.backups.length > 0 ? (
        <Text variant="caption" tone="tertiary">
          {t('backup.status.count', { count: status.backups.length })}
        </Text>
      ) : null}
      {status.needsPassword ? <Text tone="accent">{t('backup.status.needsPassword')}</Text> : null}
      <View style={styles.row}>
        <Checkbox checked={status.automatic} onChange={onAutomatic} accessibilityLabel={t('backup.status.automatic')} />
        <Text onPress={() => onAutomatic(!status.automatic)} style={styles.rowText}>
          {t('backup.status.automatic')}
        </Text>
      </View>
      <View style={styles.actions}>
        <Button variant="primary" label={t('backup.actions.run')} onPress={onRun} disabled={busy || !status.available} />
        <Button label={t('backup.actions.restore')} onPress={onRestore} disabled={busy} />
        <Button
          label={status.needsPassword ? t('backup.actions.choosePassword') : t('backup.actions.password')}
          onPress={onPassword}
          disabled={busy}
        />
        <Button label={t('backup.actions.disable')} onPress={onDisable} disabled={busy} />
      </View>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  body: {
    gap: theme.space[3],
  },
  description: {
    marginTop: -theme.space[2],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2],
  },
  rowText: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space[2],
  },
}));
