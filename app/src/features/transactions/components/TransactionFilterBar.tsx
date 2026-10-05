import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { SegmentedControl, Select, type SelectOption } from '@/components/ui';
import { usePhoneLayout } from '@/theme';

import type { StatusFilter, TransactionFilters } from '../types';

type DropdownFilters = Pick<TransactionFilters, 'kind' | 'accountId' | 'categoryId' | 'tag'>;

export type TransactionFilterBarProps = {
  status: StatusFilter;
  onStatusChange: (status: StatusFilter) => void;
  filters: DropdownFilters;
  onFilterChange: <K extends keyof DropdownFilters>(key: K, value: DropdownFilters[K]) => void;
  accountOptions: readonly SelectOption<string>[];
  categoryOptions: readonly SelectOption<string>[];
  tagOptions: readonly SelectOption<string>[];
  /** Phones only show the dropdowns once the filters button opens them. */
  dropdownsOpen: boolean;
};

/** In display order; their names are the `transactions.filters.status` translations. */
const statusFilters = [
  'all',
  'needs-review',
  'uncategorized',
  'split',
  'hidden',
] as const satisfies readonly StatusFilter[];

/** In display order; their names are the `transactions.filters.kind` translations. */
const kindFilters = ['all', 'expense', 'income', 'transfer'] as const satisfies readonly DropdownFilters['kind'][];

export function TransactionFilterBar({
  status,
  onStatusChange,
  filters,
  onFilterChange,
  accountOptions,
  categoryOptions,
  tagOptions,
  dropdownsOpen,
}: TransactionFilterBarProps) {
  const { t } = useTranslation();
  const phone = usePhoneLayout();
  const statusOptions = statusFilters.map((value) => ({ value, label: t(`transactions.filters.status.${value}`) }));
  const kindOptions = kindFilters.map((value) => ({ value, label: t(`transactions.filters.kind.${value}`) }));
  return (
    <View style={styles.bar}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.statusScroll}
        contentContainerStyle={styles.statusContent}
      >
        <SegmentedControl
          options={statusOptions}
          value={status}
          onChange={onStatusChange}
          accessibilityLabel={t('transactions.filters.status.label')}
        />
      </ScrollView>
      {phone && !dropdownsOpen ? null : (
        <View style={styles.dropdowns}>
          <Select
            options={kindOptions}
            value={filters.kind}
            onChange={(value) => onFilterChange('kind', value)}
            accessibilityLabel={t('transactions.filters.kind.label')}
          />
          <Select
            options={accountOptions}
            value={filters.accountId}
            onChange={(value) => onFilterChange('accountId', value)}
            accessibilityLabel={t('transactions.filters.account')}
          />
          <Select
            options={categoryOptions}
            value={filters.categoryId}
            onChange={(value) => onFilterChange('categoryId', value)}
            accessibilityLabel={t('transactions.filters.category')}
          />
          {/* Only "All tags" until some transaction has one. */}
          {tagOptions.length > 1 ? (
            <Select
              options={tagOptions}
              value={filters.tag}
              onChange={(value) => onFilterChange('tag', value)}
              accessibilityLabel={t('transactions.filters.tag')}
            />
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  bar: {
    flexDirection: { xs: 'column', md: 'row' },
    // Wrapping a column would size it to the widest child and push the card sideways.
    flexWrap: { xs: 'nowrap', md: 'wrap' },
    alignItems: { xs: 'stretch', md: 'center' },
    gap: { xs: theme.space[3], md: theme.space[2] },
  },
  // On phones the segments scroll from edge to edge of the card, so the one
  // cut at the edge reads as "there's more", not as a broken control.
  statusScroll: {
    flexGrow: 0,
    marginHorizontal: { xs: -theme.space[4], md: 0 },
  },
  statusContent: {
    paddingHorizontal: { xs: theme.space[4], md: 0 },
  },
  dropdowns: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.space[2],
  },
}));
