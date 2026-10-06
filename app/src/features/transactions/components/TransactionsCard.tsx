import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button, Card, Text } from '@/components/ui';
import { useConverter } from '@/features/currency';
import { fits, recipientOf, useRules, type Recipient } from '@/features/ledger';

import { transactionActions } from '../api/useTransactions';
import { EMPTY_FILTERS, filterTransactions, groupByDay, summarize } from '../lib/filters';
import type { MonthRange, StatusFilter, Transaction, TransactionFilters, TransactionsData } from '../types';
import { AddTransactionForm } from './AddTransactionForm';
import { TransactionFilterBar } from './TransactionFilterBar';
import { TransactionList } from './TransactionList';
import { SelectionBar, TransactionsSummary } from './TransactionsSummary';
import { TransactionsToolbar } from './TransactionsToolbar';

const PAGE_SIZE = 100;

/** "2026-09-29" in local time. */
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const NO_SELECTION: ReadonlySet<string> = new Set();

/** What couldn't be saved, by the text that says so. */
const FAILURES = {
  categorize: 'transactions.selection.categorizeFailed',
  link: 'assets.link.failed',
  save: 'transactions.selection.saveFailed',
  add: 'transactions.add.failed',
} as const;

type DropdownFilters = Pick<TransactionFilters, 'kind' | 'accountId' | 'categoryId' | 'tag'>;

const NO_DROPDOWN_FILTERS: DropdownFilters = {
  kind: EMPTY_FILTERS.kind,
  accountId: EMPTY_FILTERS.accountId,
  categoryId: EMPTY_FILTERS.categoryId,
  tag: EMPTY_FILTERS.tag,
};

export type TransactionsCardProps = {
  data: TransactionsData;
  range: MonthRange;
};

/** A rule to offer after filing transfers to someone under a category. */
type Suggestion = { who: Recipient; categoryId: string; direction: 'in' | 'out' };

/** Who all the transactions name, when it's the same one for all. */
function sharedRecipient(transactions: readonly Transaction[]): Recipient | null {
  const recipients = transactions.map((transaction) => recipientOf(transaction.merchant));
  const first = recipients[0];
  return first && recipients.every((recipient) => recipient?.match === first.match) ? first : null;
}

