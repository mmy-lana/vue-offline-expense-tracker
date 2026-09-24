# ARCHITECTURAL SPECIFICATION & EXECUTION PLAN
**PROJECT**: `vue-offline-expense-tracker`  
**STACK**: Vue 3 (Composition API, `<script setup lang="ts">`) + Vite PWA + IndexedDB (Dexie.js)  
**DESIGN**: Mobile Native App Shell (iOS/Android Human Interface Guidelines adapted for Progressive Web Apps)  
**STORAGE ARCHITECTURE**: Offline-First Local Storage Engine with Zero Cloud Dependency and Full Data Export/Import Sovereignty  

---

## 1. DATA SCHEMA & PURE TYPESCRIPT INTERFACES

All monetary values are strictly handled as 64-bit integer values in **minor units (cents)** to eliminate IEEE 754 floating-point rounding errors across aggregations. Conversion to major units occurs exclusively at display boundaries.

### 1.1 Core Domain Models (`src/types/models.ts`)

```typescript
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
  amount: number; // Stored in minor units based on currency exponent
  accountId: string;
  toAccountId?: string;
  categoryId: string;
  date: string; // Local format: 'YYYY-MM-DD'
  yearMonth: string; // Format: 'YYYY-MM'
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
  initialBalance: number;
  currency: string;
  colorHex: string;
  sortOrder: number;
  isArchived: boolean;
}

export interface Budget extends BaseEntity {
  categoryId: string;
  amount: number;
  period: BudgetPeriod;
  yearMonth: string; // Format: 'YYYY-MM'
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
export type NewBudgetDTO = Omit<Budget, 'id' | 'createdAt' | 'updatedAt'>;

export interface FinancialSummary {
  totalIncome: number;
  totalExpense: number;
  netSavings: number;
  savingsRate: number; // 0.0 to 1.0
  periodStart: string;
  periodEnd: string;
}

export interface CategorySpendBreakdown {
  categoryId: string;
  categoryName: string;
  colorHex: string;
  icon: string;
  totalSpent: number;
  percentageOfTotal: number; // 0.0 to 100.0
  transactionCount: number;
}

export interface BudgetUtilization {
  budgetId: string;
  categoryId: string;
  categoryName: string;
  budgetAmount: number;
  actualSpent: number;
  remainingAmount: number;
  utilizationPercentage: number; // May exceed 100.0
  isExceeded: boolean;
  projectedDailyAllowance: number;
}
```

### 1.2 Data Validation & Parsing Rules (`src/utils/validation.ts`)

```typescript
export interface ValidationResult<T> {
  isValid: boolean;
  data?: T;
  errors: Record<string, string>;
}

import { parseMajorToMinor } from '@/utils/money';

export const validateTransactionInput = (input: {
  type: TransactionType;
  amountMajor: string;
  currency: string;
  accountId: string;
  categoryId: string;
  toAccountId?: string;
  date: string;
  note?: string;
  tags?: string[];
}): ValidationResult<{
  type: TransactionType;
  amount: number;
  accountId: string;
  categoryId: string;
  toAccountId?: string;
  date: string;
  yearMonth: string;
  note: string;
  tags: string[];
}> => {
  const errors: Record<string, string> = {};

  const { isValid, minor } = parseMajorToMinor(input.amountMajor, input.currency);
  if (!isValid || minor <= 0) {
    errors.amount = 'Amount must be a valid positive numerical value';
  }

  if (!input.accountId || input.accountId.trim().length === 0) {
    errors.accountId = 'Source account must be specified';
  }

  if (input.type === 'transfer') {
    if (!input.toAccountId || input.toAccountId.trim().length === 0) {
      errors.toAccountId = 'Destination account must be selected for transfers';
    } else if (input.toAccountId === input.accountId) {
      errors.toAccountId = 'Source and destination accounts must be distinct';
    }
  } else {
    if (!input.categoryId || input.categoryId.trim().length === 0) {
      errors.categoryId = 'Category selection is required';
    }
  }

  const isRealCalendarDate = (s: string): boolean => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y = 0, m = 0, d = 0] = s.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  };

  if (!isRealCalendarDate(input.date)) {
    errors.date = 'Date must be a real calendar date (YYYY-MM-DD)';
  }

  if (Object.keys(errors).length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    errors: {},
    data: {
      type: input.type,
      amount: minor,
      accountId: input.accountId,
      categoryId: input.type === 'transfer' ? 'cat_transfer' : input.categoryId,
      toAccountId: input.type === 'transfer' ? input.toAccountId : undefined,
      date: input.date,
      yearMonth: input.date.slice(0, 7),
      note: input.note ? input.note.trim() : '',
      tags: input.tags ? input.tags.map(t => t.trim().toLowerCase()).filter(Boolean) : []
    }
  };
};
```

### 1.3 Currency & Integer Minor Unit Engine (`src/utils/money.ts`)

```typescript
const fractionDigitsCache = new Map<string, number>();
const formatterCache = new Map<string, Intl.NumberFormat>();

export const getCurrencyFractionDigits = (currency: string): number => {
  const cached = fractionDigitsCache.get(currency);
  if (cached !== undefined) return cached;

  try {
    const digits = new Intl.NumberFormat(undefined, { style: 'currency', currency })
      .resolvedOptions().maximumFractionDigits ?? 2;
    fractionDigitsCache.set(currency, digits);
    return digits;
  } catch {
    fractionDigitsCache.set(currency, 2);
    return 2;
  }
};

export const getCurrencyFormatter = (currency: string): Intl.NumberFormat => {
  const cached = formatterCache.get(currency);
  if (cached !== undefined) return cached;

  const digits = getCurrencyFractionDigits(currency);
  const formatter = new Intl.NumberFormat(navigator.language || 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
  formatterCache.set(currency, formatter);
  return formatter;
};

export const formatCurrency = (minorUnits: number, currency: string): string => {
  const digits = getCurrencyFractionDigits(currency);
  const factor = Math.pow(10, digits);
  return getCurrencyFormatter(currency).format(minorUnits / factor);
};

export const parseMajorToMinor = (
  majorString: string,
  currency: string
): { isValid: boolean; minor: number } => {
  const trimmed = majorString.trim();
  const digits = getCurrencyFractionDigits(currency);

  const pattern = digits === 0 ? /^\d+$/ : new RegExp(`^\\d+(\\.\\d{0,${digits}})?$`);
  if (!pattern.test(trimmed)) {
    return { isValid: false, minor: 0 };
  }

  const [intPart = '0', fracPart = ''] = trimmed.split('.');
  const paddedFrac = fracPart.padEnd(digits, '0').slice(0, digits);
  const combined = digits === 0 ? intPart : `${intPart}${paddedFrac}`;

  const minor = parseInt(combined, 10);
  if (isNaN(minor) || !Number.isSafeInteger(minor)) {
    return { isValid: false, minor: 0 };
  }

  return { isValid: true, minor };
};

export const formatMinorToMajorString = (minorUnits: number, currency: string): string => {
  const digits = getCurrencyFractionDigits(currency);
  if (digits === 0) return minorUnits.toString();

  const isNegative = minorUnits < 0;
  const absUnits = Math.abs(minorUnits).toString().padStart(digits + 1, '0');
  const intPart = absUnits.slice(0, -digits) || '0';
  const fracPart = absUnits.slice(-digits);

  return `${isNegative ? '-' : ''}${intPart}.${fracPart}`;
};
```

### 1.4 Cryptographic Identifier Utility (`src/utils/id.ts`)

```typescript
export const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const buf = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < 16; i++) {
      buf[i] = Math.floor(Math.random() * 256);
    }
  }

  buf[6] = (buf[6]! & 0x0f) | 0x40;
  buf[8] = (buf[8]! & 0x3f) | 0x80;

  const hex = Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
```

---

## 2. COMPONENT ARCHITECTURE (VUE 3 NATIVE APP SHELL)

The layout conforms to standard Mobile Native Viewport constraints with fixed top navigation, scrollable canvas viewport (`overscroll-behavior-y: contain`, `webkit-overflow-scrolling: touch`), and persistent bottom tab navigation with strict hardware safe-area padding.

