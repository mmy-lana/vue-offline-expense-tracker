/**
 * Ledger filter model.
 *
 * Kept as a plain serialisable object with pure matching helpers so the same
 * rules drive the filter bar UI, the ledger screen and any future saved views.
 */

import type { Transaction, TransactionType } from '@/types/models';

export interface TransactionFilters {
  /** Free-text query over note, tags and resolved category/account names. */
  search: string;
  type: TransactionType | 'all';
  accountId: string | 'all';
  categoryId: string | 'all';
  /** Inclusive local calendar bounds, `YYYY-MM-DD` or empty for unbounded. */
  from: string;
  to: string;
}

export interface FilterLookup {
  categoryName?: string | undefined;
  accountName?: string | undefined;
  toAccountName?: string | undefined;
}

export const createDefaultFilters = (): TransactionFilters => ({
  search: '',
  type: 'all',
  accountId: 'all',
  categoryId: 'all',
  from: '',
  to: ''
});

/** Number of filters narrowing the ledger, used for the filter badge. */
export const countActiveFilters = (filters: TransactionFilters): number => {
  let count = 0;
  if (filters.search.trim().length > 0) count++;
  if (filters.type !== 'all') count++;
  if (filters.accountId !== 'all') count++;
  if (filters.categoryId !== 'all') count++;
  if (filters.from.length > 0) count++;
  if (filters.to.length > 0) count++;
  return count;
};

const normalize = (value: string): string => value.trim().toLowerCase();

/**
 * Applies every filter to one transaction. `lookup` supplies resolved names so
 * search can match the labels the user actually sees.
 */
export const matchesFilters = (
  transaction: Transaction,
  filters: TransactionFilters,
  lookup: FilterLookup = {}
): boolean => {
  if (filters.type !== 'all' && transaction.type !== filters.type) return false;
  if (filters.accountId !== 'all') {
    const touchesAccount =
      transaction.accountId === filters.accountId || transaction.toAccountId === filters.accountId;
    if (!touchesAccount) return false;
  }
  if (filters.categoryId !== 'all' && transaction.categoryId !== filters.categoryId) return false;
  if (filters.from.length > 0 && transaction.date < filters.from) return false;
  if (filters.to.length > 0 && transaction.date > filters.to) return false;

  const query = normalize(filters.search);
  if (query.length === 0) return true;

  const haystack = [
    transaction.note,
    transaction.tags.join(' '),
    lookup.categoryName ?? '',
    lookup.accountName ?? '',
    lookup.toAccountName ?? ''
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(query);
};

/** Applies the filter set to a ledger slice, preserving the incoming order. */
export const filterTransactions = (
  transactions: readonly Transaction[],
  filters: TransactionFilters,
  resolveLookup: (transaction: Transaction) => FilterLookup
): Transaction[] =>
  transactions.filter((transaction) => matchesFilters(transaction, filters, resolveLookup(transaction)));
