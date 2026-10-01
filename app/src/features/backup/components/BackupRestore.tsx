import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button, SegmentedControl, Text, TextField } from '@/components/ui';
import { Field } from '@/features/ledger';

import { backupErrorOf, listBackups, restoreBackup, useBackupPlaces } from '../api/backup';
import { formatSize, formatWhen, placeName } from '../lib/format';
import type { BackupErrorCode, BackupFile, BackupStatus } from '../types';
import { OTHER } from './BackupSetup';
import { ChoiceList, type Choice } from './ChoiceList';
import { SecretField } from './PasswordFields';

type Listing = { backups: BackupFile[]; hasKey: boolean } | 'missing';

/**
 * Brings a backup back: from this computer's backup folder, another cloud
 * folder with Domfin's backups (a new computer) or any folder, opened with
 * the password or the recovery key.
 */
export function BackupRestore({
  status,
  onCancel,
  onRestored,
}: {
  status: BackupStatus | null;
  onCancel: () => void;
  onRestored: () => void;
}) {
  const { t } = useTranslation();
  const places = useBackupPlaces();
  const [source, setSource] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const [searched, setSearched] = useState('');
  const [listings, setListings] = useState<Record<string, Listing>>({});
  const [picked, setPicked] = useState<string | null>(null);
  const [method, setMethod] = useState<'password' | 'recoveryKey'>('password');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<BackupErrorCode | null>(null);
  const [busy, setBusy] = useState(false);

  const current = status?.configured ? status.folder : undefined;
  const sources: Choice<string>[] = [
    ...(current ? [{ value: current, label: t('backup.restore.current'), detail: current }] : []),
    ...(places ?? [])
      .filter((place) => place.hasBackups && place.folder !== current)
      .map((place) => ({ value: place.folder, label: placeName(place, t), detail: place.folder })),
    { value: OTHER, label: t('backup.where.other') },
  ];
  const value = source ?? sources[0].value;
  const folder = value === OTHER ? searched : value;
  const listing = folder ? listings[folder] : undefined;

  useEffect(() => {
    if (!folder) return;
    let active = true;
    listBackups(folder)
      .then((answer) => active && setListings((known) => ({ ...known, [folder]: answer })))
      .catch(() => active && setListings((known) => ({ ...known, [folder]: 'missing' })));
    return () => {
      active = false;
    };
  }, [folder]);

  const backups = listing && listing !== 'missing' ? listing.backups : [];
  const backup = backups.find((candidate) => candidate.file === picked) ?? backups[0];
  // Without the key file next to them, only the recovery key opens them.
  const unlockWith = listing && listing !== 'missing' && !listing.hasKey ? 'recoveryKey' : method;

  const submit = () => {
    if (busy || !folder || !backup || secret === '') return;
    setBusy(true);
    restoreBackup(folder, backup, unlockWith === 'password' ? { password: secret } : { recoveryKey: secret })
      .then(onRestored)
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
      <Field label={t('backup.restore.from')}>
        <ChoiceList
          choices={sources}
          value={value}
          onChange={(next) => change(() => setSource(next))}
          accessibilityLabel={t('backup.restore.from')}
        />
      </Field>
      {value === OTHER ? (
        <Field label={t('backup.where.other')} hint={t('backup.where.otherHint')}>
          <View style={styles.search}>
            <TextField
              value={other}
              onChangeText={(next) => change(() => setOther(next))}
              onSubmitEditing={() => setSearched(other.trim())}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={t('backup.where.otherPlaceholder')}
              accessibilityLabel={t('backup.where.other')}
              containerStyle={styles.searchField}
            />
            <Button label={t('backup.restore.search')} onPress={() => setSearched(other.trim())} disabled={other.trim() === ''} />
          </View>
        </Field>
      ) : null}

      {!folder ? null : listing === undefined ? (
        <Text tone="secondary">{t('backup.restore.loading')}</Text>
      ) : listing === 'missing' ? (
        <Text tone="accent">{t('backup.errors.folder_missing')}</Text>
      ) : backups.length === 0 ? (
        <Text tone="secondary">{t('backup.restore.empty')}</Text>
      ) : (
        <>
          <Field label={t('backup.restore.pick')}>
            <ChoiceList
              choices={backups.slice(0, 10).map((candidate) => ({
                value: candidate.file,
                label: t('backup.restore.option', {
                  date: formatWhen(candidate.at),
                  size: formatSize(candidate.bytes, t),
                }),
              }))}
              value={backup?.file ?? null}
              onChange={(next) => change(() => setPicked(next))}
              accessibilityLabel={t('backup.restore.pick')}
            />
          </Field>
          {listing.hasKey ? (
            <Field label={t('backup.restore.unlock')}>
              <SegmentedControl
                options={[
                  { value: 'password', label: t('backup.restore.withPassword') },
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
          ) : (
            <Text tone="secondary">{t('backup.restore.noKey')}</Text>
          )}
          <SecretField
            label={unlockWith === 'password' ? t('backup.password.label') : t('backup.recovery.label')}
            value={secret}
            onChange={(next) => change(() => setSecret(next))}
            onSubmit={submit}
            placeholder={unlockWith === 'recoveryKey' ? t('backup.recovery.placeholder') : undefined}
          />
          <Text variant="caption" tone="tertiary">
            {t('backup.restore.warning')}
          </Text>
        </>
      )}
      {error ? <Text tone="accent">{t(`backup.errors.${error}`)}</Text> : null}
      <View style={styles.actions}>
        <Button
          variant="primary"
          label={t('backup.restore.confirm')}
          onPress={submit}
          disabled={busy || !backup || secret === ''}
        />
        <Button label={t('backup.cancel')} onPress={onCancel} disabled={busy} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  form: {
    gap: theme.space[4],
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2],
  },
  searchField: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space[2],
  },
}));