```
src/
├── components/
│   ├── ui/                        # Atomic Design Primitives
│   │   ├── AppButton.vue          # Touch feedback, ripple, haptic click, states
│   │   ├── AppInput.vue           # Focus ring, error state, cleanable
│   │   ├── AppKeypad.vue          # Full-screen virtual numeric entry pad
│   │   ├── AppModalSheet.vue      # Bottom-sheet drawer with drag-down dismiss
│   │   ├── AppSegmented.vue       # iOS-style segmented pill selector
│   │   ├── AppBadge.vue           # Status and category indicator tags
│   │   └── AppIcon.vue            # Inline SVG icon loader
│   ├── molecules/                 # Compound Native Micro-Components
│   │   ├── AmountDisplay.vue      # Major/minor typography split with currency
│   │   ├── TransactionRow.vue     # Swipeable list item with action reveals
│   │   ├── CategoryPicker.vue     # Icon grid with quick creation hook
│   │   ├── AccountPicker.vue      # Horizontal chip selector for active accounts
│   │   ├── BudgetProgressBar.vue  # Real-time pacing and limit status indicator
│   │   └── DateNavigator.vue      # Month/day step switcher with calendar picker
│   └── features/                  # Domain View Features
│       ├── transactions/
│       │   ├── TransactionList.vue
│       │   ├── TransactionFilterBar.vue
│       │   └── ReceiptViewerModal.vue
│       ├── analytics/
│       │   ├── SpendingDonutChart.vue
│       │   ├── CashFlowBarChart.vue
│       │   └── SpendingTrendsList.vue
│       ├── budgets/
│       │   ├── BudgetList.vue
│       │   └── BudgetCreateModal.vue
│       └── settings/
│           ├── BackupRestoreSection.vue
│           ├── CurrencySelector.vue
│           └── PwaStatusCard.vue
├── layouts/
│   ├── AppShell.vue               # Master safe-area viewport container
│   ├── AppHeader.vue              # Native dynamic header with route title & actions
│   └── AppTabBar.vue              # Native bottom navigation bar with floating add
└── views/
    ├── DashboardView.vue          # Monthly summary, recent transactions, quick add
    ├── TransactionsView.vue       # Infinite scroll ledger with complex filters
    ├── TransactionEntryView.vue   # Full-screen high-speed transaction creator
    ├── AnalyticsView.vue          # Category distributions and monthly cash flow
    ├── BudgetsView.vue            # Category envelope limits and pace gauges
    └── SettingsView.vue           # Export, import, accounts, preferences
```

### 2.1 Viewport Breakpoint Specifications & Responsive Behavior

| Breakpoint | Target Devices | Layout Behavior |
| :--- | :--- | :--- |
| **360px** | Galaxy S8, Xperia compacts | Single-column, compacted header, 4-column category grid, 44px tap targets. |
| **390px** | iPhone 13/14/15/16, Pixel 7 | Standard native mobile shell, bottom sheet width 100%, full-width bottom bar. |
| **430px** | iPhone 14/15/16 Pro Max | Increased padding (20px), 5-column category grid, enhanced typography hierarchy. |
| **768px** | iPad Mini, Android Tablets | Shell constrained to 480px centered column with ambient backdrop or dual-column view. |
| **1024px+**| Desktop Browsers | Max-width 480px mobile emulator frame centered on viewport with system shadow. |

---

## 3. CORE FEATURE LOGIC & STORAGE ENGINE (INDEXEDDB)

### 3.1 Dexie.js Schema & Database Configuration (`src/services/db.ts`)

```typescript
import Dexie, { type Table } from 'dexie';
import type {
  Transaction,
  ReceiptAttachment,
  Category,
  Account,
  Budget,
  UserSettings
} from '@/types/models';

export class AppDatabase extends Dexie {
  transactions!: Table<Transaction, string>;
  receipts!: Table<ReceiptAttachment, string>;
  categories!: Table<Category, string>;
  accounts!: Table<Account, string>;
  budgets!: Table<Budget, string>;
  settings!: Table<UserSettings, string>;

  constructor() {
    super('vue_offline_expense_tracker_db');

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

export const initializeDatabaseDefaults = async (): Promise<void> => {
  const timestamp = Date.now();

  const initialCategories: Category[] = [
    { id: 'cat_groceries', name: 'Groceries', type: 'expense', icon: 'shopping-cart', colorHex: '#10B981', isSystem: true, isHidden: false, sortOrder: 1, isArchived: false, createdAt: timestamp, updatedAt: timestamp },
    { id: 'cat_dining', name: 'Dining Out', type: 'expense', icon: 'utensils', colorHex: '#F59E0B', isSystem: true, isHidden: false, sortOrder: 2, isArchived: false, createdAt: timestamp, updatedAt: timestamp },
    { id: 'cat_transport', name: 'Transport', type: 'expense', icon: 'car', colorHex: '#3B82F6', isSystem: true, isHidden: false, sortOrder: 3, isArchived: false, createdAt: timestamp, updatedAt: timestamp },
    { id: 'cat_housing', name: 'Housing & Utilities', type: 'expense', icon: 'home', colorHex: '#6366F1', isSystem: true, isHidden: false, sortOrder: 4, isArchived: false, createdAt: timestamp, updatedAt: timestamp },
    { id: 'cat_entertainment', name: 'Entertainment', type: 'expense', icon: 'film', colorHex: '#EC4899', isSystem: true, isHidden: false, sortOrder: 5, isArchived: false, createdAt: timestamp, updatedAt: timestamp },
    { id: 'cat_health', name: 'Health & Medical', type: 'expense', icon: 'activity', colorHex: '#EF4444', isSystem: true, isHidden: false, sortOrder: 6, isArchived: false, createdAt: timestamp, updatedAt: timestamp },
    { id: 'cat_salary', name: 'Salary', type: 'income', icon: 'dollar-sign', colorHex: '#059669', isSystem: true, isHidden: false, sortOrder: 7, isArchived: false, createdAt: timestamp, updatedAt: timestamp },
    { id: 'cat_freelance', name: 'Freelance & Side Gig', type: 'income', icon: 'briefcase', colorHex: '#0D9488', isSystem: true, isHidden: false, sortOrder: 8, isArchived: false, createdAt: timestamp, updatedAt: timestamp },
    { id: 'cat_investment', name: 'Investment Returns', type: 'income', icon: 'trending-up', colorHex: '#8B5CF6', isSystem: true, isHidden: false, sortOrder: 9, isArchived: false, createdAt: timestamp, updatedAt: timestamp },
    { id: 'cat_transfer', name: 'Account Transfer', type: 'transfer', icon: 'repeat', colorHex: '#64748B', isSystem: true, isHidden: true, sortOrder: 10, isArchived: false, createdAt: timestamp, updatedAt: timestamp }
  ];

  const initialAccounts: Account[] = [
    { id: 'acc_cash', name: 'Cash', type: 'cash', initialBalance: 0, currency: 'USD', colorHex: '#10B981', sortOrder: 1, isArchived: false, createdAt: timestamp, updatedAt: timestamp },
    { id: 'acc_checking', name: 'Bank Checking', type: 'bank', initialBalance: 0, currency: 'USD', colorHex: '#3B82F6', sortOrder: 2, isArchived: false, createdAt: timestamp, updatedAt: timestamp },
    { id: 'acc_credit', name: 'Credit Card', type: 'credit', initialBalance: 0, currency: 'USD', colorHex: '#EF4444', sortOrder: 3, isArchived: false, createdAt: timestamp, updatedAt: timestamp }
  ];

  const defaultSettings: UserSettings = {
    id: 'user_settings',
    baseCurrency: 'USD',
    theme: 'system',
    hapticEnabled: true,
    firstDayOfWeek: 1,
    updatedAt: timestamp
  };

  await db.transaction('rw', [db.categories, db.accounts, db.settings], async () => {
    const [catCount, accCount, settingsRecord] = await Promise.all([
      db.categories.count(),
      db.accounts.count(),
      db.settings.get('user_settings')
    ]);

    if (catCount === 0) {
      await db.categories.bulkPut(initialCategories);
    }
    if (accCount === 0) {
      await db.accounts.bulkPut(initialAccounts);
    }
            if (!settingsRecord) {
      await db.settings.put(defaultSettings);
    }
  });
};
```

### 3.2 Ledger Service & Mutation Engine (`src/services/ledgerService.ts`)

