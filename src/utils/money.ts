/**
 * Currency + integer minor-unit engine.
 *
 * The whole application stores money as integers in the currency's minor unit.
 * These helpers are the only sanctioned bridge between user-typed major-unit
 * strings and stored minor units, and they never route a value through a
 * binary floating point division on the way in.
 */

const fractionDigitsCache = new Map<string, number>();
const formatterCache = new Map<string, Intl.NumberFormat>();
/** Compiled amount patterns, keyed by minor-unit digit count (never by currency). */
const amountPatternCache = new Map<number, RegExp>();

const amountPattern = (digits: number): RegExp => {
  const cached = amountPatternCache.get(digits);
  if (cached !== undefined) return cached;

  const created = digits === 0 ? /^\d+$/ : new RegExp(`^\\d+(\\.\\d{0,${digits}})?$`);
  amountPatternCache.set(digits, created);
  return created;
};

const FALLBACK_FRACTION_DIGITS = 2;

/**
 * Number of minor-unit digits for an ISO 4217 currency code (0 for JPY, 2 for
 * USD/EUR, 3 for KWD/BHD). Unknown or malformed codes fall back to 2.
 */
export const getCurrencyFractionDigits = (currency: string): number => {
  const cached = fractionDigitsCache.get(currency);
  if (cached !== undefined) return cached;

  try {
    const digits =
      new Intl.NumberFormat(undefined, { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? FALLBACK_FRACTION_DIGITS;
    const safeDigits = Number.isInteger(digits) && digits >= 0 ? digits : FALLBACK_FRACTION_DIGITS;
    fractionDigitsCache.set(currency, safeDigits);
    return safeDigits;
  } catch {
    fractionDigitsCache.set(currency, FALLBACK_FRACTION_DIGITS);
    return FALLBACK_FRACTION_DIGITS;
  }
};

/**
 * ISO 4217 whitelist resolved from the runtime's own ICU data.
 *
 * `Intl.NumberFormat` happily formats any well-formed three-letter code — even
 * `ZZZ` — so a syntactic check alone would let unusable currencies through.
 * Returns `null` when `Intl.supportedValuesOf` is unavailable.
 */
let supportedCurrencyCache: Set<string> | null = null;

const getSupportedCurrencySet = (): Set<string> | null => {
  if (supportedCurrencyCache) return supportedCurrencyCache;

  const supportedValuesOf = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
    .supportedValuesOf;
  if (typeof supportedValuesOf !== 'function') return null;

  try {
    supportedCurrencyCache = new Set(supportedValuesOf('currency').map((code) => code.toUpperCase()));
    return supportedCurrencyCache;
  } catch {
    return null;
  }
};

/** True when the runtime's ICU data recognises the code as a real currency. */
export const isSupportedCurrency = (currency: string): boolean => {
  const code = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return false;

  const supported = getSupportedCurrencySet();
  if (supported) return supported.has(code);

  try {
    const resolved = new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).resolvedOptions()
      .currency;
    return resolved === code;
  } catch {
    return false;
  }
};

/** Memoised locale-aware currency formatter for a currency code. */
export const getCurrencyFormatter = (currency: string): Intl.NumberFormat => {
  const cached = formatterCache.get(currency);
  if (cached !== undefined) return cached;

  const digits = getCurrencyFractionDigits(currency);
  const locale = typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US';
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
  formatterCache.set(currency, formatter);
  return formatter;
};

/**
 * Renders stored minor units as a localised currency string (display only).
 *
 * The major-unit value is derived by string partitioning (see
 * {@link formatMinorToMajorString}) rather than by dividing the integer by a
 * power of ten, so the value handed to `Intl` is always the exact decimal the
 * user should see — no binary-float residue such as 10.049999999999999.
 */
export const formatCurrency = (minorUnits: number, currency: string): string => {
  if (!Number.isFinite(minorUnits)) return getCurrencyFormatter(currency).format(0);
  const majorString = formatMinorToMajorString(minorUnits, currency);
  return getCurrencyFormatter(currency).format(Number(majorString));
};

/**
 * Parses a user-typed major-unit string into safe integer minor units.
 *
 * Accepts an optional trailing decimal separator (`"12."`) so the on-screen
 * keypad stays responsive mid-typing. Rejects signs, grouping separators,
 * scientific notation, over-precise fractions and anything outside the safe
 * integer range.
 */
export const parseMajorToMinor = (
  majorString: string,
  currency: string
): { isValid: boolean; minor: number } => {
  const trimmed = majorString.trim();
  const digits = getCurrencyFractionDigits(currency);

  if (!amountPattern(digits).test(trimmed)) {
    return { isValid: false, minor: 0 };
  }

  const [intPart = '0', fracPart = ''] = trimmed.split('.');
  const paddedFrac = fracPart.padEnd(digits, '0').slice(0, digits);
  const combined = digits === 0 ? intPart : `${intPart}${paddedFrac}`;

  const minor = Number.parseInt(combined, 10);
  if (Number.isNaN(minor) || !Number.isSafeInteger(minor)) {
    return { isValid: false, minor: 0 };
  }

  return { isValid: true, minor };
};

/**
 * Inverse of {@link parseMajorToMinor} implemented with string slicing so no
 * floating point rounding can leak into an editable value.
 */
export const formatMinorToMajorString = (minorUnits: number, currency: string): string => {
  const digits = getCurrencyFractionDigits(currency);
  const safeUnits = Number.isFinite(minorUnits) ? Math.trunc(minorUnits) : 0;

  if (digits === 0) return safeUnits.toString();

  const isNegative = safeUnits < 0;
  const absUnits = Math.abs(safeUnits).toString().padStart(digits + 1, '0');
  const intPart = absUnits.slice(0, -digits) || '0';
  const fracPart = absUnits.slice(-digits);

  return `${isNegative ? '-' : ''}${intPart}.${fracPart}`;
};

/**
 * Splits minor units into the three typographic fragments used by
 * `AmountDisplay`: currency symbol, whole major units, and the decimal tail.
 */
export const splitMinorUnitsForDisplay = (
  minorUnits: number,
  currency: string
): { symbol: string; major: string; minor: string; isNegative: boolean } => {
  const digits = getCurrencyFractionDigits(currency);
  const formatter = getCurrencyFormatter(currency);
  const symbol =
    formatter.formatToParts(0).find((part) => part.type === 'currency')?.value ?? currency;

  const majorString = formatMinorToMajorString(minorUnits, currency);
  const isNegative = majorString.startsWith('-');
  const unsigned = isNegative ? majorString.slice(1) : majorString;
  const [major = '0', minor = ''] = unsigned.split('.');

  return {
    symbol,
    major,
    minor: minor.slice(0, digits),
    isNegative
  };
};
