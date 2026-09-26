/**
 * Ledger mutation engine.
 *
 * Every exported mutation validates its payload and enforces referential
 * integrity inside a single Dexie transaction. Callers (Pinia stores, views)
 * receive rejected promises with human-readable messages and never observe a
 * partially written ledger.
 */

import { db, SETTINGS_RECORD_ID } from '@/services/db';
import { generateUUID } from '@/utils/id';
import { isValidCalendarDayString } from '@/utils/date';
import { isSupportedCurrency } from '@/utils/money';
import { validateCategoryInput, normalizeTags } from '@/utils/validation';
import { TRANSFER_CATEGORY_ID } from '@/types/models';
import type {
  Account,
  AccountBalance,
  Budget,
  Category,
  NewAccountDTO,
  NewBudgetDTO,
  NewCategoryDTO,
  NewTransactionDTO,
  Transaction
} from '@/types/models';

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

const firstErrorMessage = (errors: Record<string, string>, fallback: string): string =>
  Object.values(errors)[0] ?? fallback;

/**
 * Signed balance of every account: opening balance plus every ledger leg.
 * Transfers debit the source account and credit the destination account.
 */
export const computeAccountBalances = (
  accounts: readonly Account[],
  transactions: readonly Transaction[]
): Map<string, number> => {
  const balances = new Map(accounts.map((account) => [account.id, account.initialBalance]));

  const apply = (accountId: string, delta: number): void => {
    const current = balances.get(accountId);
    if (current !== undefined) balances.set(accountId, current + delta);
  };

  for (const tx of transactions) {
    if (tx.type === 'income') {
      apply(tx.accountId, tx.amount);
    } else if (tx.type === 'expense') {
      apply(tx.accountId, -tx.amount);
    } else {
      apply(tx.accountId, -tx.amount);
      if (tx.toAccountId) apply(tx.toAccountId, tx.amount);
    }
  }

  return balances;
};

/** Presentation-ready balance rows (active accounts first, then by sortOrder). */
export const buildAccountBalances = (
  accounts: readonly Account[],
  transactions: readonly Transaction[]
): AccountBalance[] => {
  const balances = computeAccountBalances(accounts, transactions);

  return accounts
    .map<AccountBalance>((account) => ({
      accountId: account.id,
      accountName: account.name,
      currency: account.currency,
      initialBalance: account.initialBalance,
      currentBalance: balances.get(account.id) ?? account.initialBalance,
      isArchived: account.isArchived
    }))
    .sort((a, b) => Number(a.isArchived) - Number(b.isArchived) || a.accountName.localeCompare(b.accountName));
};

const normalizeTransactionDraft = (input: NewTransactionDTO): NewTransactionDTO => ({
  ...input,
  yearMonth: input.date.slice(0, 7),
  note: input.note.trim(),
  tags: normalizeTags(input.tags),
  categoryId: input.type === 'transfer' ? TRANSFER_CATEGORY_ID : input.categoryId,
  toAccountId: input.type === 'transfer' ? input.toAccountId : undefined
});

const assertTransactionIntegrity = async (record: Transaction): Promise<void> => {
  if (!Number.isSafeInteger(record.amount) || record.amount <= 0) {
    throw new Error('Transaction amount must be a positive whole number of minor units');
  }

  if (!isValidCalendarDayString(record.date)) {
    throw new Error('Transaction date must be a real calendar day');
  }

  if (record.yearMonth !== record.date.slice(0, 7)) {
    throw new Error('Transaction month bucket does not match its date');
  }

  const sourceAccount = await db.accounts.get(record.accountId);
  if (!sourceAccount) throw new Error('Source account no longer exists');
  if (sourceAccount.isArchived) throw new Error('Cannot post transactions to an archived account');

  if (record.type === 'transfer') {
    if (record.categoryId !== TRANSFER_CATEGORY_ID) {
      throw new Error('Transfers must use the system Account Transfer category');
    }
    if (!record.toAccountId) throw new Error('Destination account is required for transfers');
    if (record.toAccountId === record.accountId) {
      throw new Error('Source and destination accounts must be distinct');
    }

    const destinationAccount = await db.accounts.get(record.toAccountId);
    if (!destinationAccount) throw new Error('Destination account no longer exists');
    if (destinationAccount.isArchived) throw new Error('Cannot transfer to an archived account');
    if (destinationAccount.currency !== sourceAccount.currency) {
      throw new Error('Transfers must stay within a single currency');
    }

    return;
  }

  const category = await db.categories.get(record.categoryId);
  if (!category) throw new Error('Selected category no longer exists');
  if (category.isArchived) throw new Error('Cannot post transactions to an archived category');
  if (category.type !== record.type) {
    throw new Error(`${category.name} cannot be used for a ${record.type} entry`);
  }
};