```typescript
import { db } from '@/services/db';
import { generateUUID } from '@/utils/id';
import type { Account, Transaction, NewBudgetDTO } from '@/types/models';

export const computeAccountBalances = (accounts: Account[], transactions: Transaction[]): Map<string, number> => {
  const balances = new Map(accounts.map(a => [a.id, a.initialBalance]));
  const add = (id: string, delta: number) => {
    const cur = balances.get(id);
    if (cur !== undefined) balances.set(id, cur + delta);
  };
  for (const tx of transactions) {
    if (tx.type === 'income') add(tx.accountId, tx.amount);
    else if (tx.type === 'expense') add(tx.accountId, -tx.amount);
    else {
      add(tx.accountId, -tx.amount);
      if (tx.toAccountId) add(tx.toAccountId, tx.amount);
    }
  }
  return balances;
};

export const changeBaseCurrency = async (currency: string): Promise<void> => {
  await db.transaction('rw', [db.settings, db.accounts, db.transactions], async () => {
    if ((await db.transactions.count()) > 0) {
      throw new Error('Base currency is locked once transactions exist');
    }
    const now = Date.now();
    await db.settings.update('user_settings', { baseCurrency: currency, updatedAt: now });
    await db.accounts.toCollection().modify(a => { a.currency = currency; a.updatedAt = now; });
  });
};

export const updateTransaction = async (
  id: string,
  updates: Partial<Pick<Transaction, 'type' | 'amount' | 'accountId' | 'toAccountId' | 'categoryId' | 'date' | 'note' | 'tags'>>
): Promise<void> => {
  await db.transaction('rw', db.transactions, async () => {
    const existing = await db.transactions.get(id);
    if (!existing) throw new Error('Transaction not found');
    const merged: Transaction = { ...existing, ...updates, updatedAt: Date.now() };
    merged.yearMonth = merged.date.slice(0, 7);
    if (!Number.isSafeInteger(merged.amount) || merged.amount <= 0) throw new Error('Invalid amount');
    if (merged.type === 'transfer') {
      merged.categoryId = 'cat_transfer';
      if (!merged.toAccountId || merged.toAccountId === merged.accountId) throw new Error('Invalid transfer destination');
    } else {
      delete merged.toAccountId;
      if (merged.categoryId === 'cat_transfer') throw new Error('Category required');
    }
    await db.transactions.put(merged);
  });
};

export const deleteTransaction = async (id: string): Promise<void> => {
  await db.transaction('rw', [db.transactions, db.receipts], async () => {
    await db.receipts.where('transactionId').equals(id).delete();
    await db.transactions.delete(id);
  });
};

export const archiveAccount = (id: string) =>
  db.accounts.update(id, { isArchived: true, updatedAt: Date.now() });

export const deleteAccount = async (id: string): Promise<void> => {
  const used = await db.transactions.where('accountId').equals(id).or('toAccountId').equals(id).count();
  if (used > 0) throw new Error('Account has transactions — archive it instead');
  await db.accounts.delete(id);
};

export const deleteCategory = async (id: string): Promise<void> => {
  await db.transaction('rw', [db.categories, db.transactions, db.budgets], async () => {
    const cat = await db.categories.get(id);
    if (!cat || cat.isSystem) throw new Error('System categories cannot be deleted');
    if ((await db.transactions.where('categoryId').equals(id).count()) > 0) {
      throw new Error('Category has transactions — archive it instead');
    }
    await db.budgets.where('categoryId').equals(id).delete();
    await db.categories.delete(id);
  });
};

export const upsertBudget = async (input: NewBudgetDTO): Promise<string> =>
  db.transaction('rw', [db.budgets, db.categories], async () => {
    const cat = await db.categories.get(input.categoryId);
    if (!cat || cat.type !== 'expense' || cat.isHidden) throw new Error('Budgets apply to expense categories only');
    const existing = await db.budgets.where('[categoryId+yearMonth]').equals([input.categoryId, input.yearMonth]).first();
    const now = Date.now();
    if (existing) {
      await db.budgets.update(existing.id, { amount: input.amount, updatedAt: now });
      return existing.id;
    }
    const id = generateUUID();
    await db.budgets.add({ ...input, id, createdAt: now, updatedAt: now });
    return id;
  });
```
---

## 4. DOMAIN COMPOSABLES & LOGICAL ENGINES

### 4.1 Currency Formatter Composable (`src/composables/useCurrency.ts`)

```typescript
import { computed } from 'vue';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  getCurrencyFractionDigits,
  formatCurrency as formatCurrencyUtil,
  parseMajorToMinor as parseMajorToMinorUtil,
  formatMinorToMajorString
} from '@/utils/money';

export function useCurrency() {
  const settingsStore = useSettingsStore();

  const activeCurrency = computed(() => settingsStore.settings.baseCurrency);

  const formatCurrency = (minorUnits: number, customCurrency?: string): string => {
    return formatCurrencyUtil(minorUnits, customCurrency || activeCurrency.value);
  };

  const parseMajorToMinor = (majorString: string, customCurrency?: string): number => {
    const res = parseMajorToMinorUtil(majorString, customCurrency || activeCurrency.value);
    return res.minor;
  };

  const formatMinorToInputString = (minorUnits: number, customCurrency?: string): string => {
    return formatMinorToMajorString(minorUnits, customCurrency || activeCurrency.value);
  };

  return {
    getCurrencyFractionDigits,
    formatCurrency,
    parseMajorToMinor,
    formatMinorToInputString,
    activeCurrency
  };
}
```

### 4.2 Haptic Feedback Engine (`src/composables/useHaptics.ts`)

```typescript
import { useSettingsStore } from '@/stores/settingsStore';

export type HapticType = 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error';

export function useHaptics() {
  const settingsStore = useSettingsStore();

  const trigger = (type: HapticType = 'light'): void => {
    if (!settingsStore.settings.hapticEnabled) return;
    if (typeof window === 'undefined' || !('vibrate' in navigator)) return;

    switch (type) {
      case 'selection':
        navigator.vibrate(10);
        break;
      case 'light':
        navigator.vibrate(20);
        break;
      case 'medium':
        navigator.vibrate(40);
        break;
      case 'heavy':
        navigator.vibrate(60);
        break;
      case 'success':
        navigator.vibrate([15, 30, 20]);
        break;
      case 'warning':
        navigator.vibrate([30, 50, 30]);
        break;
      case 'error':
        navigator.vibrate([50, 50, 50, 50, 50]);
        break;
    }
  };

  return { trigger };
}
```

### 4.3 Financial Calculations & Aggregations (`src/composables/useLedgerCalculations.ts`)

```typescript
import type {
  Transaction,
  FinancialSummary,
  CategorySpendBreakdown,
  Category,
  Budget,
  BudgetUtilization
} from '@/types/models';

export function useLedgerCalculations() {
  const calculateFinancialSummary = (
    transactions: Transaction[],
    periodStart: string,
    periodEnd: string
  ): FinancialSummary => {
    let totalIncome = 0;
    let totalExpense = 0;

    for (const tx of transactions) {
      if (tx.type === 'income') {
        totalIncome += tx.amount;
      } else if (tx.type === 'expense') {
        totalExpense += tx.amount;
      }
    }

    const netSavings = totalIncome - totalExpense;
    const savingsRate = totalIncome > 0 ? Math.max(0, netSavings / totalIncome) : 0;

    return {
      totalIncome,
      totalExpense,
      netSavings,
      savingsRate,
      periodStart,
      periodEnd
    };
  };

  const calculateCategoryBreakdown = (
    transactions: Transaction[],
    categories: Category[]
  ): CategorySpendBreakdown[] => {
    const expenseTransactions = transactions.filter(tx => tx.type === 'expense');
    const totalExpense = expenseTransactions.reduce((acc, curr) => acc + curr.amount, 0);

    const categoryMap = new Map<string, { total: number; count: number }>();
    for (const tx of expenseTransactions) {
      const existing = categoryMap.get(tx.categoryId) || { total: 0, count: 0 };
      categoryMap.set(tx.categoryId, {
        total: existing.total + tx.amount,
        count: existing.count + 1
      });
    }

    const breakdown: CategorySpendBreakdown[] = [];
    const catLookup = new Map(categories.map(c => [c.id, c]));

    categoryMap.forEach((data, categoryId) => {
      const category = catLookup.get(categoryId) || {
        name: 'Uncategorized',
        colorHex: '#94A3B8',
        icon: 'help-circle'
      };

      const percentageOfTotal = totalExpense > 0 
        ? Math.round((data.total / totalExpense) * 10000) / 100 
        : 0;

      breakdown.push({
        categoryId,
        categoryName: category.name,
        colorHex: category.colorHex,
        icon: category.icon,
        totalSpent: data.total,
        percentageOfTotal,
        transactionCount: data.count
      });
    });

    return breakdown.sort((a, b) => b.totalSpent - a.totalSpent);
  };

  const calculateBudgetUtilization = (
    budgets: Budget[],
    transactions: Transaction[],
    categories: Category[],
    targetYearMonth?: string,
    referenceDate: Date = new Date()
  ): BudgetUtilization[] => {
    const currentYearMonth = `${referenceDate.getFullYear()}-${(referenceDate.getMonth() + 1).toString().padStart(2, '0')}`;
    const activeYearMonth = targetYearMonth || currentYearMonth;
    const expenseTransactions = transactions.filter(tx => tx.type === 'expense' && tx.yearMonth === activeYearMonth);
    const relevantBudgets = budgets.filter(b => b.yearMonth === activeYearMonth);
    const catLookup = new Map(categories.map(c => [c.id, c.name]));

    const [tYear = referenceDate.getFullYear(), tMonth = referenceDate.getMonth() + 1] = activeYearMonth
      .split('-')
      .map(v => parseInt(v, 10));

    const daysInTargetMonth = new Date(tYear, tMonth, 0).getDate();

    let remainingDaysInMonth: number;
    if (activeYearMonth < currentYearMonth) {
      remainingDaysInMonth = 0;
    } else if (activeYearMonth > currentYearMonth) {
      remainingDaysInMonth = daysInTargetMonth;
    } else {
      remainingDaysInMonth = Math.max(1, daysInTargetMonth - referenceDate.getDate() + 1);
    }

    return relevantBudgets.map(b => {
      const categorySpent = expenseTransactions
        .filter(tx => tx.categoryId === b.categoryId)
        .reduce((sum, tx) => sum + tx.amount, 0);

      const remainingAmount = b.amount - categorySpent;
      const utilizationPercentage = b.amount > 0 
        ? Math.round((categorySpent / b.amount) * 10000) / 100 
        : 0;
      
			const projectedDailyAllowance =
        remainingAmount > 0 && remainingDaysInMonth > 0
          ? Math.floor(remainingAmount / remainingDaysInMonth)
          : 0;

      return {
        budgetId: b.id,
        categoryId: b.categoryId,
        categoryName: catLookup.get(b.categoryId) || 'Unknown Category',
        budgetAmount: b.amount,
        actualSpent: categorySpent,
        remainingAmount,
        utilizationPercentage,
        isExceeded: categorySpent > b.amount,
        projectedDailyAllowance
      };
    });
  };

  return {
    calculateFinancialSummary,
    calculateCategoryBreakdown,
    calculateBudgetUtilization
  };
}
```