/** Search, filters, summary and the day-grouped list, in one card. */
export function TransactionsCard({ data, range }: TransactionsCardProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(EMPTY_FILTERS.query);
  const [status, setStatus] = useState<StatusFilter>(EMPTY_FILTERS.status);
  const [dropdowns, setDropdowns] = useState(NO_DROPDOWN_FILTERS);
  const [dropdownsOpen, setDropdownsOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [failed, setFailed] = useState<keyof typeof FAILURES | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [ruleResult, setRuleResult] = useState<{ status: 'created' | 'failed'; rule: Suggestion } | null>(null);
  const rules = useRules();
  const deferredQuery = useDeferredValue(query);
  const converter = useConverter();

  const categoryLabels = useMemo(
    () => new Map(data.categories.map((category) => [category.id, category.label])),
    [data.categories],
  );
  const accountNames = useMemo(() => new Map(data.accounts.map((account) => [account.id, account.name])), [data.accounts]);

  // The categories that fit a transaction depend on which way its money goes
  // and on its account's kind: one list for each.
  const categoryOptionsFor = useMemo(() => {
    const flows = new Map(data.categories.map((category) => [category.id, category.kind]));
    const kinds = new Map(data.accounts.map((account) => [account.id, account.kind]));
    const keyOf = (amount: number, kind: string | undefined) => `${amount > 0 ? 'in' : 'out'}:${kind ?? ''}`;
    const lists = new Map(
      [...new Set([...kinds.values(), undefined])].flatMap((kind) =>
        [1, -1].map((amount) => [
          keyOf(amount, kind),
          data.categoryChoices.filter((choice) => {
            const flow = flows.get(choice.value);
            return flow !== undefined && fits({ id: choice.value, flow }, amount, kind);
          }),
        ]),
      ),
    );
    return (transaction: Transaction) =>
      lists.get(keyOf(transaction.amount, kinds.get(transaction.accountId))) ?? data.categoryChoices;
  }, [data.categories, data.accounts, data.categoryChoices]);

  /** Files transactions under a category, then offers a rule when they all name the same person. */
  const categorize = useCallback((transactions: readonly Transaction[], categoryId: string | null) => {
    setFailed(null);
    setRuleResult(null);
    setSuggestion(null);
    transactionActions
      .categorize(
        transactions.map((transaction) => transaction.id),
        categoryId,
      )
      .then(() => {
        const who = categoryId ? sharedRecipient(transactions) : null;
        if (who && categoryId) {
          setSuggestion({ who, categoryId, direction: transactions[0].amount > 0 ? 'in' : 'out' });
        }
      })
      .catch(() => setFailed('categorize'));
  }, []);
  const categorizeOne = useCallback(
    (transaction: Transaction, categoryId: string | null) => categorize([transaction], categoryId),
    [categorize],
  );

  const createRule = () => {
    if (!suggestion || !rules.value) return;
    const rule = suggestion;
    setSuggestion(null);
    rules
      .save([
        ...rules.value,
        { name: rule.who.label, contains: [rule.who.match], direction: rule.direction, categoryId: rule.categoryId, review: false },
      ])
      .then(() => setRuleResult({ status: 'created', rule }))
      .catch(() => setRuleResult({ status: 'failed', rule }));
  };
  const searchLabels = useMemo(
    () => ({ categories: categoryLabels, uncategorized: t('categories.uncategorized') }),
    [categoryLabels, t],
  );

  const filtered = useMemo(
    () => filterTransactions(data.transactions, { query: deferredQuery, status, ...dropdowns, range }, searchLabels),
    [data.transactions, deferredQuery, status, dropdowns, range, searchLabels],
  );
  const summary = useMemo(() => summarize(filtered, converter), [filtered, converter]);

  // Paging and selection belong to one set of filters, so they reset when it changes.
  const filtersKey = [deferredQuery, status, ...Object.values(dropdowns), range.start, range.end].join('|');
  const [page, setPage] = useState({ key: filtersKey, count: 1 });
  const pageCount = page.key === filtersKey ? page.count : 1;
  const [selection, setSelection] = useState({ key: filtersKey, ids: NO_SELECTION });
  const selectedIds = selection.key === filtersKey ? selection.ids : NO_SELECTION;

  const shown = useMemo(() => filtered.slice(0, pageCount * PAGE_SIZE), [filtered, pageCount]);
  const days = useMemo(() => groupByDay(shown, filtered, converter), [shown, filtered, converter]);
  const selected = useMemo(() => filtered.filter((transaction) => selectedIds.has(transaction.id)), [filtered, selectedIds]);

  const select = useCallback((ids: ReadonlySet<string>) => setSelection({ key: filtersKey, ids }), [filtersKey]);
  const toggle = useCallback(
    (id: string, checked: boolean) =>
      setSelection((current) => {
        const ids = new Set(current.key === filtersKey ? current.ids : NO_SELECTION);
        if (checked) ids.add(id);
        else ids.delete(id);
        return { key: filtersKey, ids };
      }),
    [filtersKey],
  );
  const selectAll = () => select(new Set(filtered.map((transaction) => transaction.id)));
  const clearSelection = () => select(NO_SELECTION);
  const selectedIdList = () => selected.map((transaction) => transaction.id);
  // Renaming needs one merchant, person or account in the whole selection.
  const renameKey =
    selected.length > 0 && selected.every((transaction) => transaction.nameKey === selected[0].nameKey)
      ? selected[0].nameKey
      : undefined;

  const setFilter = <K extends keyof DropdownFilters>(key: K, value: DropdownFilters[K]) =>
    setDropdowns((current) => ({ ...current, [key]: value }));
  const activeFilterCount = Object.values(dropdowns).filter((value) => value !== 'all').length;
  const narrowed = query.trim() !== '' || status !== 'all' || activeFilterCount > 0;
  const clearFilters = () => {
    setQuery(EMPTY_FILTERS.query);
    setStatus(EMPTY_FILTERS.status);
    setDropdowns(NO_DROPDOWN_FILTERS);
  };

  const accountOptions = useMemo(
    () => [
      { value: 'all', label: t('transactions.filters.allAccounts') },
      ...data.accounts.map((account) => ({ value: account.id, label: account.name })),
    ],
    [data.accounts, t],
  );
  const categoryOptions = useMemo(
    () => [
      { value: 'all', label: t('transactions.filters.allCategories') },
      ...data.categories.map((category) => ({ value: category.id, label: category.label })),
    ],
    [data.categories, t],
  );
  const tagOptions = useMemo(
    () => [
      { value: 'all', label: t('transactions.filters.allTags') },
      ...data.tags.map((tag) => ({ value: tag, label: tag })),
    ],
    [data.tags, t],
  );

  return (
    <Card style={styles.card}>
      <View style={styles.controls}>
        <View style={styles.inset}>
          <TransactionsToolbar
            query={query}
            onQueryChange={setQuery}
            filtersOpen={dropdownsOpen}
            activeFilterCount={activeFilterCount}
            onToggleFilters={() => setDropdownsOpen((open) => !open)}
            onAdd={() => setAdding((open) => !open)}
          />
        </View>
        {adding ? (
          <View style={styles.inset}>
            <AddTransactionForm
              accounts={data.accounts}
              categories={data.categories}
              defaultDate={today()}
              onSubmit={(transaction) => {
                setFailed(null);
                transactionActions
                  .add(transaction)
                  .then(() => setAdding(false))
                  .catch(() => setFailed('add'));
              }}
              onCancel={() => setAdding(false)}
            />
          </View>
        ) : null}
        <View style={styles.inset}>
          <TransactionFilterBar
            status={status}
            onStatusChange={setStatus}
            filters={dropdowns}
            onFilterChange={setFilter}
            accountOptions={accountOptions}
            categoryOptions={categoryOptions}
            tagOptions={tagOptions}
            dropdownsOpen={dropdownsOpen}
          />
        </View>
        <View style={styles.inset}>
          {selected.length > 0 ? (
            <SelectionBar
              selectedCount={selected.length}
              totalCount={filtered.length}
              canMarkReviewed={selected.some((transaction) => transaction.needsReview)}
              hidden={status === 'hidden'}
              categoryChoices={data.categoryChoices}
              onSelectAll={selectAll}
              onCategorize={(categoryId) => {
                const chosen = selected;
                clearSelection();
                categorize(chosen, categoryId);
              }}
              assetChoices={data.assetChoices}
              onLink={(assetId) => {
                // Cash nobody detailed is worked out, not a movement to link.
                const ids = selected.filter((transaction) => !transaction.undetailedCash).map((transaction) => transaction.id);
                clearSelection();
                setFailed(null);
                if (ids.length > 0) transactionActions.link(ids, assetId).catch(() => setFailed('link'));
              }}
              onMarkReviewed={() => {
                const ids = selectedIdList();
                clearSelection();
                setFailed(null);
                transactionActions.markReviewed(ids).catch(() => setFailed('save'));
              }}
              onToggleHidden={() => {
                const ids = selectedIdList();
                clearSelection();
                setFailed(null);
                transactionActions.setHidden(ids, status !== 'hidden').catch(() => setFailed('save'));
              }}
              onRename={
                renameKey
                  ? (name) => {
                      clearSelection();
                      setFailed(null);
                      transactionActions.rename(renameKey, name).catch(() => setFailed('save'));
                    }
                  : undefined
              }
              currentName={selected[0]?.merchant}
              onDelete={
                selected.every((transaction) => transaction.manual)
                  ? () => {
                      const ids = selectedIdList();
                      clearSelection();
                      setFailed(null);
                      transactionActions.remove(ids).catch(() => setFailed('save'));
                    }
                  : undefined
              }
              onClear={clearSelection}
            />
          ) : (
            <TransactionsSummary summary={summary} />
          )}
          {failed ? (
            <Text tone="accent" style={styles.error}>
              {t(FAILURES[failed])}
            </Text>
          ) : null}
          {suggestion ? (
            <View style={styles.suggestion}>
              <Text style={styles.suggestionText}>
                {t('transactions.rule.suggest', {
                  who: suggestion.who.label,
                  category: categoryLabels.get(suggestion.categoryId) ?? suggestion.categoryId,
                })}
              </Text>
              <View style={styles.suggestionActions}>
                <Button variant="primary" label={t('transactions.rule.create')} onPress={createRule} />
                <Button label={t('transactions.rule.dismiss')} onPress={() => setSuggestion(null)} />
              </View>
            </View>
          ) : null}
          {ruleResult ? (
            <Text tone={ruleResult.status === 'created' ? 'secondary' : 'accent'} style={styles.error}>
              {ruleResult.status === 'created'
                ? t('transactions.rule.created', {
                    who: ruleResult.rule.who.label,
                    category: categoryLabels.get(ruleResult.rule.categoryId) ?? ruleResult.rule.categoryId,
                  })
                : t('transactions.rule.failed')}
            </Text>
          ) : null}
        </View>
      </View>
      <TransactionList
        days={days}
        accountNames={accountNames}
        categoryLabels={categoryLabels}
        selectedIds={selectedIds}
        onToggle={toggle}
        allSelected={selected.length > 0 && selected.length === filtered.length}
        someSelected={selected.length > 0}
        onToggleAll={(checked) => (checked ? selectAll() : clearSelection())}
        shownCount={shown.length}
        totalCount={filtered.length}
        onShowMore={() => setPage({ key: filtersKey, count: pageCount + 1 })}
        onClearFilters={narrowed ? clearFilters : undefined}
        categoryOptionsFor={categoryOptionsFor}
        onCategorize={categorizeOne}
      />
    </Card>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    padding: 0,
    gap: 0,
    overflow: 'hidden',
  },
  controls: {
    paddingVertical: { xs: theme.space[4], md: theme.space[5] },
    gap: { xs: theme.space[3], md: theme.space[4] },
  },
  inset: {
    paddingHorizontal: { xs: theme.space[4], md: theme.space[5] },
  },
  error: {
    marginTop: theme.space[2],
  },
  suggestion: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.space[3],
    marginTop: theme.space[3],
    padding: theme.space[3],
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent.subtle,
  },
  suggestionText: {
    flexShrink: 1,
  },
  suggestionActions: {
    flexDirection: 'row',
    gap: theme.space[2],
  },
}));
