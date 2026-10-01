import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button, Text, TextField } from '@/components/ui';
import { Field } from '@/features/ledger';

import { backupErrorOf, useBackupPlaces } from '../api/backup';
import { placeName } from '../lib/format';
import type { BackupErrorCode } from '../types';
import { ChoiceList, type Choice } from './ChoiceList';
import { NewPasswordFields, SecretField, newPasswordProblem } from './PasswordFields';

/** The "other folder" choice: never a folder's path, which is absolute. */
export const OTHER = 'other';

/**
 * Turns backups on: the cloud folder they go to and the password that opens
 * them. A folder that already has backups keeps them, with their password.
 */
export function BackupSetup({
  setup,
  onCancel,
  onDone,
}: {
  setup: (folder: string, password: string) => Promise<string>;
  onCancel: () => void;
  /** With the recovery key of a new key, or '' when the folder's backups were kept. */
  onDone: (recoveryKey: string) => void;
}) {
  const { t } = useTranslation();
  const places = useBackupPlaces();
  const [choice, setChoice] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<BackupErrorCode | 'mismatch' | null>(null);
  const [busy, setBusy] = useState(false);

  if (places === null) return <Text tone="secondary">{t('backup.loading')}</Text>;

  const value = choice ?? places[0]?.folder ?? OTHER;
  const place = places.find((candidate) => candidate.folder === value);
  const folder = value === OTHER ? other.trim() : value;
  // The folder's backups stay, opened with the password they were made with.
  const adopting = place?.hasBackups ?? false;
  const choices: Choice<string>[] = [
    ...places.map((candidate) => ({
      value: candidate.folder,
      label: placeName(candidate, t),
      detail: candidate.folder,
      note: candidate.hasBackups ? t('backup.where.hasBackups') : undefined,
    })),
    { value: OTHER, label: t('backup.where.other') },
  ];

  const ready = folder !== '' && password !== '';
  const submit = () => {
    if (busy || !ready) return;
    const problem = adopting ? null : newPasswordProblem(password, repeat);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setup(folder, password)
      .then(onDone)
      .catch((reason) => setError(backupErrorOf(reason)))
      .finally(() => setBusy(false));
  };
  const change = (next: () => void) => {
    next();
    setError(null);
  };

  return (
    <View style={styles.form}>
      <Field label={t('backup.where.label')}>
        {places.length === 0 ? <Text tone="secondary">{t('backup.where.none')}</Text> : null}
        <ChoiceList
          choices={choices}
          value={value}
          onChange={(next) => change(() => setChoice(next))}
          accessibilityLabel={t('backup.where.label')}
        />
      </Field>
      {value === OTHER ? (
        <Field label={t('backup.where.other')} hint={t('backup.where.otherHint')}>
          <TextField
            value={other}
            onChangeText={(next) => change(() => setOther(next))}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={t('backup.where.otherPlaceholder')}
            accessibilityLabel={t('backup.where.other')}
          />
        </Field>
      ) : null}
      {adopting ? (
        <SecretField
          label={t('backup.password.existing')}
          hint={t('backup.password.existingHint')}
          value={password}
          onChange={(next) => change(() => setPassword(next))}
          onSubmit={submit}
        />
      ) : (
        <NewPasswordFields
          password={password}
          repeat={repeat}
          onChange={(nextPassword, nextRepeat) =>
            change(() => {
              setPassword(nextPassword);
              setRepeat(nextRepeat);
            })
          }
        />
      )}
      {error ? <Text tone="accent">{t(`backup.errors.${error}`)}</Text> : null}
      <View style={styles.actions}>
        <Button variant="primary" label={t('backup.turnOn')} onPress={submit} disabled={busy || !ready} />
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