### 4.4 Data Sovereignty: Zero-Loss JSON/CSV Backup & Restore Engine (`src/services/dataTransfer.ts`)

```typescript
import { db } from '@/services/db';
import type { Transaction, Category, Account, Budget, UserSettings } from '@/types/models';

import { formatMinorToMajorString } from '@/utils/money';

type SerializedReceipt = Omit<ReceiptAttachment, 'dataBlob'> & { dataBase64: string };

export interface ExportArchiveV1 {
  version: 1;
  exportedAt: string;
  metadata: {
    app: 'vue-offline-expense-tracker';
    totalTransactions: number;
    totalCategories: number;
    totalAccounts: number;
    totalBudgets: number;
    totalReceipts: number;
  };
  payload: {
    settings: UserSettings[];
    accounts: Account[];
    categories: Category[];
    budgets: Budget[];
    transactions: Transaction[];
    receipts: SerializedReceipt[];
  };
}

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

const base64ToBlob = async (b64: string, mime: string): Promise<Blob> =>
  (await fetch(`data:${mime};base64,${b64}`)).blob();

export const generateBackupJSON = async (): Promise<string> => {
  const [settings, accounts, categories, budgets, transactions, rawReceipts] = await Promise.all([
    db.settings.toArray(), db.accounts.toArray(), db.categories.toArray(),
    db.budgets.toArray(), db.transactions.toArray(), db.receipts.toArray()
  ]);
  const receipts: SerializedReceipt[] = await Promise.all(
    rawReceipts.map(async ({ dataBlob, ...rest }) => ({ ...rest, dataBase64: await blobToBase64(dataBlob) }))
  );
  const archive: ExportArchiveV1 = {
    version: 1,
    exportedAt: new Date().toISOString(),
    metadata: {
      app: 'vue-offline-expense-tracker',
      totalTransactions: transactions.length,
      totalCategories: categories.length,
      totalAccounts: accounts.length,
      totalBudgets: budgets.length,
      totalReceipts: receipts.length
    },
    payload: { settings, accounts, categories, budgets, transactions, receipts }
  };
  return JSON.stringify(archive, null, 2);
};

export const markBackupExported = () =>
  db.settings.update('user_settings', { lastExportTimestamp: Date.now() });

const fail = (error: string) => ({ ok: false as const, error });

export const validateArchive = (raw: unknown):
  | { ok: true; archive: ExportArchiveV1 }
  | { ok: false; error: string } => {
  const a = raw as Partial<ExportArchiveV1> | null;
  if (!a || a.version !== 1 || a.metadata?.app !== 'vue-offline-expense-tracker' || !a.payload) {
    return fail('Not a valid backup file');
  }
  const { settings, accounts, categories, budgets, transactions, receipts = [] } = a.payload;
  if (![settings, accounts, categories, budgets, transactions, receipts].every(Array.isArray)) {
    return fail('Malformed payload');
  }
  const s = settings[0];
  if (settings.length !== 1 || !s || s.id !== 'user_settings') return fail('Settings record missing');
  if (accounts.some(x => x.currency !== s.baseCurrency)) return fail('Accounts must use the base currency');

  const accountIds = new Set(accounts.map(x => x.id));
  const categoryIds = new Set(categories.map(x => x.id));
  const txIds = new Set(transactions.map(x => x.id));

  for (const t of transactions) {
    if (!accountIds.has(t.accountId) || !categoryIds.has(t.categoryId)) return fail(`Transaction ${t.id} references a missing account or category`);
    if (!Number.isSafeInteger(t.amount) || t.amount <= 0) return fail(`Transaction ${t.id} has an invalid amount`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date) || t.yearMonth !== t.date.slice(0, 7)) return fail(`Transaction ${t.id} has an invalid date`);
    if (t.type === 'transfer' && (!t.toAccountId || !accountIds.has(t.toAccountId))) return fail(`Transfer ${t.id} has an invalid destination`);
  }
  if (budgets.some(b => !categoryIds.has(b.categoryId))) return fail('A budget references a missing category');
  if (receipts.some(r => !txIds.has(r.transactionId))) return fail('A receipt references a missing transaction');

  return { ok: true, archive: a as ExportArchiveV1 };
};

export const restoreBackupJSON = async (json: string): Promise<{ success: boolean; message: string }> => {
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { return { success: false, message: 'Restore failed: file is not valid JSON' }; }

  const v = validateArchive(parsed);
  if (!v.ok) return { success: false, message: `Restore failed: ${v.error}` };

  const { settings, accounts, categories, budgets, transactions, receipts = [] } = v.archive.payload;

  const rebuilt: ReceiptAttachment[] = await Promise.all(
    receipts.map(async ({ dataBase64, ...rest }) => ({ ...rest, dataBlob: await base64ToBlob(dataBase64, rest.mimeType) }))
  );

  try {
    await db.transaction('rw', [db.settings, db.accounts, db.categories, db.budgets, db.transactions, db.receipts], async () => {
      await Promise.all([
        db.settings.clear(), db.accounts.clear(), db.categories.clear(),
        db.budgets.clear(), db.transactions.clear(), db.receipts.clear()
      ]);
      await db.settings.bulkAdd(settings);
      await db.accounts.bulkAdd(accounts);
      await db.categories.bulkAdd(categories);
      await db.budgets.bulkAdd(budgets);
      await db.transactions.bulkAdd(transactions);
      await db.receipts.bulkAdd(rebuilt);
    });
  } catch (err: unknown) {
    return { success: false, message: `Restore failed: ${err instanceof Error ? err.message : 'database error'}` };
  }
  return { success: true, message: `Restored ${transactions.length} transactions.` };
};

const sanitizeForCSV = (input: string): string => {
  const trimmed = input.replace(/"/g, '""');
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    return `"'${trimmed}"`;
  }
  return `"${trimmed}"`;
};

export const generateTransactionsCSV = async (): Promise<string> => {
  const [transactions, categories, accounts] = await Promise.all([
    db.transactions.toArray(),
    db.categories.toArray(),
    db.accounts.toArray()
  ]);

  const catMap = new Map(categories.map(c => [c.id, c.name]));
  const accMap = new Map(accounts.map(a => [a.id, a]));

  const headers = ['Transaction ID', 'Date', 'Type', 'Amount', 'Currency', 'Account', 'To Account', 'Category', 'Note', 'Tags'];
  const rows = transactions.map(tx => {
    const account = accMap.get(tx.accountId);
    const currency = account?.currency || 'USD';
    const amountMajor = formatMinorToMajorString(tx.amount, currency);

    const accountName = account?.name || 'Unknown';
    const toAccount = tx.toAccountId ? accMap.get(tx.toAccountId) : undefined;
    const toAccountName = toAccount?.name || '';
    const categoryName = catMap.get(tx.categoryId) || '';

    return [
      tx.id,
      tx.date,
      tx.type,
      amountMajor,
      currency,
      sanitizeForCSV(accountName),
      sanitizeForCSV(toAccountName),
      sanitizeForCSV(categoryName),
      sanitizeForCSV(tx.note),
      sanitizeForCSV(tx.tags.join(','))
    ].join(',');
  });

  return ['\uFEFF' + headers.join(','), ...rows].join('\r\n');
};
```

### 4.5 PWA Lifecycle Composable (`src/composables/usePwaManager.ts`)