/** Creates a transaction and returns its generated identifier. */
export const createTransaction = async (input: NewTransactionDTO): Promise<string> => {
  const timestamp = Date.now();
  const record: Transaction = {
    ...normalizeTransactionDraft(input),
    id: generateUUID(),
    createdAt: timestamp,
    updatedAt: timestamp
  };

  await db.transaction('rw', [db.transactions, db.accounts, db.categories], async () => {
    await assertTransactionIntegrity(record);
    await db.transactions.add(record);
  });

  return record.id;
};

/** Patches a transaction, re-deriving its month bucket and transfer invariants. */
export const updateTransaction = async (
  id: string,
  updates: Partial<
    Pick<Transaction, 'type' | 'amount' | 'accountId' | 'toAccountId' | 'categoryId' | 'date' | 'note' | 'tags'>
  >
): Promise<void> => {
  await db.transaction('rw', [db.transactions, db.accounts, db.categories], async () => {
    const existing = await db.transactions.get(id);
    if (!existing) throw new Error('Transaction not found');

    const merged: Transaction = {
      ...existing,
      ...updates,
      updatedAt: Date.now()
    };
    merged.yearMonth = merged.date.slice(0, 7);
    merged.note = merged.note.trim();
    merged.tags = normalizeTags(merged.tags);

    if (merged.type === 'transfer') {
      merged.categoryId = TRANSFER_CATEGORY_ID;
    } else {
      delete merged.toAccountId;
      if (merged.categoryId === TRANSFER_CATEGORY_ID) {
        throw new Error('Select a real category for this entry');
      }
    }

    await assertTransactionIntegrity(merged);
    await db.transactions.put(merged);
  });
};

/** Deletes a transaction and cascades to every attachment it owns. */
export const deleteTransaction = async (id: string): Promise<void> => {
  await db.transaction('rw', [db.transactions, db.receipts], async () => {
    const existing = await db.transactions.get(id);
    if (!existing) throw new Error('Transaction not found');

    await db.receipts.where('transactionId').equals(id).delete();
    await db.transactions.delete(id);
  });
};

/**
 * Human-readable reason the base currency is frozen, or `null` when editable.
 *
 * Stored amounts are minor units of the base currency's exponent, and nothing is
 * ever converted (no network, no FX rates). Switching the currency therefore has
 * to be impossible as soon as any persisted value exists:
 *  - transactions hold minor-unit amounts,
 *  - budgets hold minor-unit envelopes,
 *  - accounts hold an opening balance whose exponent would silently change
 *    (1000 minor units of a 2-digit currency is 10.00, of a 0-digit currency it
 *    is 1000).
 */
export const getBaseCurrencyLockReason = async (): Promise<string | null> => {
  const [transactionCount, budgetCount, accounts] = await Promise.all([
    db.transactions.count(),
    db.budgets.count(),
    db.accounts.toArray()
  ]);

  if (transactionCount > 0) {
    return 'Base currency is locked because the ledger already contains transactions.';
  }
  if (budgetCount > 0) {
    return 'Base currency is locked because monthly budgets are already denominated in it.';
  }
  if (accounts.some((account) => account.initialBalance !== 0)) {
    return 'Base currency is locked because accounts hold non-zero opening balances. Reset every balance to zero first.';
  }

  return null;
};

/**
 * Switches the single base currency. Only possible on a pristine ledger,
 * because stored minor units are not converted (no network, no FX rates).
 */
export const changeBaseCurrency = async (currency: string): Promise<void> => {
  const code = currency.trim().toUpperCase();
  if (!isSupportedCurrency(code)) {
    throw new Error(`Unsupported currency code: ${currency}`);
  }

  await db.transaction('rw', [db.settings, db.accounts, db.transactions, db.budgets], async () => {
    const lockReason = await getBaseCurrencyLockReason();
    if (lockReason) throw new Error(lockReason);

    const timestamp = Date.now();
    const updated = await db.settings.update(SETTINGS_RECORD_ID, {
      baseCurrency: code,
      updatedAt: timestamp
    });
    if (updated === 0) throw new Error('Settings record is missing — relaunch the app');

    await db.accounts.toCollection().modify((account) => {
      account.currency = code;
      account.updatedAt = timestamp;
    });
  });
};

const nextCategorySortOrder = async (type: Category['type']): Promise<number> => {
  const siblings = await db.categories.where('type').equals(type).toArray();
  return siblings.reduce((max, category) => Math.max(max, category.sortOrder), 0) + 1;
};

