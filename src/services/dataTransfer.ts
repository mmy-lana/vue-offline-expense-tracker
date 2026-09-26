/**
 * Data sovereignty engine: zero-loss JSON backup/restore and spreadsheet export.
 *
 * A backup must survive a full round trip, including binary receipt blobs, so
 * attachments are embedded as base64 inside a versioned, self-describing
 * archive. Restores validate the entire payload before a single record is
 * written, and CSV exports neutralise spreadsheet formula injection.
 */

import { db } from '@/services/db';
import { isSupportedCurrency, formatMinorToMajorString } from '@/utils/money';
import { isValidCalendarDayString } from '@/utils/date';
import { TRANSFER_CATEGORY_ID } from '@/types/models';
import type {
  Account,
  Budget,
  Category,
  ReceiptAttachment,
  Transaction,
  UserSettings
} from '@/types/models';

export const BACKUP_APP_ID = 'vue-offline-expense-tracker';
export const BACKUP_VERSION = 1;

/**
 * Hard ingestion limits.
 *
 * A restore reads a file the user picked, which may be corrupt or hostile; every
 * limit is enforced *before* the payload is parsed or decoded so a 2GB archive or
 * a zip-bomb of base64 attachments can never exhaust the heap.
 */
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
export const MAX_RECEIPT_COUNT = 500;
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

export const ALLOWED_RECEIPT_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf'
]);

export const sanitizeAttachmentFileName = (name: string | undefined): string => {
  const base = String(name ?? '')
    .replace(/^.*[/\\]/, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, '');
  return base.slice(0, 100) || 'attachment';
};

const MEGABYTE = 1024 * 1024;

/** Estimated decoded size of a base64 payload, without decoding it. */
const estimateBase64Bytes = (base64: string): number => Math.ceil((base64.length * 3) / 4);

export type SerializedReceipt = Omit<ReceiptAttachment, 'dataBlob'> & { dataBase64: string };

export interface ExportArchiveV1 {
  version: 1;
  exportedAt: string;
  metadata: {
    app: typeof BACKUP_APP_ID;
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

export type ArchiveValidation =
  | { ok: true; archive: ExportArchiveV1 }
  | { ok: false; error: string };

const fail = (error: string): ArchiveValidation => ({ ok: false, error });

/** Base64 encoder that never risks an argument-spread stack overflow. */
const bytesToBase64 = (bytes: Uint8Array): string => {
  const CHUNK_SIZE = 0x8000;
  let binary = '';

  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK_SIZE));
  }

  return btoa(binary);
};

/** Blob -> base64 without FileReader, so the engine is runtime agnostic. */
const blobToBase64 = async (blob: Blob): Promise<string> =>
  bytesToBase64(new Uint8Array(await blob.arrayBuffer()));

/** Decodes base64 without `fetch`, so strict CSP `connect-src` rules cannot block it. */
const base64ToBlob = (base64: string, mimeType: string): Blob => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
};