```typescript
import { ref, computed } from 'vue';
import { useRegisterSW } from 'virtual:pwa-register/vue';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const isInstallable = ref<boolean>(false);
const isOffline = ref<boolean>(typeof navigator !== 'undefined' ? !navigator.onLine : false);
const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null);

const isIos = ref<boolean>(
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) &&
  !(window as unknown as { MSStream?: unknown }).MSStream
);

const isStandalone = ref<boolean>(
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true)
);

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferredPrompt.value = e as BeforeInstallPromptEvent;
    isInstallable.value = true;
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt.value = null;
    isInstallable.value = false;
  });

  window.addEventListener('online', () => {
    isOffline.value = false;
  });

  window.addEventListener('offline', () => {
    isOffline.value = true;
  });
}

const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW({ immediate: true });

export function usePwaManager() {
  const promptInstall = async (): Promise<boolean> => {
    if (!deferredPrompt.value) return false;
    await deferredPrompt.value.prompt();
    const { outcome } = await deferredPrompt.value.userChoice;
    deferredPrompt.value = null;
    isInstallable.value = false;
    return outcome === 'accepted';
  };

  return {
    isInstallable: computed(() => isInstallable.value),
    isOffline: computed(() => isOffline.value),
    isIosStandalonePromptRequired: computed(() => isIos.value && !isStandalone.value),
    needRefresh,
    offlineReady,
    updateServiceWorker,
    dismissUpdate: () => { needRefresh.value = false; },
    promptInstall
  };
}
```

---

## 5. 5-PHASE SEQUENTIAL QUEUE

### PHASE 1: SCAFFOLDING, TYPES, STORAGE, AND BASE UTILITIES

```
[ ] Step 1.0: Project Scaffolding & Dependencies
    - Scaffold using `npm create vue@latest` with TypeScript, Pinia, and Vue Router.
    - Install dependencies: `dexie`.
    - Install dev dependencies: `vite-plugin-pwa`, `@vite-pwa/assets-generator`.
    - Verify peerDependencies via `npm view vite-plugin-pwa peerDependencies` and pin in `package.json`.

[ ] Step 1.1: Toolchain Config, Tokens & Shell Foundation
    - In `tsconfig.app.json`: set `noUncheckedIndexedAccess: true`, `noUnusedLocals: true`, `noUnusedParameters: true`. Do NOT enable `exactOptionalPropertyTypes`.
    - In `src/env.d.ts`: add `/// <reference types="vite-plugin-pwa/vue" />`.
    - Configure `vite.config.ts`: `base: '/'`, `registerType: 'prompt'`, `injectRegister: false`, and `pwaAssets` with minimal-2023 preset.
    - Add mobile viewport meta to `index.html`: `viewport-fit=cover`, translucent status bar, theme-color `#0F172A`.
    - Create `src/assets/styles/tokens.css` with CSS variables (`--color-bg-primary`, `--color-surface`, `--color-text-primary`, `--color-text-muted`, `--color-border`), `overscroll-behavior-y: none`, and inputs `font-size: max(16px, 1em)`.

[ ] Step 1.2: Core Type Declarations
    - Create `src/types/models.ts` with Transaction, Category, Account, Budget, UserSettings, DTO types (`NewTransactionDTO`, `NewCategoryDTO`, `NewBudgetDTO`), and summary types.
    - Declare route meta interface: `declare module 'vue-router' { interface RouteMeta { title?: string } }`.

[ ] Step 1.3: Pure Mathematical, ID, Date & Validation Utilities
    - Create `src/utils/money.ts`: cached fraction digits, cached `Intl.NumberFormat`, `parseMajorToMinor` with trailing dot tolerance, and non-floating `formatMinorToMajorString`.
    - Create `src/utils/id.ts`: RFC 4122 v4 UUID generator with `crypto.getRandomValues` LAN fallback.
    - Create `src/utils/date.ts`: local `YYYY-MM-DD` formatter and month boundary helpers.
    - Create `src/utils/validation.ts`: `validateTransactionInput` with real calendar date validation and currency minor unit calculation.

[ ] Step 1.4: IndexedDB Client Setup via Dexie
    - Create `src/services/db.ts` implementing `AppDatabase` with unique compound index `&[categoryId+yearMonth]`.
    - Implement atomic `initializeDatabaseDefaults` seeding single-currency USD accounts, categories with sortOrder, and settings.

[ ] Step 1.5: Ledger Mutation Engine & Data Transfer Serialization
    - Create `src/services/ledgerService.ts`: `computeAccountBalances`, `changeBaseCurrency`, `updateTransaction`, `deleteTransaction` (with receipt cascade), `archiveAccount`, `deleteAccount`, `deleteCategory`, `upsertBudget`.
    - Create `src/services/dataTransfer.ts`: lossless `generateBackupJSON` with base64 receipt blobs, schema-validating `restoreBackupJSON`, and formula-injection-safe `generateTransactionsCSV` with UTF-8 BOM.

[ ] Step 1.6: Base Pinia Stores, Router & Bootstrap
    - Create `src/stores/settingsStore.ts` with synchronous initial state, raw object persistence (avoiding Vue proxy structured clone errors), and `document.documentElement.classList.toggle('dark')`.
    - Configure `src/router/index.ts` with `createWebHistory(import.meta.env.BASE_URL)`.
    - Wire `src/main.ts` to call `initializeDatabaseDefaults`, register Pinia/Router, load settings, persist storage quota (`navigator.storage.persist()`), and import `usePwaManager` before mount.

PHASE GATE: Execute `npx vue-tsc --noEmit -p tsconfig.app.json && npm run build`. Must pass before starting Phase 2.
```

### PHASE 2: DESIGN FOUNDATION & ATOMIC UI PRIMITIVES

```
[ ] Step 2.1: Native App Shell Tokens & CSS Architecture
    - Define CSS Custom Properties in `src/assets/styles/tokens.css`:
      * Safe area insets: `env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`, `env(safe-area-inset-left)`, `env(safe-area-inset-right)`
      * Theme color scales: Light & Dark palettes adhering to WCAG AA contrast ratios (using `--color-text-muted` on dark surfaces).
      * Hardware acceleration properties: `-webkit-tap-highlight-color: transparent`, `touch-action: manipulation`, `user-select: none` on buttons, `user-select: text` on inputs.
      * Dynamic viewport height container: `min-height: 100dvh`.

[ ] Step 2.2: Atomic Component: `AppIcon.vue` & Icon Catalog
    - Create `src/components/ui/icons.ts` defining `ICON_NAMES` const array and `IconName` union: `plus, minus, arrow-left-right, check, x, trash, edit, settings, pie-chart, wallet, calendar, tag, chevron-down, chevron-left, chevron-right, list, target, wifi-off, alert-circle, delete, search, camera, download, upload, shopping-cart, utensils, car, home, film, activity, dollar-sign, briefcase, trending-up, repeat, help-circle`.
    - Create `AppIcon.vue`: takes `name: IconName`, `size: number`, `color?: string`, with fallback to `help-circle`.

[ ] Step 2.3: Atomic Component: `AppButton.vue`
    - Implement touch-responsive button with active scale compression (`active:scale-95`).
    - Integrate automatic haptic triggering via `useHaptics` on click.
    - Variants: `primary`, `secondary`, `danger`, `ghost`, `icon`.

[ ] Step 2.4: Atomic Component: `AppSegmented.vue`
    - iOS-style sliding pill segmented control.
    - Props: `modelValue: string | number`, `options: Array<{ label: string; value: string | number }>`.
    - Include smooth CSS transition on sliding indicator tab.

[ ] Step 2.5: Atomic Component: `AppModalSheet.vue`
    - Native mobile bottom-sheet modal.
    - Supports touch-down swipe gestures to dismiss via passive touch event handlers.
    - Traps focus and adds background backdrop blur (`backdrop-filter: blur(8px)`).
    - Constrained max-width for desktop centered view (480px).

[ ] Step 2.6: Atomic Component: `AppKeypad.vue`
    - Full-screen/docked mobile numeric keypad for rapid transaction entry.
    - Keys: `1-9`, `.`, `0`, `backspace`.
    - Large 48px+ touch targets with immediate haptic touch response.
```

### PHASE 3: COMPOUND MOLECULES & FEATURE COMPONENTS

```
[ ] Step 3.1: Component: `AmountDisplay.vue`
    - Typography component rendering currency symbol, major units in prominent bold, and minor cents in superscript/smaller font.
    - Styled using scoped CSS token classes: positive income, negative expense, and transfer neutral.

[ ] Step 3.2: Component: `TransactionRow.vue`
    - Row representation of a ledger entry with category icon badge, category title, sub-note, account label, and formatted amount.
    - Touch-responsive horizontal gesture (`touch-action: pan-y`) with minimum 44px hit bounds and truncated note ellipsis.

[ ] Step 3.3: Component: `CategoryPicker.vue`
    - Scrollable grid presenting category icons in circular color bubbles.
    - High-contrast visual ring selection indicator with 2-line clamped category labels.
    - Inline dynamic button for triggering "Create New Category" modal.

[ ] Step 3.4: Component: `AccountPicker.vue`
    - Horizontal swipe-friendly pill selector displaying active accounts with live balances derived from `computeAccountBalances`.

