/**
 * Ledger store: the single reactive projection of IndexedDB.
 *
 * Writes are delegated to `ledgerService` (which owns validation and ACID
 * transactions); reads are kept live by Dexie `liveQuery` subscriptions, so any
 * mutation — from any screen — updates every mounted view without manual
 * refetching. Stores never import composables: views combine this state with the
 * pure helpers in `@/composables` and `@/utils`.
 */

import { defineStore } from 'pinia';
import { liveQuery } from 'dexie';
import { db } from '@/services/db';
import {
  archiveAccount as archiveAccountService,
  buildAccountBalances,
  createAccount as createAccountService,
  createCategory as createCategoryService,
  createTransaction as createTransactionService,
  deleteAccount as deleteAccountService,
  deleteBudget as deleteBudgetService,
  deleteCategory as deleteCategoryService,
  deleteTransaction as deleteTransactionService,
  setAccountArchived as setAccountArchivedService,
  updateAccount as updateAccountService,
  updateCategory as updateCategoryService,
  updateTransaction as updateTransactionService,
  upsertBudget as upsertBudgetService
} from '@/services/ledgerService';
import type {
  Account,
  AccountBalance,
  Budget,
  Category,
  NewAccountDTO,
  NewBudgetDTO,
  NewCategoryDTO,
  NewTransactionDTO,
  ServiceResult,
  Transaction
} from '@/types/models';

interface LedgerState {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
  budgets: Budget[];
  /** `true` once every table has produced its first emission. */
  isReady: boolean;
  isLoading: boolean;
  error: string | null;
}

interface Subscription {
  unsubscribe: () => void;
}

/**
 * Live-query subscriptions are process-wide singletons (one store instance per
 * app), so they are deliberately kept out of reactive state.
 */
let subscriptions: Subscription[] = [];

const toMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message.trim().length > 0 ? error.message : fallback;

const sortByDateDesc = (transactions: Transaction[]): Transaction[] =>
  transactions.slice().sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return b.createdAt - a.createdAt;
  });