/** Serialises the whole database into a human-readable JSON archive. */
export const generateBackupJSON = async (): Promise<string> => {
  const [settings, accounts, categories, budgets, transactions, rawReceipts] = await Promise.all([
    db.settings.toArray(),
    db.accounts.toArray(),
    db.categories.toArray(),
    db.budgets.toArray(),
    db.transactions.toArray(),
    db.receipts.toArray()
  ]);

  const receipts: SerializedReceipt[] = await Promise.all(
    rawReceipts.map(async ({ dataBlob, ...rest }) => ({
      ...rest,
      dataBase64: await blobToBase64(dataBlob)
    }))
  );

  const archive: ExportArchiveV1 = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    metadata: {
      app: BACKUP_APP_ID,
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

/** Records the successful manual export used by the stale-backup reminder. */
export const markBackupExported = async (): Promise<void> => {
  await db.settings.update('user_settings', { lastExportTimestamp: Date.now() });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const hasUniqueIds = (records: ReadonlyArray<{ id: string }>): boolean =>
  new Set(records.map((record) => record.id)).size === records.length;

/**
 * Full schema validation of a parsed archive. Any structural, referential,
 * monetary or calendar violation is reported before the database is touched.
 */
export const validateArchive = (raw: unknown): ArchiveValidation => {
  if (!isRecord(raw) || raw.version !== BACKUP_VERSION) {
    return fail('Not a valid backup file: unsupported archive version');
  }
  if (!isRecord(raw.metadata) || raw.metadata.app !== BACKUP_APP_ID) {
    return fail('Not a valid backup file: unrecognised application identifier');
  }
  if (!isRecord(raw.payload)) {
    return fail('Malformed payload');
  }

  const payload = raw.payload;
  const settings = payload.settings;
  const accounts = payload.accounts;
  const categories = payload.categories;
  const budgets = payload.budgets;
  const transactions = payload.transactions;
  const receipts = payload.receipts ?? [];

  if (![settings, accounts, categories, budgets, transactions, receipts].every(Array.isArray)) {
    return fail('Malformed payload: expected arrays for every collection');
  }

  const settingsRecords = settings as UserSettings[];
  const accountRecords = accounts as Account[];
  const categoryRecords = categories as Category[];
  const budgetRecords = budgets as Budget[];
  const transactionRecords = transactions as Transaction[];
  const receiptRecords = receipts as SerializedReceipt[];

  // Size gates run before any structural validation: the cheapest checks on the
  // largest payload come first.
  if (receiptRecords.length > MAX_RECEIPT_COUNT) {
    return fail(`Backup exceeds the maximum of ${MAX_RECEIPT_COUNT} receipt attachments`);
  }

  for (const receipt of receiptRecords) {
    if (typeof receipt.dataBase64 !== 'string' || receipt.dataBase64.length === 0) {
      return fail('A receipt attachment is empty or malformed');
    }
    if (estimateBase64Bytes(receipt.dataBase64) > MAX_RECEIPT_BYTES) {
      return fail(
        `Receipt "${receipt.fileName || 'unknown'}" exceeds the ${MAX_RECEIPT_BYTES / MEGABYTE}MB attachment limit`
      );
    }
    if (!ALLOWED_RECEIPT_MIME_TYPES.has(String(receipt.mimeType ?? '').toLowerCase())) {
      return fail(
        `Receipt "${receipt.fileName || 'unknown'}" has an unsupported or unsafe type: ${receipt.mimeType}`
      );
    }
  }

  if (settingsRecords.length !== 1) return fail('Settings record missing');
  const settingsRecord = settingsRecords[0];
  if (!settingsRecord || settingsRecord.id !== 'user_settings') return fail('Settings record missing');
  if (!isSupportedCurrency(settingsRecord.baseCurrency)) {
    return fail('Settings record has an unsupported base currency');
  }
  if (!['light', 'dark', 'system'].includes(settingsRecord.theme)) {
    return fail('Settings record has an invalid theme');
  }

  if (!hasUniqueIds(accountRecords)) return fail('Duplicate account identifiers found');
  if (!hasUniqueIds(categoryRecords)) return fail('Duplicate category identifiers found');
  if (!hasUniqueIds(transactionRecords)) return fail('Duplicate transaction identifiers found');
  if (!hasUniqueIds(receiptRecords)) return fail('Duplicate receipt identifiers found');

  if (accountRecords.some((account) => account.currency !== settingsRecord.baseCurrency)) {
    return fail('Accounts must use the base currency');
  }
  if (accountRecords.some((account) => !Number.isSafeInteger(account.initialBalance))) {
    return fail('An account has an invalid opening balance');
  }
  if (categoryRecords.some((category) => !category.name || category.name.trim().length === 0)) {
    return fail('A category is missing its name');
  }

  const accountIds = new Set(accountRecords.map((account) => account.id));
  const categoryMap = new Map(categoryRecords.map((category) => [category.id, category]));
  // Retained for the budget pass below, which only needs membership.
  const categoryIds = new Set(categoryMap.keys());
  const transactionIds = new Set(transactionRecords.map((transaction) => transaction.id));

  if (!categoryMap.has(TRANSFER_CATEGORY_ID)) return fail('The system transfer category is missing');

  for (const transaction of transactionRecords) {
    const category = categoryMap.get(transaction.categoryId);
    if (!accountIds.has(transaction.accountId) || !category) {
      return fail(`Transaction ${transaction.id} references a missing account or category`);
    }
    if (!Number.isSafeInteger(transaction.amount) || transaction.amount <= 0) {
      return fail(`Transaction ${transaction.id} has an invalid amount`);
    }
    if (!isValidCalendarDayString(transaction.date) || transaction.yearMonth !== transaction.date.slice(0, 7)) {
      return fail(`Transaction ${transaction.id} has an invalid date`);
    }
    if (!['expense', 'income', 'transfer'].includes(transaction.type)) {
      return fail(`Transaction ${transaction.id} has an unknown type`);
    }
    if (transaction.type === 'transfer') {
      if (!transaction.toAccountId || !accountIds.has(transaction.toAccountId)) {
        return fail(`Transfer ${transaction.id} has an invalid destination`);
      }
      if (transaction.toAccountId === transaction.accountId) {
        return fail(`Transfer ${transaction.id} targets its own source account`);
      }
      if (transaction.categoryId !== TRANSFER_CATEGORY_ID) {
        return fail(`Transfer ${transaction.id} is missing the system transfer category`);
      }
    } else {
      if (transaction.categoryId === TRANSFER_CATEGORY_ID) {
        return fail(`Non-transfer transaction ${transaction.id} cannot reference the transfer category`);
      }
      if (category.type !== transaction.type) {
        return fail(
          `Transaction ${transaction.id} (${transaction.type}) conflicts with category type (${category.type})`
        );
      }
    }
  }

  for (const budget of budgetRecords) {
    if (!categoryIds.has(budget.categoryId)) return fail('A budget references a missing category');
    if (!Number.isSafeInteger(budget.amount) || budget.amount <= 0) {
      return fail('A budget has an invalid amount');
    }
    if (!/^\d{4}-\d{2}$/.test(budget.yearMonth)) return fail('A budget has an invalid month');
  }

  for (const receipt of receiptRecords) {
    if (!transactionIds.has(receipt.transactionId)) return fail('A receipt references a missing transaction');
    if (typeof receipt.dataBase64 !== 'string' || receipt.dataBase64.length === 0) {
      return fail('A receipt attachment is empty');
    }
  }

  return { ok: true, archive: raw as unknown as ExportArchiveV1 };
};

/**
 * Validates then atomically replaces the local database with an archive in a
 * single transaction: a rejected backup leaves existing data untouched.
 */
export const restoreBackupJSON = async (json: string): Promise<{ success: boolean; message: string }> => {
  // Raw-size gate first: a file past the limit is rejected before `JSON.parse`
  // materialises it, so the heap never holds the attacker's structure.
  if (json.length > MAX_BACKUP_BYTES) {
    return {
      success: false,
      message: `Restore failed: the file exceeds the ${MAX_BACKUP_BYTES / MEGABYTE}MB backup limit`
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { success: false, message: 'Restore failed: the file is not valid JSON' };
  }

  const validation = validateArchive(parsed);
  if (!validation.ok) {
    return { success: false, message: `Restore failed: ${validation.error}` };
  }

  const { settings, accounts, categories, budgets, transactions, receipts } = validation.archive.payload;

  let rebuiltReceipts: ReceiptAttachment[];
  try {
    rebuiltReceipts = receipts.map(({ dataBase64, fileName, mimeType, ...rest }) => {
      const safeMime = String(mimeType || 'application/octet-stream').toLowerCase();
      return {
        ...rest,
        fileName: sanitizeAttachmentFileName(fileName),
        mimeType: safeMime,
        dataBlob: base64ToBlob(dataBase64, safeMime)
      };
    });
  } catch {
    return { success: false, message: 'Restore failed: an attachment could not be decoded' };
  }

  try {
    await db.transaction(
      'rw',
      [db.settings, db.accounts, db.categories, db.budgets, db.transactions, db.receipts],
      async () => {
        await Promise.all([
          db.settings.clear(),
          db.accounts.clear(),
          db.categories.clear(),
          db.budgets.clear(),
          db.transactions.clear(),
          db.receipts.clear()
        ]);

        await db.settings.bulkAdd(settings);
        await db.accounts.bulkAdd(accounts);
        await db.categories.bulkAdd(categories);
        await db.budgets.bulkAdd(budgets);
        await db.transactions.bulkAdd(transactions);
        if (rebuiltReceipts.length > 0) await db.receipts.bulkAdd(rebuiltReceipts);
      }
    );
  } catch (error: unknown) {
    return {
      success: false,
      message: `Restore failed: ${error instanceof Error ? error.message : 'database error'}`
    };
  }

  return {
    success: true,
    message: `Restored ${transactions.length} transaction(s), ${accounts.length} account(s) and ${categories.length} category(ies).`
  };
};

/**
 * Quotes a CSV field and neutralises spreadsheet formula injection.
 *
 * OWASP guidance is enforced on the *trimmed* value, because a leading space,
 * tab or carriage return does not stop Excel/Sheets from evaluating the cell —
 * `" =cmd|' /C calc'!A0"` still executes. Anything after trimming that begins
 * with a formula trigger is prefixed with a single quote so the cell is treated
 * as text.
 */
export const sanitizeForCSV = (input: string): string => {
  const normalized = String(input ?? '').trimStart();
  const escaped = normalized.replace(/"/g, '""');

  if (/^[=+\-@\t\r]/.test(escaped)) {
    return `"'${escaped}"`;
  }

  return `"${escaped}"`;
};

/**
 * Renders every transaction as a spreadsheet row with a UTF-8 BOM.
 *
 * Every cell is passed through {@link sanitizeForCSV}, not just the free-text
 * ones: identifiers, dates, type tags, amounts and currency codes are persisted
 * data, so a restored backup can still carry a hostile value in any column.
 */
export const generateTransactionsCSV = async (): Promise<string> => {
  const [transactions, categories, accounts] = await Promise.all([
    db.transactions.toArray(),
    db.categories.toArray(),
    db.accounts.toArray()
  ]);

  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const accountsById = new Map(accounts.map((account) => [account.id, account]));

  const headers = [
    'Transaction ID',
    'Date',
    'Month',
    'Type',
    'Amount',
    'Currency',
    'Account',
    'To Account',
    'Category',
    'Note',
    'Tags'
  ];

  const rows = transactions
    .slice()
    .sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1))
    .map((transaction) => {
      const account = accountsById.get(transaction.accountId);
      const currency = account?.currency ?? 'USD';
      const amountMajor = formatMinorToMajorString(transaction.amount, currency);
      const destination = transaction.toAccountId ? accountsById.get(transaction.toAccountId) : undefined;

      return [
        sanitizeForCSV(transaction.id),
        sanitizeForCSV(transaction.date),
        sanitizeForCSV(transaction.yearMonth),
        sanitizeForCSV(transaction.type),
        sanitizeForCSV(amountMajor),
        sanitizeForCSV(currency),
        sanitizeForCSV(account?.name ?? 'Unknown account'),
        sanitizeForCSV(destination?.name ?? ''),
        sanitizeForCSV(categoryNames.get(transaction.categoryId) ?? ''),
        sanitizeForCSV(transaction.note ?? ''),
        sanitizeForCSV(Array.isArray(transaction.tags) ? transaction.tags.filter(Boolean).join(', ') : '')
      ].join(',');
    });

  return [`\uFEFF${headers.join(',')}`, ...rows].join('\r\n');
};
