import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ChevronDown } from 'lucide-react-native';

import { Pill, Select, Text } from '@/components/ui';

import { categoryIdsOf, isUncategorized } from '../lib/filters';
import type { Transaction } from '../types';

export type CategoryLabelProps = {
  transaction: Transaction;
  categoryLabels: ReadonlyMap<string, string>;
  /** The categories that fit it: with them, the label opens a menu to pick one. */
  options?: readonly { value: string; label: string }[];
  /** `null` gives it back to the automatic classification. */
  onChange?: (categoryId: string | null) => void;
};

/** Stands for "back to automatic" among the choices. */
const AUTOMATIC = '__automatic__';

/**
 * Category name: a gray second line on phones, a table column from `md` up.
 * "Uncategorized" is always in accent; split transactions show a pill plus
 * their categories. With `options`, pressing it picks another category.
 */
export function CategoryLabel({ transaction, categoryLabels, options, onChange }: CategoryLabelProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  if (!options || !onChange || transaction.splits) {
    return <CategoryText transaction={transaction} categoryLabels={categoryLabels} />;
  }
  const choices = transaction.corrected
    ? [{ value: AUTOMATIC, label: t('transactions.selection.automatic') }, ...options]
    : options;
  return (
    <Select
      options={choices}
      value={transaction.categoryId ?? ''}
      onChange={(value) => onChange(value === AUTOMATIC ? null : value)}
      accessibilityLabel={t('transactions.row.changeCategory', { merchant: transaction.merchant })}
      triggerStyle={styles.picker}
      triggerHoverStyle={styles.pickerHovered}
      trigger={
        <>
          <CategoryText transaction={transaction} categoryLabels={categoryLabels} />
          <ChevronDown size={14} strokeWidth={2} color={theme.colors.text.tertiary} />
        </>
      }
    />
  );
}

function CategoryText({ transaction, categoryLabels }: Omit<CategoryLabelProps, 'options' | 'onChange'>) {
  const { t } = useTranslation();
  if (isUncategorized(transaction)) {
    return (
      <Text tone="accent" numberOfLines={1} style={styles.text}>
        {t('categories.uncategorized')}
      </Text>
    );
  }
  const labels = categoryIdsOf(transaction).map((id) => categoryLabels.get(id) ?? id);
  if (transaction.splits) {
    return (
      <View style={styles.split}>
        <Pill label={t('categories.split')} />
        <Text numberOfLines={1} style={[styles.text, styles.category, styles.splitText]}>
          {labels.join(', ')}
        </Text>
      </View>
    );
  }
  return (
    <Text numberOfLines={1} style={[styles.text, styles.category]}>
      {transaction.assetName ? `${labels[0]} · ${transaction.assetName}` : labels[0]}
    </Text>
  );
}

const styles = StyleSheet.create((theme) => ({
  text: {
    fontSize: { xs: theme.font.size.base, md: theme.font.size.lg },
    lineHeight: { xs: theme.font.lineHeight.base, md: theme.font.lineHeight.lg },
  },
  category: {
    color: { xs: theme.colors.text.secondary, md: theme.colors.text.primary },
  },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    gap: theme.space[1],
    marginHorizontal: -theme.space[1.5],
    paddingHorizontal: theme.space[1.5],
    paddingVertical: theme.space[0.5],
    borderRadius: theme.radius.sm,
  },
  pickerHovered: {
    backgroundColor: theme.colors.surfaceHover,
  },
  split: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[1.5],
    minWidth: 0,
  },
  splitText: {
    flexShrink: 1,
  },
}));
