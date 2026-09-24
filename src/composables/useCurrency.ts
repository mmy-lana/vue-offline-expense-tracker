/**
 * Currency presentation composable.
 *
 * Binds the pure minor-unit engine to the persisted base currency so views can
 * format and parse without threading the currency through every layer.
 */

import { computed, type ComputedRef } from 'vue';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  formatCurrency as formatCurrencyUtil,
  formatMinorToMajorString,
  getCurrencyFractionDigits,
  parseMajorToMinor as parseMajorToMinorUtil,
  splitMinorUnitsForDisplay
} from '@/utils/money';

export interface AmountDisplayParts {
  symbol: string;
  major: string;
  minor: string;
  isNegative: boolean;
}

export interface CurrencyApi {
  /** ISO 4217 code currently persisted in settings. */
  activeCurrency: ComputedRef<string>;
  /** Minor-unit digits of the active currency. */
  fractionDigits: ComputedRef<number>;
  formatCurrency: (minorUnits: number, customCurrency?: string) => string;
  /** Parsed minor units, or `0` when the string is not a valid amount. */
  parseMajorToMinor: (majorString: string, customCurrency?: string) => number;
  formatMinorToInputString: (minorUnits: number, customCurrency?: string) => string;
  splitForDisplay: (minorUnits: number, customCurrency?: string) => AmountDisplayParts;
}

export function useCurrency(): CurrencyApi {
  const settingsStore = useSettingsStore();

  const activeCurrency = computed(() => settingsStore.settings.baseCurrency);
  const fractionDigits = computed(() => getCurrencyFractionDigits(activeCurrency.value));

  const formatCurrency = (minorUnits: number, customCurrency?: string): string =>
    formatCurrencyUtil(minorUnits, customCurrency ?? activeCurrency.value);

  const parseMajorToMinor = (majorString: string, customCurrency?: string): number =>
    parseMajorToMinorUtil(majorString, customCurrency ?? activeCurrency.value).minor;

  const formatMinorToInputString = (minorUnits: number, customCurrency?: string): string =>
    formatMinorToMajorString(minorUnits, customCurrency ?? activeCurrency.value);

  const splitForDisplay = (minorUnits: number, customCurrency?: string): AmountDisplayParts =>
    splitMinorUnitsForDisplay(minorUnits, customCurrency ?? activeCurrency.value);

  return {
    activeCurrency,
    fractionDigits,
    formatCurrency,
    parseMajorToMinor,
    formatMinorToInputString,
    splitForDisplay
  };
}
