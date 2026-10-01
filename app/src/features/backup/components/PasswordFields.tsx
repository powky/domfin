import { useTranslation } from 'react-i18next';

import { TextField } from '@/components/ui';
import { Field } from '@/features/ledger';

/** At least this long: the key file goes to the cloud, and the password is all that guards it there (domfin-api's MinPassword). */
export const MIN_PASSWORD = 10;

/** A secret typed once: the backup password, its repetition, a recovery key. */
export function SecretField({
  label,
  hint,
  value,
  onChange,
  onSubmit,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <TextField
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        placeholder={placeholder}
        accessibilityLabel={label}
      />
    </Field>
  );
}

/** A new backup password and its repetition. */
export function NewPasswordFields({
  password,
  repeat,
  onChange,
  label,
}: {
  password: string;
  repeat: string;
  onChange: (password: string, repeat: string) => void;
  label?: string;
}) {
  const { t } = useTranslation();
  return (
    <>
      <SecretField
        label={label ?? t('backup.password.label')}
        hint={t('backup.password.hint')}
        value={password}
        onChange={(value) => onChange(value, repeat)}
      />
      <SecretField label={t('backup.password.repeat')} value={repeat} onChange={(value) => onChange(password, value)} />
    </>
  );
}

/** What's wrong with a new password and its repetition, if anything. */
export function newPasswordProblem(password: string, repeat: string): 'short_password' | 'mismatch' | null {
  if ([...password].length < MIN_PASSWORD) return 'short_password';
  if (password !== repeat) return 'mismatch';
  return null;
}
