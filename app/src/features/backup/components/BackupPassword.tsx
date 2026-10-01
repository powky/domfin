import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button, SegmentedControl, Text } from '@/components/ui';
import { Field } from '@/features/ledger';

import { backupErrorOf } from '../api/backup';
import type { BackupErrorCode, Unlock } from '../types';
import { NewPasswordFields, SecretField, newPasswordProblem } from './PasswordFields';

/**
 * A new backup password, opening the key with the current one or, when it's
 * forgotten (or there's none yet), with the recovery key.
 */
export function BackupPassword({
  needsPassword,
  changePassword,
  onCancel,
  onDone,
}: {
  needsPassword: boolean;
  changePassword: (unlock: Unlock, newPassword: string) => Promise<unknown>;
  onCancel: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [method, setMethod] = useState<'password' | 'recoveryKey'>(needsPassword ? 'recoveryKey' : 'password');
  const [secret, setSecret] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<BackupErrorCode | 'mismatch' | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = () => {
    if (busy || secret === '') return;
    const problem = newPasswordProblem(password, repeat);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    changePassword(method === 'password' ? { password: secret } : { recoveryKey: secret }, password)
      .then(onDone)
      .catch((reason) => {
        setError(backupErrorOf(reason));
        setBusy(false);
      });
  };
  const change = (next: () => void) => {
    next();
    setError(null);
  };

  return (
    <View style={styles.form}>
      <Text variant="bodyStrong">{t('backup.changePassword.title')}</Text>
      {needsPassword ? null : (
        <Field label={t('backup.restore.unlock')}>
          <SegmentedControl
            options={[
              { value: 'password', label: t('backup.changePassword.withCurrent') },
              { value: 'recoveryKey', label: t('backup.restore.withRecoveryKey') },
            ]}
            value={method}
            onChange={(next) =>
              change(() => {
                setMethod(next);
                setSecret('');
              })
            }
            accessibilityLabel={t('backup.restore.unlock')}
          />
        </Field>
      )}
      <SecretField
        label={method === 'password' ? t('backup.changePassword.current') : t('backup.recovery.label')}
        value={secret}
        onChange={(next) => change(() => setSecret(next))}
        placeholder={method === 'recoveryKey' ? t('backup.recovery.placeholder') : undefined}
      />
      <NewPasswordFields
        label={t('backup.changePassword.newPassword')}
        password={password}
        repeat={repeat}
        onChange={(nextPassword, nextRepeat) =>
          change(() => {
            setPassword(nextPassword);
            setRepeat(nextRepeat);
          })
        }
      />
      {error ? <Text tone="accent">{t(`backup.errors.${error}`)}</Text> : null}
      <View style={styles.actions}>
        <Button variant="primary" label={t('backup.changePassword.save')} onPress={submit} disabled={busy || secret === ''} />
        <Button label={t('backup.cancel')} onPress={onCancel} disabled={busy} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  form: {
    gap: theme.space[4],
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space[2],
  },
}));
