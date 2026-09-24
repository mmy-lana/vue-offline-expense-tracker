/**
 * Pure input validation.
 *
 * Validators are the single source of truth for both the UI (inline field
 * errors) and the persistence layer (services reject anything that does not
 * validate), so a malformed record can never reach IndexedDB.
 */

import { TRANSFER_CATEGORY_ID, type CategoryType, type TransactionType } from '@/types/models';
import { isSupportedCurrency, parseMajorToMinor } from '@/utils/money';
import { isValidCalendarDayString } from '@/utils/date';

export interface ValidationResult<T> {
  isValid: boolean;
  data?: T;
  errors: Record<string, string>;
}

const MAX_AMOUNT_DIGITS = 12;
const MAX_NOTE_LENGTH = 120;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 24;
const MAX_NAME_LENGTH = 40;
const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/**
 * Parses a signed major-unit string (credit accounts legitimately start
 * negative) into integer minor units.
 */
export const parseSignedMajorToMinor = (
  majorString: string,
  currency: string
): { isValid: boolean; minor: number } => {
  const trimmed = majorString.trim();
  const isNegative = /^-/.test(trimmed);
  const unsigned = isNegative ? trimmed.slice(1) : trimmed;

  const parsed = parseMajorToMinor(unsigned, currency);
  if (!parsed.isValid) return { isValid: false, minor: 0 };

  return { isValid: true, minor: isNegative ? -parsed.minor : parsed.minor };
};

/**
 * Canonical tag normalisation: trimmed, lower-cased, de-duplicated, capped.
 * Exported so the ledger service persists exactly what the UI validated.
 */
export const normalizeTags = (tags: readonly string[] | undefined): string[] => {
  if (!tags) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const raw of tags) {
    const tag = raw.trim().toLowerCase().slice(0, MAX_TAG_LENGTH);
    if (tag.length === 0 || seen.has(tag)) continue;

    seen.add(tag);
    normalized.push(tag);
    if (normalized.length >= MAX_TAGS) break;
  }

  return normalized;
};

/** Validates and normalises the full payload of a new or edited transaction. */
export const validateTransactionInput = (input: {
  type: TransactionType;
  amountMajor: string;
  currency: string;
  accountId: string;
  categoryId: string;
  toAccountId?: string;
  date: string;
  note?: string;
  tags?: readonly string[];
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

  if (!isSupportedCurrency(input.currency)) {
    errors.currency = 'A supported ISO 4217 currency is required';
  }

  const digitsOnly = input.amountMajor.trim().replace('.', '');
  if (digitsOnly.length > MAX_AMOUNT_DIGITS) {
    errors.amount = `Amount cannot exceed ${MAX_AMOUNT_DIGITS} digits`;
  }

  const { isValid, minor } = parseMajorToMinor(input.amountMajor, input.currency);
  if (!isValid) {
    errors.amount = 'Enter a valid amount using digits and a single decimal separator';
  } else if (minor <= 0) {
    errors.amount = 'Amount must be greater than zero';
  } else if (!Number.isSafeInteger(minor)) {
    errors.amount = 'Amount is too large to store safely';
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
  } else if (!input.categoryId || input.categoryId.trim().length === 0) {
    errors.categoryId = 'Category selection is required';
  } else if (input.categoryId === TRANSFER_CATEGORY_ID) {
    errors.categoryId = 'Account Transfer cannot be used as a category';
  }

  if (!isValidCalendarDayString(input.date)) {
    errors.date = 'Date must be a real calendar date (YYYY-MM-DD)';
  }

  const note = input.note ? input.note.trim() : '';
  if (note.length > MAX_NOTE_LENGTH) {
    errors.note = `Note cannot exceed ${MAX_NOTE_LENGTH} characters`;
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
      categoryId: input.type === 'transfer' ? TRANSFER_CATEGORY_ID : input.categoryId,
      toAccountId: input.type === 'transfer' ? input.toAccountId : undefined,
      date: input.date,
      yearMonth: input.date.slice(0, 7),
      note,
      tags: normalizeTags(input.tags)
    }
  };
};

/** Validates a monthly envelope amount for a single expense category. */
export const validateBudgetInput = (input: {
  amountMajor: string;
  currency: string;
}): ValidationResult<{ amount: number }> => {
  const errors: Record<string, string> = {};

  if (!isSupportedCurrency(input.currency)) {
    errors.currency = 'A supported ISO 4217 currency is required';
  }

  const { isValid, minor } = parseMajorToMinor(input.amountMajor, input.currency);
  if (!isValid) {
    errors.amount = 'Enter a valid amount using digits and a single decimal separator';
  } else if (minor <= 0) {
    errors.amount = 'Budget must be greater than zero';
  } else if (!Number.isSafeInteger(minor)) {
    errors.amount = 'Budget is too large to store safely';
  }

  if (Object.keys(errors).length > 0) {
    return { isValid: false, errors };
  }

  return { isValid: true, errors: {}, data: { amount: minor } };
};

/** Validates a user-authored category. Transfer stays a system-only type. */
export const validateCategoryInput = (input: {
  name: string;
  type: CategoryType;
  icon: string;
  colorHex: string;
}): ValidationResult<{ name: string; type: CategoryType; icon: string; colorHex: string }> => {
  const errors: Record<string, string> = {};
  const name = input.name.trim();

  if (name.length === 0) {
    errors.name = 'Category name is required';
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.name = `Category name cannot exceed ${MAX_NAME_LENGTH} characters`;
  }

  if (input.type === 'transfer') {
    errors.type = 'Account Transfer is a system category and cannot be recreated';
  }

  if (!input.icon || input.icon.trim().length === 0) {
    errors.icon = 'An icon must be selected';
  }

  if (!HEX_COLOR_PATTERN.test(input.colorHex)) {
    errors.colorHex = 'Color must be a six-digit hex value such as #10B981';
  }

  if (Object.keys(errors).length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    errors: {},
    data: {
      name,
      type: input.type,
      icon: input.icon.trim(),
      colorHex: input.colorHex.toUpperCase()
    }
  };
};

/** Validates a user-authored account, including its signed opening balance. */
export const validateAccountInput = (input: {
  name: string;
  type: 'cash' | 'bank' | 'credit' | 'investment';
  initialBalanceMajor: string;
  currency: string;
  colorHex: string;
}): ValidationResult<{
  name: string;
  type: 'cash' | 'bank' | 'credit' | 'investment';
  initialBalance: number;
  currency: string;
  colorHex: string;
}> => {
  const errors: Record<string, string> = {};
  const name = input.name.trim();

  if (name.length === 0) {
    errors.name = 'Account name is required';
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.name = `Account name cannot exceed ${MAX_NAME_LENGTH} characters`;
  }

  if (!isSupportedCurrency(input.currency)) {
    errors.currency = 'A supported ISO 4217 currency is required';
  }

  const { isValid, minor } = parseSignedMajorToMinor(input.initialBalanceMajor, input.currency);
  if (!isValid) {
    errors.initialBalance = 'Enter a valid opening balance, for example 0 or -250.00';
  } else if (!Number.isSafeInteger(minor)) {
    errors.initialBalance = 'Opening balance is too large to store safely';
  }

  if (!HEX_COLOR_PATTERN.test(input.colorHex)) {
    errors.colorHex = 'Color must be a six-digit hex value such as #10B981';
  }

  if (Object.keys(errors).length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    errors: {},
    data: {
      name,
      type: input.type,
      initialBalance: minor,
      currency: input.currency.toUpperCase(),
      colorHex: input.colorHex.toUpperCase()
    }
  };
};