/** Creates a user category, rejecting empty, duplicate and reserved payloads. */
export const createCategory = async (input: NewCategoryDTO): Promise<string> => {
  const validation = validateCategoryInput({
    name: input.name,
    type: input.type,
    icon: input.icon,
    colorHex: input.colorHex
  });
  const payload = validation.data;
  if (!validation.isValid || !payload) {
    throw new Error(firstErrorMessage(validation.errors, 'Category is invalid'));
  }

  return db.transaction('rw', db.categories, async () => {
    const duplicate = await db.categories
      .filter(
        (category) =>
          category.type === payload.type &&
          !category.isArchived &&
          category.name.trim().toLowerCase() === payload.name.toLowerCase()
      )
      .first();
    if (duplicate) throw new Error(`"${payload.name}" already exists in this group`);

    const timestamp = Date.now();
    const sortOrder = input.sortOrder > 0 ? input.sortOrder : await nextCategorySortOrder(payload.type);
    const id = generateUUID();

    await db.categories.add({
      id,
      name: payload.name,
      type: payload.type,
      icon: payload.icon,
      colorHex: payload.colorHex,
      isSystem: false,
      isHidden: false,
      sortOrder,
      isArchived: false,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    return id;
  });
};

/** Patches a user category; system categories keep their identity and type. */
export const updateCategory = async (
  id: string,
  updates: Partial<Pick<Category, 'name' | 'icon' | 'colorHex' | 'isHidden' | 'isArchived' | 'sortOrder'>>
): Promise<void> => {
  await db.transaction('rw', db.categories, async () => {
    const existing = await db.categories.get(id);
    if (!existing) throw new Error('Category not found');

    if (existing.isSystem && (updates.name !== undefined || updates.icon !== undefined)) {
      throw new Error('System categories cannot be renamed or re-iconed');
    }

    if (updates.name !== undefined) {
      const name = updates.name.trim();
      if (name.length === 0) throw new Error('Category name is required');

      const duplicate = await db.categories
        .filter(
          (category) =>
            category.id !== id &&
            category.type === existing.type &&
            !category.isArchived &&
            category.name.trim().toLowerCase() === name.toLowerCase()
        )
        .first();
      if (duplicate) throw new Error(`"${name}" already exists in this group`);

      updates = { ...updates, name };
    }

    if (updates.colorHex !== undefined && !HEX_COLOR_PATTERN.test(updates.colorHex)) {
      throw new Error('Color must be a six-digit hex value such as #10B981');
    }

    await db.categories.update(id, { ...updates, updatedAt: Date.now() });
  });
};

/** Deletes a user category together with its envelopes, or explains why not. */
export const deleteCategory = async (id: string): Promise<void> => {
  await db.transaction('rw', [db.categories, db.transactions, db.budgets], async () => {
    const category = await db.categories.get(id);
    if (!category) throw new Error('Category not found');
    if (category.isSystem) throw new Error('System categories cannot be deleted');

    // Deleting the final usable category of a type would leave the entry form
    // with nothing to post to, so the group must always keep one survivor.
    const remainingActive = await db.categories
      .filter((c) => c.type === category.type && !c.isArchived && !c.isHidden && c.id !== id)
      .count();
    if (remainingActive < 1) {
      throw new Error(`At least one active ${category.type} category is required`);
    }

    const usageCount = await db.transactions.where('categoryId').equals(id).count();
    if (usageCount > 0) {
      throw new Error(`Category is used by ${usageCount} transaction(s) — archive it instead`);
    }

    await db.budgets.where('categoryId').equals(id).delete();
    await db.categories.delete(id);
  });
};

const assertAccountDto = (input: NewAccountDTO, baseCurrency: string): void => {
  if (input.name.trim().length === 0) throw new Error('Account name is required');
  if (!isSupportedCurrency(input.currency)) {
    throw new Error(`Unsupported currency code: ${input.currency}`);
  }
  if (input.currency.toUpperCase() !== baseCurrency.toUpperCase()) {
    throw new Error(`Accounts must use the base currency (${baseCurrency})`);
  }
  if (!Number.isSafeInteger(input.initialBalance)) {
    throw new Error('Opening balance must be a whole number of minor units');
  }
  if (!HEX_COLOR_PATTERN.test(input.colorHex)) {
    throw new Error('Color must be a six-digit hex value such as #10B981');
  }
};

/** Creates an account denominated in the locked base currency. */
export const createAccount = async (input: NewAccountDTO): Promise<string> => {
  return db.transaction('rw', [db.accounts, db.settings], async () => {
    const settings = await db.settings.get(SETTINGS_RECORD_ID);
    const baseCurrency = settings?.baseCurrency ?? input.currency;
    assertAccountDto(input, baseCurrency);

    const name = input.name.trim();
    const duplicate = await db.accounts
      .filter((account) => !account.isArchived && account.name.trim().toLowerCase() === name.toLowerCase())
      .first();
    if (duplicate) throw new Error(`An account named "${name}" already exists`);

    const timestamp = Date.now();
    const id = generateUUID();

    await db.accounts.add({
      ...input,
      id,
      name,
      currency: baseCurrency.toUpperCase(),
      colorHex: input.colorHex.toUpperCase(),
      sortOrder: input.sortOrder > 0 ? input.sortOrder : (await db.accounts.count()) + 1,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    return id;
  });
};

/** Patches an account; its currency always follows the base currency. */
export const updateAccount = async (
  id: string,
  updates: Partial<Pick<Account, 'name' | 'type' | 'initialBalance' | 'colorHex' | 'sortOrder' | 'isArchived'>>
): Promise<void> => {
  await db.transaction('rw', db.accounts, async () => {
    const existing = await db.accounts.get(id);
    if (!existing) throw new Error('Account not found');

    const next: typeof updates = { ...updates };

    if (next.name !== undefined) {
      const name = next.name.trim();
      if (name.length === 0) throw new Error('Account name is required');

      const duplicate = await db.accounts
        .filter(
          (account) =>
            account.id !== id &&
            !account.isArchived &&
            account.name.trim().toLowerCase() === name.toLowerCase()
        )
        .first();
      if (duplicate) throw new Error(`An account named "${name}" already exists`);

      next.name = name;
    }

    if (next.initialBalance !== undefined && !Number.isSafeInteger(next.initialBalance)) {
      throw new Error('Opening balance must be a whole number of minor units');
    }

    if (next.colorHex !== undefined && !HEX_COLOR_PATTERN.test(next.colorHex)) {
      throw new Error('Color must be a six-digit hex value such as #10B981');
    }

    await db.accounts.update(id, { ...next, updatedAt: Date.now() });
  });
};

/** Archives (or restores) an account without destroying its history. */
export const setAccountArchived = async (id: string, isArchived: boolean): Promise<void> => {
  await db.transaction('rw', db.accounts, async () => {
    const existing = await db.accounts.get(id);
    if (!existing) throw new Error('Account not found');

    if (isArchived && !existing.isArchived) {
      const activeCount = await db.accounts.filter((account) => !account.isArchived).count();
      if (activeCount <= 1) throw new Error('At least one active account is required');
    }

    await db.accounts.update(id, { isArchived, updatedAt: Date.now() });
  });
};

export const archiveAccount = (id: string): Promise<void> => setAccountArchived(id, true);

/** Hard-deletes an account only when it has never been used by the ledger. */
export const deleteAccount = async (id: string): Promise<void> => {
  await db.transaction('rw', [db.accounts, db.transactions], async () => {
    const existing = await db.accounts.get(id);
    if (!existing) throw new Error('Account not found');

    // An account is the only anchor a new entry can be posted against, so the
    // ledger must never be left without one. Mirrors the `setAccountArchived` guard.
    if (!existing.isArchived) {
      const activeCount = await db.accounts.filter((account) => !account.isArchived).count();
      if (activeCount <= 1) throw new Error('At least one active account is required');
    }

    const used = await db.transactions.where('accountId').equals(id).or('toAccountId').equals(id).count();
    if (used > 0) throw new Error('Account has transactions — archive it instead');

    await db.accounts.delete(id);
  });
};

/** Creates or updates the monthly envelope for one expense category. */
export const upsertBudget = async (input: NewBudgetDTO): Promise<string> =>
  db.transaction('rw', [db.budgets, db.categories], async () => {
    const category = await db.categories.get(input.categoryId);
    if (!category || category.type !== 'expense' || category.isHidden) {
      throw new Error('Budgets apply to visible expense categories only');
    }
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
      throw new Error('Budget amount must be a positive whole number of minor units');
    }
    if (!/^\d{4}-\d{2}$/.test(input.yearMonth)) {
      throw new Error('Budget month must use the YYYY-MM format');
    }

    const existing = await db.budgets
      .where('[categoryId+yearMonth]')
      .equals([input.categoryId, input.yearMonth])
      .first();

    const timestamp = Date.now();

    if (existing) {
      await db.budgets.update(existing.id, { amount: input.amount, updatedAt: timestamp });
      return existing.id;
    }

    const id = generateUUID();
    await db.budgets.add({ ...input, period: 'monthly', id, createdAt: timestamp, updatedAt: timestamp });
    return id;
  });

/** Removes a monthly envelope. */
export const deleteBudget = async (id: string): Promise<void> => {
  await db.transaction('rw', db.budgets, async () => {
    const existing = await db.budgets.get(id);
    if (!existing) throw new Error('Budget not found');
    await db.budgets.delete(id);
  });
};

/** Envelopes of a month bucket, joined with their category for display. */
export const listBudgetsForMonth = async (
  yearMonth: string
): Promise<Array<{ budget: Budget; category: Category | undefined }>> => {
  const budgets = await db.budgets.where('yearMonth').equals(yearMonth).toArray();
  const categories = await db.categories.bulkGet(budgets.map((budget) => budget.categoryId));

  return budgets.map((budget, index) => ({ budget, category: categories[index] }));
};