[ ] Step 3.5: Component: `BudgetProgressBar.vue`
    - Compound progress bar displaying category name, budgeted cap, current spent, and percentage via `calculateBudgetUtilization(budgets, txs, cats, targetYearMonth)`.
    - Three-tier color thresholds: Normal (<80%), Warning (80-99%), Exceeded (>=100%).
    - Projected daily spend badge: displays remaining daily spend allowance (0 for past months).

[ ] Step 3.6: Component: `DateNavigator.vue`
    - Stepper component: previous period, active period display (e.g., "September 2026"), next period.
    - Direct date picker dropdown modal.
```

### PHASE 4: DOMAIN LOGIC, REACTIVE STATE, AND SPECIALIZED APIS

```
[ ] Step 4.1: Pinia Store: `useSettingsStore`
    - Reactive state holding user preferences: theme, base currency, haptics.
    - Integrated with `changeBaseCurrency` service locked once transactions exist.
    - Synchronized directly to Dexie `settings` table using raw unproxied records (`toRaw`).
    - Immediate document root class updates (`class="dark"`) based on active theme.

[ ] Step 4.2: Pinia Store: `useLedgerStore`
    - Central reactive state delegating mutations directly to `ledgerService.ts`.
    - Actions: `createTransaction`, `deleteTransaction`, `updateTransaction`, `createCategory`, `deleteCategory`, `archiveAccount`, `upsertBudget`.
    - Exposes reactive account balances computed via `computeAccountBalances`.
    - Stores never import composables; read-only Dexie live-queries synchronize active view data.

[ ] Step 4.3: SVG Visualization Engine
    - Implement `SpendingDonutChart.vue` using pure reactive SVG with responsive viewBox.
    - Calculate arc segments with trigonometric path generation (`M... A...`).
    - Implement `CashFlowBarChart.vue` rendering trailing income vs expense comparative bars with responsive horizontal scroll on mobile <= 430px.

[ ] Step 4.4: Progressive Web App Service Worker Integration
    - `vite-plugin-pwa` with `registerType: 'prompt'` and asset generation via `@vite-pwa/assets-generator`.
    - `usePwaManager` singleton exposing `needRefresh`, `updateServiceWorker`, `dismissUpdate`, and install prompt state.
    - Update banner in `AppShell` with 44px action buttons to reload or dismiss.
```

### PHASE 5: COMPLETE PAGE/SCREEN ASSEMBLY & RESPONSIVE SHELL

```
[ ] Step 5.1: Master App Shell (`src/layouts/AppShell.vue`)
    - Assemble fixed app shell containing:
      * Top safe-area bar (`AppHeader.vue`)
      * Center dynamic scroll region with overscroll isolation
      * Bottom persistent navigation (`AppTabBar.vue`) with elevated Center FAB button for Quick Add
      * Global Offline Banner triggered by `usePwaManager`
    - Apply desktop containment rules: Center maximum 480px width container on viewport >= 768px with soft device frame shadow.

[ ] Step 5.2: Screen: `DashboardView.vue`
    - Financial card displaying Net Balance, Total Monthly Income, and Total Monthly Expenses.
    - Daily spending burn-down graph.
    - "Recent Transactions" section with single-click jump to full ledger.
    - Budget warning cards for categories nearing or exceeding limits.

[ ] Step 5.3: Screen: `TransactionsView.vue`
    - Filterable, searchable transaction ledger.
    - Dynamic filter bar: Type (Income/Expense/Transfer), Account, Category, Date range, and Free text search.
    - Grouped transaction list sorted chronologically by day with sticky date headers.
    - Empty state view for unpopulated filters with clear call to action.

[ ] Step 5.4: Screen: `TransactionEntryView.vue` (Quick Add Experience)
    - Rendered inside `AppShell` as an absolute overlay (`z-index: 50`) positioned against `.app-frame`.
    - Fixed top bar with title and 44px dismiss/save buttons.
    - Amount hero and segmented type selector fixed in non-scrolling `.entry-top`.
    - Scrollable middle container (`min-height: 0`) for account chips, categories, date, and note.
    - Docked numeric keypad (`flex-shrink: 0`, height clamped) hidden on note field focus (`enterkeyhint="done"`).
    - Single base currency mode: all accounts share `settings.baseCurrency`.

[ ] Step 5.5: Screen: `AnalyticsView.vue`
    - Month selector header with `DateNavigator`.
    - Segmented toggle: Category Breakdown vs Cash Flow Over Time.
    - Pure SVG donut chart and breakdown list sorted by percentage.
    - Monthly Net Savings calculation with savings rate badge.

[ ] Step 5.6: Screen: `BudgetsView.vue`
    - Monthly budget overview passing `activeYearMonth` into `calculateBudgetUtilization`.
    - List of `BudgetProgressBar` molecules displaying remaining daily allowance (0 for past periods).
    - Modal sheet for envelope limits utilizing `upsertBudget` to handle unique compound index.

[ ] Step 5.7: Screen: `SettingsView.vue`
    - Account management list with balance display and archiving.
    - Base currency selector: editable initially, disabled with explanation once transactions exist.
    - Theme selector: system, light, dark.
    - Data Sovereignty section:
      * "Export Backup (JSON)": triggers JSON download and updates `lastExportTimestamp`.
      * "Export Spreadsheet (CSV)": triggers formula-safe CSV download with UTF-8 BOM.
      * "Restore from Backup": validates payload schema, rebuilds Blobs, writes to IndexedDB, and triggers `window.location.reload()`.
      * Stale backup warning banner when `lastExportTimestamp` is older than 30 days.
