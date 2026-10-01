import { useTranslation } from 'react-i18next';

import { TextField, type TextFieldProps } from './TextField';

export type SearchInputProps = Omit<TextFieldProps, 'clearable' | 'clearAccessibilityLabel'>;

/** Text field for search: no autocorrect or capitalization, and a clear button. */
export function SearchInput(props: SearchInputProps) {
  const { t } = useTranslation();
  return (
    <TextField
      autoCapitalize="none"
      returnKeyType="search"
      {...props}
      clearable
      clearAccessibilityLabel={t('common.clearSearch')}
    />
  );
}
