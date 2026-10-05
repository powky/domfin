import { Plus, SlidersHorizontal } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button, SearchInput } from '@/components/ui';
import { usePhoneLayout } from '@/theme';

export type TransactionsToolbarProps = {
  query: string;
  onQueryChange: (query: string) => void;
  filtersOpen: boolean;
  /** Dropdown filters in use, flagged on the phone filters button. */
  activeFilterCount: number;
  onToggleFilters: () => void;
  onAdd: () => void;
};

/** Search plus the add action. Phones get icon buttons and a toggle for the dropdown filters. */
export function TransactionsToolbar({
  query,
  onQueryChange,
  filtersOpen,
  activeFilterCount,
  onToggleFilters,
  onAdd,
}: TransactionsToolbarProps) {
  const { t } = useTranslation();
  const phone = usePhoneLayout();
  return (
    <View style={styles.toolbar}>
      <View style={styles.search}>
        <SearchInput
          value={query}
          onChangeText={onQueryChange}
          placeholder={phone ? t('transactions.search.short') : t('transactions.search.long')}
          accessibilityLabel={t('transactions.search.label')}
        />
      </View>
      {phone ? (
        <>
          <View>
            <Button
              icon={SlidersHorizontal}
              iconOnly
              onPress={onToggleFilters}
              accessibilityLabel={filtersOpen ? t('transactions.filters.hide') : t('transactions.filters.show')}
            />
            {activeFilterCount > 0 ? <View style={styles.filterBadge} pointerEvents="none" /> : null}
          </View>
          <Button
            variant="primary"
            icon={Plus}
            iconOnly
            onPress={onAdd}
            accessibilityLabel={t('transactions.add.button')}
          />
        </>
      ) : (
        <Button variant="primary" icon={Plus} label={t('transactions.add.button')} onPress={onAdd} />
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2],
  },
  search: {
    flex: 1,
    minWidth: 0,
  },
  filterBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 10,
    height: 10,
    borderRadius: theme.radius.full,
    borderWidth: 2,
    borderColor: theme.colors.surface,
    backgroundColor: theme.colors.accent.default,
  },
}));
