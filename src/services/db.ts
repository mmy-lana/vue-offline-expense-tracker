/**
 * IndexedDB persistence layer (Dexie).
 *
 * The database is entirely on-device: no network call is required to read,
 * write, aggregate or export any record. Every multi-table mutation runs inside
 * an ACID Dexie transaction so a partially applied ledger can never be observed.
 */

import Dexie, { type Table } from 'dexie';
import type {
  Account,
  Budget,
  Category,
  ReceiptAttachment,
  Transaction,
  UserSettings
} from '@/types/models';
import { TRANSFER_CATEGORY_ID } from '@/types/models';

export const DATABASE_NAME = 'vue_offline_expense_tracker_db';
export const SETTINGS_RECORD_ID = 'user_settings' as const;

export class AppDatabase extends Dexie {
  transactions!: Table<Transaction, string>;
  receipts!: Table<ReceiptAttachment, string>;
  categories!: Table<Category, string>;
  accounts!: Table<Account, string>;
  budgets!: Table<Budget, string>;
  settings!: Table<UserSettings, string>;

  constructor() {
    super(DATABASE_NAME);

    this.version(1).stores({
      transactions: 'id, type, accountId, toAccountId, categoryId, date, yearMonth, createdAt, *tags',
      receipts: 'id, transactionId, createdAt',
      categories: 'id, type, name, sortOrder',
      accounts: 'id, type, sortOrder',
      budgets: 'id, categoryId, yearMonth, &[categoryId+yearMonth]',
      settings: 'id'
    });
  }
}

export const db = new AppDatabase();

/** Builds the immutable system category catalog with a shared seed timestamp. */
const buildSeedCategories = (timestamp: number): Category[] => [
  { id: 'cat_groceries', name: 'Groceries', type: 'expense', icon: 'shopping-cart', colorHex: '#10B981', isSystem: true, isHidden: false, sortOrder: 1, isArchived: false, createdAt: timestamp, updatedAt: timestamp },
  { id: 'cat_dining', name: 'Dining Out', type: 'expense', icon: 'utensils', colorHex: '#F59E0B', isSystem: true, isHidden: false, sortOrder: 2, isArchived: false, createdAt: timestamp, updatedAt: timestamp },
  { id: 'cat_transport', name: 'Transport', type: 'expense', icon: 'car', colorHex: '#3B82F6', isSystem: true, isHidden: false, sortOrder: 3, isArchived: false, createdAt: timestamp, updatedAt: timestamp },
  { id: 'cat_housing', name: 'Housing & Utilities', type: 'expense', icon: 'home', colorHex: '#6366F1', isSystem: true, isHidden: false, sortOrder: 4, isArchived: false, createdAt: timestamp, updatedAt: timestamp },
  { id: 'cat_entertainment', name: 'Entertainment', type: 'expense', icon: 'film', colorHex: '#EC4899', isSystem: true, isHidden: false, sortOrder: 5, isArchived: false, createdAt: timestamp, updatedAt: timestamp },
  { id: 'cat_health', name: 'Health & Medical', type: 'expense', icon: 'activity', colorHex: '#EF4444', isSystem: true, isHidden: false, sortOrder: 6, isArchived: false, createdAt: timestamp, updatedAt: timestamp },
  { id: 'cat_salary', name: 'Salary', type: 'income', icon: 'dollar-sign', colorHex: '#059669', isSystem: true, isHidden: false, sortOrder: 7, isArchived: false, createdAt: timestamp, updatedAt: timestamp },
  { id: 'cat_freelance', name: 'Freelance & Side Gig', type: 'income', icon: 'briefcase', colorHex: '#0D9488', isSystem: true, isHidden: false, sortOrder: 8, isArchived: false, createdAt: timestamp, updatedAt: timestamp },
  { id: 'cat_investment', name: 'Investment Returns', type: 'income', icon: 'trending-up', colorHex: '#8B5CF6', isSystem: true, isHidden: false, sortOrder: 9, isArchived: false, createdAt: timestamp, updatedAt: timestamp },
  { id: TRANSFER_CATEGORY_ID, name: 'Account Transfer', type: 'transfer', icon: 'repeat', colorHex: '#64748B', isSystem: true, isHidden: true, sortOrder: 10, isArchived: false, createdAt: timestamp, updatedAt: timestamp }
];

/** Builds the default single-currency account set with a shared seed timestamp. */
const buildSeedAccounts = (timestamp: number, currency = 'USD'): Account[] => [
  { id: 'acc_cash', name: 'Cash', type: 'cash', initialBalance: 0, currency, colorHex: '#10B981', sortOrder: 1, isArchived: false, createdAt: timestamp, updatedAt: timestamp },
  { id: 'acc_checking', name: 'Bank Checking', type: 'bank', initialBalance: 0, currency, colorHex: '#3B82F6', sortOrder: 2, isArchived: false, createdAt: timestamp, updatedAt: timestamp },
  { id: 'acc_credit', name: 'Credit Card', type: 'credit', initialBalance: 0, currency, colorHex: '#EF4444', sortOrder: 3, isArchived: false, createdAt: timestamp, updatedAt: timestamp }
];

const buildDefaultSettings = (timestamp: number, currency = 'USD'): UserSettings => ({
  id: SETTINGS_RECORD_ID,
  baseCurrency: currency,
  theme: 'system',
  hapticEnabled: true,
  firstDayOfWeek: 1,
  updatedAt: timestamp
});

/**
 * Idempotently seeds categories, accounts and the settings singleton.
 *
 * Safe to call on every boot: each table is only populated when it is still
 * empty, and the whole operation is atomic so an interrupted boot cannot leave
 * the database half-seeded.
 */
export const initializeDatabaseDefaults = async (): Promise<void> => {
  const timestamp = Date.now();

  await db.transaction('rw', [db.categories, db.accounts, db.settings], async () => {
    const [categoryCount, accountCount, settingsRecord] = await Promise.all([
      db.categories.count(),
      db.accounts.count(),
      db.settings.get(SETTINGS_RECORD_ID)
    ]);

    if (categoryCount === 0) {
      await db.categories.bulkPut(buildSeedCategories(timestamp));
    }

    if (accountCount === 0) {
      await db.accounts.bulkPut(buildSeedAccounts(timestamp, settingsRecord?.baseCurrency ?? 'USD'));
    }

    if (!settingsRecord) {
      await db.settings.put(buildDefaultSettings(timestamp));
    }
  });
};

/** Best-effort cache persistence request so the browser does not evict data. */
export const requestPersistentStorage = async (): Promise<boolean> => {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;

  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
};
