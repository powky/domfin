import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button, Card, Text, TextField } from '@/components/ui';

import { usePdfPassword } from '../api/password';

/**
 * The password statement PDFs open with, saved in domfin-api's local
 * database. It's typed here and never shown again.
 */
export function PdfPasswordCard() {
  const { t } = useTranslation();
  const { status, password, save, forget } = usePdfPassword();
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState<'saved' | 'forgotten' | 'failed' | null>(null);

  const submit = () => {
    if (draft === '') return;
    save(draft)
      .then(() => {
        setDraft('');
        setMessage('saved');
      })
      .catch(() => setMessage('failed'));
  };
  const remove = () =>
    forget()
      .then(() => setMessage('forgotten'))
      .catch(() => setMessage('failed'));

  const state =
    status === 'loading'
      ? t('common.data.loading')
      : status === 'offline'
        ? t('common.data.offline')
        : password.saved
          ? t('imports.password.saved')
          : password.environment
            ? t('imports.password.environment')
            : t('imports.password.none');

  return (
    <Card title={t('imports.password.title')}>
      <Text tone="secondary">{t('imports.password.description')}</Text>
      <Text variant="bodyMedium">{state}</Text>
      <TextField
        value={draft}
        onChangeText={(value) => {
          setDraft(value);
          setMessage(null);
        }}
        onSubmitEditing={submit}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        placeholder={password.saved ? t('imports.password.replacePlaceholder') : t('imports.password.placeholder')}
        accessibilityLabel={t('imports.password.title')}
      />
      <View style={styles.actions}>
        <Button variant="primary" label={t('imports.password.save')} onPress={submit} disabled={draft === ''} />
        {password.saved ? <Button label={t('imports.password.forget')} onPress={remove} /> : null}
      </View>
      {message ? (
        <Text tone={message === 'failed' ? 'accent' : 'secondary'}>{t(`imports.password.messages.${message}`)}</Text>
      ) : null}
      <Text variant="caption" tone="tertiary">
        {t('imports.password.privacy')}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create((theme) => ({
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space[2],
  },
}));
