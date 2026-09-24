/**
 * Core domain models for the offline-first expense tracker.
 *
 * Monetary invariant: every monetary field is a safe integer expressed in
 * MINOR UNITS (cents) of the owning currency. Conversion to major units happens
 * exclusively at display boundaries (see `@/utils/money`).
 * Calendar invariant: `date` is always a local calendar day (`YYYY-MM-DD`) and
 * `yearMonth` its first seven characters (`YYYY-MM`).
 */

export type TransactionType = 'expense' | 'income' | 'transfer';
export type CategoryType = 'expense' | 'income' | 'transfer';
export type AccountType = 'cash' | 'bank' | 'credit' | 'investment';
export type BudgetPeriod = 'monthly';
export type ThemeMode = 'light' | 'dark' | 'system';

export interface BaseEntity {
  id: string;
  createdAt: number;
  updatedAt: number;
}

export interface Transaction extends BaseEntity {
  type: TransactionType;
  /** Stored in minor units based on the currency exponent of the source account. */
  amount: number;
  accountId: string;
  toAccountId?: string;
  categoryId: string;
  /** Local calendar day, `YYYY-MM-DD`. */
  date: string;
  /** `YYYY-MM` slice of `date`, persisted for indexed monthly aggregation. */
  yearMonth: string;
  note: string;
  tags: string[];
}

export interface ReceiptAttachment extends BaseEntity {
  transactionId: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
  dataBlob: Blob;
}

export interface Category extends BaseEntity {
  name: string;
  type: CategoryType;
  icon: string;
  colorHex: string;
  isSystem: boolean;
  isHidden: boolean;
  sortOrder: number;
  isArchived: boolean;
}

export interface Account extends BaseEntity {
  name: string;
  type: AccountType;
  /** Opening balance in minor units of `currency`. */
  initialBalance: number;
  currency: string;
  colorHex: string;
  sortOrder: number;
  isArchived: boolean;
}

export interface Budget extends BaseEntity {
  categoryId: string;
  /** Envelope cap in minor units of the base currency. */
  amount: number;
  period: BudgetPeriod;
  /** `YYYY-MM` the envelope applies to. */
  yearMonth: string;
}

export interface UserSettings {
  id: 'user_settings';
  baseCurrency: string;
  theme: ThemeMode;
  hapticEnabled: boolean;
  firstDayOfWeek: 0 | 1;
  lastExportTimestamp?: number;
  updatedAt: number;
}

export type NewTransactionDTO = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>;
export type NewCategoryDTO = Omit<Category, 'id' | 'createdAt' | 'updatedAt'>;
export type NewAccountDTO = Omit<Account, 'id' | 'createdAt' | 'updatedAt'>;
export type NewBudgetDTO = Omit<Budget, 'id' | 'createdAt' | 'updatedAt'>;

export interface FinancialSummary {
  totalIncome: number;
  totalExpense: number;
  netSavings: number;
  /** 0.0 to 1.0 */
  savingsRate: number;
  periodStart: string;
  periodEnd: string;
}

export interface CategorySpendBreakdown {
  categoryId: string;
  categoryName: string;
  colorHex: string;
  icon: string;
  totalSpent: number;
  /** 0.0 to 100.0 */
  percentageOfTotal: number;
  transactionCount: number;
}

export interface BudgetUtilization {
  budgetId: string;
  categoryId: string;
  categoryName: string;
  budgetAmount: number;
  actualSpent: number;
  remainingAmount: number;
  /** May exceed 100.0 when the envelope is blown. */
  utilizationPercentage: number;
  isExceeded: boolean;
  projectedDailyAllowance: number;
}

/** Result envelope shared by every service or store mutation that can fail. */
export interface ServiceResult<T = void> {
  ok: boolean;
  message: string;
  data?: T;
}

/** Aggregate position of a single account, derived from the ledger. */
export interface AccountBalance {
  accountId: string;
  accountName: string;
  currency: string;
  initialBalance: number;
  currentBalance: number;
  isArchived: boolean;
}

/** Identifier of the hidden, system-owned category used by transfer legs. */
export const TRANSFER_CATEGORY_ID = 'cat_transfer';