export const useLedgerStore = defineStore('ledger', {
  state: (): LedgerState => ({
    transactions: [],
    categories: [],
    accounts: [],
    budgets: [],
    isReady: false,
    isLoading: false,
    error: null
  }),

  getters: {
    /** Newest first, ties broken by creation time. */
    sortedTransactions: (state): Transaction[] => sortByDateDesc(state.transactions),

    activeAccounts: (state): Account[] =>
      state.accounts
        .filter((account) => !account.isArchived)
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder),

    archivedAccounts: (state): Account[] =>
      state.accounts
        .filter((account) => account.isArchived)
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder),

    visibleCategories: (state): Category[] =>
      state.categories
        .filter((category) => !category.isArchived && !category.isHidden)
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder),

    expenseCategories(): Category[] {
      return this.visibleCategories.filter((category) => category.type === 'expense');
    },

    incomeCategories(): Category[] {
      return this.visibleCategories.filter((category) => category.type === 'income');
    },

    categoryById: (state) => (id: string): Category | undefined =>
      state.categories.find((category) => category.id === id),

    accountById: (state) => (id: string): Account | undefined =>
      state.accounts.find((account) => account.id === id),

    /** Signed balances for every account, including archived ones. */
    accountBalances: (state): AccountBalance[] =>
      buildAccountBalances(state.accounts, state.transactions),

    balanceByAccountId(): Map<string, number> {
      const balances = new Map<string, number>();
      for (const row of this.accountBalances) {
        balances.set(row.accountId, row.currentBalance);
      }
      return balances;
    },

    /** Net worth across active accounts, in minor units of the base currency. */
    netWorth(): number {
      return this.activeAccounts.reduce(
        (total, account) => total + (this.balanceByAccountId.get(account.id) ?? account.initialBalance),
        0
      );
    },

    transactionById: (state) => (id: string): Transaction | undefined =>
      state.transactions.find((transaction) => transaction.id === id),

    /** Transactions inside an inclusive calendar range. */
    transactionsInRange: (state) => (start: string, end: string): Transaction[] =>
      sortByDateDesc(
        state.transactions.filter((transaction) => transaction.date >= start && transaction.date <= end)
      ),

    /** Transactions belonging to a `YYYY-MM` bucket. */
    transactionsInMonth: (state) => (yearMonth: string): Transaction[] =>
      sortByDateDesc(state.transactions.filter((transaction) => transaction.yearMonth === yearMonth)),

    budgetsForMonth: (state) => (yearMonth: string): Budget[] =>
      state.budgets.filter((budget) => budget.yearMonth === yearMonth)
  },

  actions: {
    /**
     * Starts the live-query bridge. Idempotent: calling it twice does not create
     * duplicate subscriptions.
     */
    startSync(): void {
      if (subscriptions.length > 0) return;

      const track = <T>(querier: () => Promise<T>, apply: (value: T) => void): void => {
        const subscription = liveQuery(querier).subscribe({
          next: (value) => {
            apply(value as T);
            this.isReady = true;
          },
          error: (error: unknown) => {
            this.error = toMessage(error, 'Unable to read the local database');
          }
        });

        subscriptions.push(subscription as Subscription);
      };

      track(
        () => db.transactions.toArray(),
        (transactions) => {
          this.transactions = transactions;
        }
      );

      track(
        () => db.categories.toArray(),
        (categories) => {
          this.categories = categories;
        }
      );

      track(
        () => db.accounts.toArray(),
        (accounts) => {
          this.accounts = accounts;
        }
      );

      track(
        () => db.budgets.toArray(),
        (budgets) => {
          this.budgets = budgets;
        }
      );
    },

    stopSync(): void {
      for (const subscription of subscriptions) {
        subscription.unsubscribe();
      }
      subscriptions = [];
    },

    clearError(): void {
      this.error = null;
    },

    /** Wraps a service mutation with loading and error bookkeeping. */
    async runMutation<R>(
      operation: () => Promise<R>,
      successMessage: string,
      fallbackMessage: string,
      data?: R
    ): Promise<ServiceResult<R>> {
      this.isLoading = true;
      this.error = null;

      try {
        await operation();
        return { ok: true, message: successMessage, data };
      } catch (error: unknown) {
        const message = toMessage(error, fallbackMessage);
        this.error = message;
        return { ok: false, message };
      } finally {
        this.isLoading = false;
      }
    },

    /* ------------------------------- transactions ------------------------------ */

    async createTransaction(input: NewTransactionDTO): Promise<ServiceResult<string>> {
      this.isLoading = true;
      this.error = null;

      try {
        const id = await createTransactionService(input);
        return { ok: true, message: 'Transaction saved', data: id };
      } catch (error: unknown) {
        const message = toMessage(error, 'Unable to save the transaction');
        this.error = message;
        return { ok: false, message };
      } finally {
        this.isLoading = false;
      }
    },

    async updateTransaction(
      id: string,
      updates: Partial<
        Pick<Transaction, 'type' | 'amount' | 'accountId' | 'toAccountId' | 'categoryId' | 'date' | 'note' | 'tags'>
      >
    ): Promise<ServiceResult> {
      return this.runMutation(
        () => updateTransactionService(id, updates),
        'Transaction updated',
        'Unable to update the transaction'
      );
    },

    async deleteTransaction(id: string): Promise<ServiceResult> {
      return this.runMutation(
        () => deleteTransactionService(id),
        'Transaction deleted',
        'Unable to delete the transaction'
      );
    },

    /* -------------------------------- categories ------------------------------- */

    async createCategory(input: NewCategoryDTO): Promise<ServiceResult<string>> {
      this.isLoading = true;
      this.error = null;

      try {
        const id = await createCategoryService(input);
        return { ok: true, message: 'Category created', data: id };
      } catch (error: unknown) {
        const message = toMessage(error, 'Unable to create the category');
        this.error = message;
        return { ok: false, message };
      } finally {
        this.isLoading = false;
      }
    },

    async updateCategory(
      id: string,
      updates: Partial<Pick<Category, 'name' | 'icon' | 'colorHex' | 'isHidden' | 'isArchived' | 'sortOrder'>>
    ): Promise<ServiceResult> {
      return this.runMutation(
        () => updateCategoryService(id, updates),
        'Category updated',
        'Unable to update the category'
      );
    },

    async deleteCategory(id: string): Promise<ServiceResult> {
      return this.runMutation(
        () => deleteCategoryService(id),
        'Category deleted',
        'Unable to delete the category'
      );
    },

    /* --------------------------------- accounts -------------------------------- */

    async createAccount(input: NewAccountDTO): Promise<ServiceResult<string>> {
      this.isLoading = true;
      this.error = null;

      try {
        const id = await createAccountService(input);
        return { ok: true, message: 'Account created', data: id };
      } catch (error: unknown) {
        const message = toMessage(error, 'Unable to create the account');
        this.error = message;
        return { ok: false, message };
      } finally {
        this.isLoading = false;
      }
    },

    async updateAccount(
      id: string,
      updates: Partial<Pick<Account, 'name' | 'type' | 'initialBalance' | 'colorHex' | 'sortOrder' | 'isArchived'>>
    ): Promise<ServiceResult> {
      return this.runMutation(
        () => updateAccountService(id, updates),
        'Account updated',
        'Unable to update the account'
      );
    },

    async setAccountArchived(id: string, isArchived: boolean): Promise<ServiceResult> {
      return this.runMutation(
        () => setAccountArchivedService(id, isArchived),
        isArchived ? 'Account archived' : 'Account restored',
        'Unable to update the account'
      );
    },

    async archiveAccount(id: string): Promise<ServiceResult> {
      return this.runMutation(
        () => archiveAccountService(id),
        'Account archived',
        'Unable to archive the account'
      );
    },

    async deleteAccount(id: string): Promise<ServiceResult> {
      return this.runMutation(
        () => deleteAccountService(id),
        'Account deleted',
        'Unable to delete the account'
      );
    },

    /* --------------------------------- budgets --------------------------------- */

    async upsertBudget(input: NewBudgetDTO): Promise<ServiceResult<string>> {
      this.isLoading = true;
      this.error = null;

      try {
        const id = await upsertBudgetService(input);
        return { ok: true, message: 'Budget saved', data: id };
      } catch (error: unknown) {
        const message = toMessage(error, 'Unable to save the budget');
        this.error = message;
        return { ok: false, message };
      } finally {
        this.isLoading = false;
      }
    },

    async deleteBudget(id: string): Promise<ServiceResult> {
      return this.runMutation(() => deleteBudgetService(id), 'Budget removed', 'Unable to remove the budget');
    }
  }
});