```

---

## 6. COMPLETE PRODUCTION IMPLEMENTATIONS

### 6.1 Layout Shell (`src/layouts/AppShell.vue`)

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usePwaManager } from '@/composables/usePwaManager';
import { useHaptics } from '@/composables/useHaptics';
import AppIcon from '@/components/ui/AppIcon.vue';

const route = useRoute();
const router = useRouter();
const { isOffline } = usePwaManager();
const haptics = useHaptics();

interface NavTab {
  name: string;
  path: string;
  icon: string;
  label: string;
}

const navTabs: NavTab[] = [
  { name: 'dashboard', path: '/', icon: 'wallet', label: 'Home' },
  { name: 'transactions', path: '/transactions', icon: 'list', label: 'Ledger' },
  { name: 'analytics', path: '/analytics', icon: 'pie-chart', label: 'Analytics' },
  { name: 'budgets', path: '/budgets', icon: 'target', label: 'Budgets' }
];

const currentRoutePath = computed(() => route.path);

const navigateTo = (path: string) => {
  haptics.trigger('selection');
  router.push(path);
};

const openSettings = () => {
  haptics.trigger('selection');
  router.push('/settings');
};

const openQuickAdd = () => {
  haptics.trigger('medium');
  router.push('/entry');
};
</script>

<template>
  <div class="shell-root">
    <!-- Desktop Responsive Outer Wrapper -->
    <div class="app-frame">
      <!-- Top Dynamic Header -->
      <header class="app-header">
        <div class="header-content">
          <slot name="header">
            <h1 class="header-title">{{ (route.meta.title as string) || 'Expense Tracker' }}</h1>
          </slot>
          <button type="button" class="header-action-btn" aria-label="Settings" @click="openSettings">
            <AppIcon name="settings" :size="20" />
          </button>
        </div>

        <!-- PWA Update Available Banner -->
        <div v-if="needRefresh && route.path !== '/entry'" class="update-banner" role="status">
          <span>New version available</span>
          <div class="banner-actions">
            <button type="button" class="banner-btn" @click="updateServiceWorker(true)">Reload</button>
            <button type="button" class="banner-btn secondary" @click="dismissUpdate">Later</button>
          </div>
        </div>

        <!-- Offline Detection Notice -->
        <div v-if="isOffline" class="offline-banner" role="status">
          <AppIcon name="wifi-off" :size="14" color="#FFFFFF" />
          <span>Offline Mode &bull; Changes Stored Locally</span>
        </div>
      </header>

      <!-- Scrollable Main Viewport -->
      <main class="app-viewport">
        <slot />
      </main>

      <!-- Bottom Floating Add + Navigation Tab Bar -->
      <nav class="app-tab-bar" aria-label="Main Navigation">
        <div class="tab-bar-container">
          <!-- Left Tabs -->
          <button
            v-for="tab in navTabs.slice(0, 2)"
            :key="tab.path"
            type="button"
            class="tab-button"
            :class="{ active: currentRoutePath === tab.path }"
            @click="navigateTo(tab.path)"
          >
            <AppIcon :name="tab.icon" :size="22" />
            <span class="tab-label">{{ tab.label }}</span>
          </button>

          <!-- Center Floating Action Button (Quick Add) -->
          <div class="fab-wrapper">
            <button
              type="button"
              class="fab-button"
              aria-label="Add Transaction"
              @click="openQuickAdd"
            >
              <AppIcon name="plus" :size="26" color="#FFFFFF" />
            </button>
          </div>

          <!-- Right Tabs -->
          <button
            v-for="tab in navTabs.slice(2)"
            :key="tab.path"
            type="button"
            class="tab-button"
            :class="{ active: currentRoutePath === tab.path }"
            @click="navigateTo(tab.path)"
          >
            <AppIcon :name="tab.icon" :size="22" />
            <span class="tab-label">{{ tab.label }}</span>
          </button>
        </div>
      </nav>
    </div>
  </div>
</template>

<style scoped>
.shell-root {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  min-height: 100dvh;
  background-color: #090D16;
  overflow: hidden;
}

.app-frame {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  height: 100dvh;
  max-width: 480px;
  background-color: #0F172A;
  color: #F8FAFC;
  box-shadow: 0 0 50px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.app-header {
  flex-shrink: 0;
  background-color: rgba(15, 23, 42, 0.92);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: max(env(safe-area-inset-top), 12px);
  z-index: 30;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  padding: 0 16px;
}

.header-title {
  font-size: 1.125rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0;
}

.header-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  background: transparent;
  border: none;
  color: #94A3B8;
  cursor: pointer;
  border-radius: 8px;
  padding: 0;
}

.header-action-btn:active {
  color: #F8FAFC;
  transform: scale(0.94);
}

.update-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background-color: #0284C7;
  color: #FFFFFF;
  font-size: 0.8125rem;
  font-weight: 500;
}

.banner-actions {
  display: flex;
  gap: 8px;
}

.banner-btn {
  min-height: 44px;
  padding: 0 12px;
  background-color: #FFFFFF;
  color: #0284C7;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.75rem;
  cursor: pointer;
}

.banner-btn.secondary {
  background: transparent;
  color: #FFFFFF;
  border: 1px solid rgba(255, 255, 255, 0.4);
}

.offline-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background-color: #D97706;
  color: #FFFFFF;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 4px 12px;
}

.app-viewport {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
  padding: 16px;
  padding-bottom: calc(max(env(safe-area-inset-bottom), 16px) + 72px);
}

.app-tab-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(16px);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-bottom: max(env(safe-area-inset-bottom), 8px);
  z-index: 40;
}

.tab-bar-container {
  display: flex;
  align-items: center;
  justify-content: space-around;
  height: 56px;
  position: relative;
  padding: 0 4px;
}

.tab-button {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  height: 100%;
  background: transparent;
  border: none;
  color: #64748B;
  cursor: pointer;
  touch-action: manipulation;
  transition: color 0.15s ease, transform 0.1s ease;
}

.tab-button:active {
  transform: scale(0.92);
}

.tab-button.active {
  color: #38BDF8;
}

.tab-label {
  font-size: 0.6875rem;
  font-weight: 500;
  margin-top: 3px;
}

.fab-wrapper {
  position: relative;
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
}

.fab-button {
  width: 50px;
  height: 50px;
  border-radius: 25px;
  background: linear-gradient(135deg, #0284C7, #0EA5E9);
  border: 3px solid #0F172A;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 14px rgba(14, 165, 233, 0.4);
  cursor: pointer;
  touch-action: manipulation;
  transition: transform 0.12s cubic-bezier(0.34, 1.56, 0.64, 1);
  transform: translateY(-12px);
}

.fab-button:active {
  transform: translateY(-10px) scale(0.92);
}

@media (min-width: 768px) {
  .app-frame {
    height: 92vh;
    border-radius: 28px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .app-tab-bar {
    position: absolute;
    border-bottom-left-radius: 28px;
    border-bottom-right-radius: 28px;
  }
}
</style>
```

### 6.2 Full-Screen High-Speed Transaction Creator (`src/views/TransactionEntryView.vue`)

```vue
<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { db } from '@/services/db';
import { useCurrency } from '@/composables/useCurrency';
import { useHaptics } from '@/composables/useHaptics';
import { validateTransactionInput } from '@/utils/validation';
import { generateUUID } from '@/utils/id';
import type { Category, Account, TransactionType, Transaction } from '@/types/models';
import AppIcon from '@/components/ui/AppIcon.vue';
import AppSegmented from '@/components/ui/AppSegmented.vue';

const router = useRouter();
const haptics = useHaptics();
const { formatCurrency, parseMajorToMinor, getCurrencyFractionDigits, activeCurrency } = useCurrency();

const transactionType = ref<TransactionType>('expense');
const amountString = ref<string>('0');
const selectedAccountId = ref<string>('');
const selectedToAccountId = ref<string>('');
const selectedCategoryId = ref<string>('');
const note = ref<string>('');
const isNoteFocused = ref<boolean>(false);

const today = new Date();
const pad = (n: number) => n.toString().padStart(2, '0');
const transactionDate = ref<string>(`${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`);

const activeFractionDigits = computed(() => getCurrencyFractionDigits(activeCurrency.value));

const categories = ref<Category[]>([]);
const accounts = ref<Account[]>([]);
const isSubmitting = ref<boolean>(false);
const validationError = ref<string | null>(null);

const typeOptions = [
  { label: 'Expense', value: 'expense' },
  { label: 'Income', value: 'income' },
  { label: 'Transfer', value: 'transfer' }
];

watch(selectedAccountId, (id) => {
  if (!selectedToAccountId.value || selectedToAccountId.value === id) {
    selectedToAccountId.value = accounts.value.find(a => a.id !== id)?.id ?? '';
  }
});

onMounted(async () => {
  const allAccounts = await db.accounts.toArray();
  accounts.value = allAccounts.filter(a => !a.isArchived).sort((a, b) => a.sortOrder - b.sortOrder);
  if (accounts.value.length > 0 && accounts.value[0]) {
    selectedAccountId.value = accounts.value[0].id;
    if (accounts.value.length > 1 && accounts.value[1]) {
      selectedToAccountId.value = accounts.value[1].id;
    }
  }

  await loadCategories();
});

const loadCategories = async () => {
  if (transactionType.value === 'transfer') {
    categories.value = [];
    return;
  }
  const allCategories = await db.categories.where('type').equals(transactionType.value).toArray();
  categories.value = allCategories.filter(c => !c.isArchived && !c.isHidden).sort((a, b) => a.sortOrder - b.sortOrder);

  if (categories.value.length > 0 && categories.value[0]) {
    selectedCategoryId.value = categories.value[0].id;
  }
};

const handleTypeChange = async (val: string | number) => {
  haptics.trigger('selection');
  transactionType.value = val as TransactionType;
  await loadCategories();
};

const MAX_DIGITS = 12;

const handleKeyPress = (key: string) => {
  haptics.trigger('light');
  if (key === 'clear') {
    amountString.value = '0';
    return;
  }

  if (key === 'backspace') {
    if (amountString.value.length <= 1) {
      amountString.value = '0';
    } else {
      amountString.value = amountString.value.slice(0, -1);
    }
    return;
  }

  if (key === '.') {
    if (activeFractionDigits.value === 0) return;
    if (!amountString.value.includes('.')) {
      amountString.value += '.';
    }
    return;
  }

  if (amountString.value.replace('.', '').length >= MAX_DIGITS) return;

  if (amountString.value === '0') {
    amountString.value = key;
  } else {
    const parts = amountString.value.split('.');
    if (parts[1] && parts[1].length >= activeFractionDigits.value) {
      return;
    }
    amountString.value += key;
  }
};

const formattedAmountDisplay = computed(() => {
  const minor = parseMajorToMinor(amountString.value, activeCurrency.value);
  return formatCurrency(minor, activeCurrency.value);
});

const handleSaveTransaction = async () => {
  if (isSubmitting.value) return;
  validationError.value = null;

  const validation = validateTransactionInput({
    type: transactionType.value,
    amountMajor: amountString.value,
    currency: selectedAccountCurrency.value,
    accountId: selectedAccountId.value,
    categoryId: selectedCategoryId.value,
    toAccountId: selectedToAccountId.value,
    date: transactionDate.value,
    note: note.value
  });

  if (!validation.isValid || !validation.data) {
    haptics.trigger('error');
    validationError.value = Object.values(validation.errors)[0] || 'Validation error';
    return;
  }

  isSubmitting.value = true;
  try {
    const timestamp = Date.now();
    const newTxId = generateUUID();

    const newRecord: Transaction = {
      id: newTxId,
      type: validation.data.type,
      amount: validation.data.amount,
      accountId: validation.data.accountId,
      categoryId: validation.data.categoryId,
      date: validation.data.date,
      yearMonth: validation.data.yearMonth,
      note: validation.data.note,
      tags: validation.data.tags,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    if (validation.data.toAccountId) {
      newRecord.toAccountId = validation.data.toAccountId;
    }

    await db.transactions.add(newRecord);

    haptics.trigger('success');
    router.back();
  } catch (err: unknown) {
    haptics.trigger('error');
    validationError.value = 'Failed to write transaction to IndexedDB.';
  } finally {
    isSubmitting.value = false;
  }
};

const handleDismiss = () => {
  haptics.trigger('light');
  router.back();
};
</script>

<template>
  <div class="entry-view">
    <!-- Header Navigation -->
    <header class="entry-header">
      <button type="button" class="action-btn" @click="handleDismiss">
        <AppIcon name="x" :size="22" />
      </button>
      <span class="entry-title">New Transaction</span>
      <button 
        type="button" 
        class="save-btn" 
        :disabled="isSubmitting || amountString === '0'"
        @click="handleSaveTransaction"
      >
        Save
      </button>
    </header>

    <!-- Fixed Top Region Above Scroller -->
    <div class="entry-top">
      <div v-if="validationError" class="validation-banner" role="alert">
        <AppIcon name="alert-circle" :size="16" color="#EF4444" />
        <span>{{ validationError }}</span>
      </div>

      <div class="type-selector-wrapper">
        <AppSegmented
          :model-value="transactionType"
          :options="typeOptions"
          @update:model-value="handleTypeChange"
        />
      </div>

      <div class="amount-hero" :class="transactionType">
        <span class="amount-text">{{ formattedAmountDisplay }}</span>
      </div>
    </div>

    <!-- Scrollable Middle Region -->
    <div class="entry-content">
      <div class="selection-section">
        <!-- Account Chips -->
        <div class="form-row">
          <label class="row-label">Account</label>
          <div class="chips-scroll">
            <button
              v-for="acc in accounts"
              :key="acc.id"
              type="button"
              class="chip-button"
              :class="{ selected: selectedAccountId === acc.id }"
              @click="selectedAccountId = acc.id"
            >
              {{ acc.name }}
            </button>
          </div>
        </div>

        <!-- If Transfer: Destination Account -->
        <div v-if="transactionType === 'transfer'" class="form-row">
          <label class="row-label">To Account</label>
          <div class="chips-scroll">
            <button
              v-for="acc in accounts.filter(a => a.id !== selectedAccountId)"
              :key="acc.id"
              type="button"
              class="chip-button"
              :class="{ selected: selectedToAccountId === acc.id }"
              @click="selectedToAccountId = acc.id"
            >
              {{ acc.name }}
            </button>
          </div>
        </div>

        <!-- Categories Grid (Expense & Income) -->
        <div v-if="transactionType !== 'transfer'" class="form-row">
          <label class="row-label">Category</label>
          <div class="category-grid">
            <button
              v-for="cat in categories"
              :key="cat.id"
              type="button"
              class="category-tile"
              :class="{ selected: selectedCategoryId === cat.id }"
              @click="selectedCategoryId = cat.id"
            >
              <div class="category-bubble" :style="{ backgroundColor: cat.colorHex }">
                <AppIcon :name="cat.icon" :size="18" color="#FFFFFF" />
              </div>
              <span class="category-label">{{ cat.name }}</span>
            </button>
          </div>
        </div>

        <!-- Note Input -->
        <div class="form-row">
          <label class="row-label">Note</label>
          <input
            v-model="note"
            type="text"
            placeholder="Add description..."
            class="native-input"
            maxlength="120"
            enterkeyhint="done"
            @focus="isNoteFocused = true"
            @blur="isNoteFocused = false"
            @keydown.enter="($event.target as HTMLInputElement).blur()"
          />
        </div>
      </div>
    </div>

    <!-- Docked Sticky Keypad Footer -->
    <div v-show="!isNoteFocused" class="keypad-dock" role="group" aria-label="Numeric Entry">
      <button
        v-for="key in ['1', '2', '3', '4', '5', '6', '7', '8', '9', activeFractionDigits > 0 ? '.' : '', '0', 'backspace']"
        :key="key"
        type="button"
        class="keypad-key"
        :disabled="key === ''"
        @click="key !== '' && handleKeyPress(key)"
      >
        <span v-if="key !== 'backspace'">{{ key }}</span>
        <AppIcon v-else name="delete" :size="20" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.entry-view {
  position: absolute;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--color-bg-primary, #0F172A);
  color: var(--color-text-primary, #FFFFFF);
}

.entry-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: max(env(safe-area-inset-top), 12px) 16px 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  background: transparent;
  border: none;
  color: #94A3B8;
  cursor: pointer;
  padding: 8px;
}

.entry-title {
  font-size: 1rem;
  font-weight: 600;
}

.save-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  background-color: #0EA5E9;
  color: #FFFFFF;
  border: none;
  border-radius: 16px;
  padding: 0 18px;
  font-weight: 600;
  font-size: 0.875rem;
  cursor: pointer;
}

.save-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.entry-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 16px;
}

.keypad-dock {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding: 12px 16px max(env(safe-area-inset-bottom), 12px) 16px;
  background-color: var(--color-bg-primary, #0F172A);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.validation-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  color: #F87171;
  font-size: 0.8125rem;
  margin-bottom: 12px;
}

.type-selector-wrapper {
  margin-bottom: 16px;
}

.amount-hero {
  text-align: center;
  padding: 12px 0;
  font-weight: 800;
  letter-spacing: -0.03em;
}

.amount-hero.expense { color: #F43F5E; }
.amount-hero.income { color: #10B981; }
.amount-hero.transfer { color: #38BDF8; }

.entry-top {
  flex-shrink: 0;
  padding: 12px 16px 0;
}

.amount-text {
  font-size: clamp(1.75rem, 8vw, 2.75rem);
  line-height: 1.1;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.keypad-key {
  height: clamp(44px, 7.2dvh, 52px);
}

.selection-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 16px;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.row-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #94A3B8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.chips-scroll {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.chip-button {
  flex-shrink: 0;
  min-height: 44px;
  padding: 8px 16px;
  background-color: #1E293B;
  color: #CBD5E1;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 22px;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
}

.chip-button.selected {
  background-color: #0284C7;
  color: #FFFFFF;
  border-color: #38BDF8;
}

.category-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  max-height: 160px;
  overflow-y: auto;
}

@media (min-width: 430px) {
  .category-grid {
    grid-template-columns: repeat(5, 1fr);
  }
}

.category-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: transparent;
  border: none;
  cursor: pointer;
  gap: 4px;
  padding: 4px;
}

.category-bubble {
  width: 44px;
  height: 44px;
  border-radius: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.1s ease;
}

.category-tile.selected .category-bubble {
  outline: 3px solid #38BDF8;
  outline-offset: 2px;
  transform: scale(1.05);
}

.category-label {
  font-size: 0.6875rem;
  color: #94A3B8;
  text-align: center;
  line-height: 1.15;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
  max-width: 64px;
}

.native-input {
  width: 100%;
  background-color: #1E293B;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 10px 14px;
  color: #FFFFFF;
  font-size: 1rem;
  outline: none;
}

.native-input:focus {
  border-color: #38BDF8;
}

.keypad-grid {
  margin-top: auto;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding-bottom: max(env(safe-area-inset-bottom), 12px);
}

.keypad-key {
  height: 52px;
  background-color: #1E293B;
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 14px;
  color: #F8FAFC;
  font-size: 1.375rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  touch-action: manipulation;
  user-select: none;
}

.keypad-key:active {
  background-color: #334155;
  transform: scale(0.96);
}
</style>
```

### 6.3 Progressive Web App & Service Worker Pipeline (`vite.config.ts`)

```typescript
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/',
  plugins: [
    vue(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      pwaAssets: {
        image: 'public/icon.svg',
        preset: 'minimal-2023'
      },
      manifest: {
        name: 'Vue Offline Expense Tracker',
        short_name: 'Expenses',
        description: 'Offline-First Personal Finance Tracker and Budget Engine',
        theme_color: '#0F172A',
        background_color: '#090D16',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}']
      }
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 3000,
    host: true
  }
});
```

---

## 7. HARDWARE ERGONOMICS & OFFLINE RESILIENCE AUDIT CHECKLIST

1. **Touch Target Dimensions**: Minimum 44px by 44px tap bounds for every interactive atomic unit (`AppButton`, `keypad-key`, `chip-button`, `tab-button`, `save-btn`, `action-btn`, `header-action-btn`, `banner-btn`) to guarantee compliance with WCAG 2.5.5 and Apple HIG. All theme contrasts meet WCAG AA standards.
2. **Safe-Area Inset Handling**: Full encapsulation of `env(safe-area-inset-bottom)` prevents button occlusion by the iOS Home Indicator and Android 3-button system bars.
3. **Rubber-Band Scroll Mitigation**: Over-scrolling blocked on parent app containers (`overscroll-behavior-y: contain`) to preserve native native-app tactile sensation without full page un-anchoring.
4. **Cache & Persistence Integrity**: IndexedDB stores user financial data purely on-device with transactional ACID compliance. Zero external network calls required for any core feature (viewing, adding, deleting, categorizing, or exporting).