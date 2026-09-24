/**
 * Application settings store.
 *
 * Owns the settings singleton persisted in IndexedDB plus the boot lifecycle of
 * the local storage engine. Records are written with `toRaw` so Vue's reactive
 * proxy is never handed to the structured clone algorithm used by IndexedDB,
 * which would abort the write.
 */

import { defineStore } from 'pinia';
import { toRaw } from 'vue';
import {
  db,
  initializeDatabaseDefaults,
  requestPersistentStorage,
  SETTINGS_RECORD_ID
} from '@/services/db';
import { changeBaseCurrency, getBaseCurrencyLockReason } from '@/services/ledgerService';
import { markBackupExported } from '@/services/dataTransfer';
import type { ServiceResult, ThemeMode, UserSettings } from '@/types/models';

export type BootstrapStatus = 'pending' | 'initializing' | 'ready' | 'failed';

interface SettingsState {
  settings: UserSettings;
  status: BootstrapStatus;
  error: string | null;
  isSaving: boolean;
  currencyLockReason: string | null;
  isStoragePersisted: boolean;
}

const DARK_THEME_COLOR = '#0F172A';
const LIGHT_THEME_COLOR = '#F8FAFC';

const fallbackSettings = (): UserSettings => ({
  id: SETTINGS_RECORD_ID,
  baseCurrency: 'USD',
  theme: 'system',
  hapticEnabled: true,
  firstDayOfWeek: 1,
  updatedAt: 0
});

const systemPrefersDark = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

const resolveIsDark = (theme: ThemeMode): boolean => theme === 'dark' || (theme === 'system' && systemPrefersDark());

let isSystemThemeBound = false;

export const useSettingsStore = defineStore('settings', {
  state: (): SettingsState => ({
    settings: fallbackSettings(),
    status: 'pending',
    error: null,
    isSaving: false,
    currencyLockReason: null,
    isStoragePersisted: false
  }),

  getters: {
    isReady: (state): boolean => state.status === 'ready',
    isInitializing: (state): boolean => state.status === 'initializing' || state.status === 'pending',
    hasFailed: (state): boolean => state.status === 'failed',
    baseCurrency: (state): string => state.settings.baseCurrency,
    theme: (state): ThemeMode => state.settings.theme,
    hapticEnabled: (state): boolean => state.settings.hapticEnabled,
    firstDayOfWeek: (state): 0 | 1 => state.settings.firstDayOfWeek,
    lastExportTimestamp: (state): number | undefined => state.settings.lastExportTimestamp,
    /** `true` when the base currency can no longer be switched. */
    isBaseCurrencyLocked: (state): boolean => state.currencyLockReason !== null,
    /** Days since the last successful export, or `null` when never exported. */
    daysSinceLastExport: (state): number | null => {
      const timestamp = state.settings.lastExportTimestamp;
      if (!timestamp) return null;
      return Math.floor((Date.now() - timestamp) / 86_400_000);
    }
  },

  actions: {
    /** Seeds the database if needed, then loads settings and applies the theme. */
    async initialize(): Promise<void> {
      if (this.status === 'initializing') return;

      this.status = 'initializing';
      this.error = null;

      try {
        await initializeDatabaseDefaults();

        const record = await db.settings.get(SETTINGS_RECORD_ID);
        if (!record) throw new Error('The settings record could not be created in local storage');

        this.settings = record;
        this.applyTheme();
        this.bindSystemThemeListener();
        this.isStoragePersisted = await requestPersistentStorage();
        this.currencyLockReason = await getBaseCurrencyLockReason();
        this.status = 'ready';
      } catch (error: unknown) {
        this.status = 'failed';
        this.error =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : 'Local storage (IndexedDB) is unavailable in this browser session';
      }
    },

    /** Retries a failed boot without a page reload. */
    async retryInitialization(): Promise<void> {
      if (this.status === 'failed' || this.status === 'pending') {
        await this.initialize();
      }
    },

    /** Mirrors the active theme into the document root and the PWA chrome. */
    applyTheme(): void {
      if (typeof document === 'undefined') return;

      const isDark = resolveIsDark(this.settings.theme);
      const root = document.documentElement;

      root.classList.toggle('dark', isDark);
      root.classList.toggle('light', !isDark);
      root.style.colorScheme = isDark ? 'dark' : 'light';

      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', isDark ? DARK_THEME_COLOR : LIGHT_THEME_COLOR);
    },

    /** Re-applies the theme when the OS switches palette while on `system`. */
    bindSystemThemeListener(): void {
      if (isSystemThemeBound || typeof window === 'undefined') return;
      isSystemThemeBound = true;

      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (this.settings.theme === 'system') this.applyTheme();
      });
    },

    async reloadFromDatabase(): Promise<void> {
      const record = await db.settings.get(SETTINGS_RECORD_ID);
      if (!record) return;

      this.settings = record;
      this.applyTheme();
      this.currencyLockReason = await getBaseCurrencyLockReason();
    },

    /** Persists the current settings object as a raw, clone-safe record. */
    async persistSettings(): Promise<void> {
      const payload: UserSettings = { ...toRaw(this.settings), updatedAt: Date.now() };
      await db.settings.put(payload);
      this.settings = payload;
    },

    async setTheme(theme: ThemeMode): Promise<ServiceResult> {
      this.isSaving = true;
      try {
        this.settings = { ...this.settings, theme };
        this.applyTheme();
        await this.persistSettings();
        return { ok: true, message: `Theme set to ${theme}` };
      } catch (error: unknown) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : 'Unable to save the theme preference'
        };
      } finally {
        this.isSaving = false;
      }
    },

    async setHapticsEnabled(enabled: boolean): Promise<ServiceResult> {
      this.isSaving = true;
      try {
        this.settings = { ...this.settings, hapticEnabled: enabled };
        await this.persistSettings();
        return { ok: true, message: enabled ? 'Haptics enabled' : 'Haptics disabled' };
      } catch (error: unknown) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : 'Unable to save the haptics preference'
        };
      } finally {
        this.isSaving = false;
      }
    },

    async setFirstDayOfWeek(day: 0 | 1): Promise<ServiceResult> {
      this.isSaving = true;
      try {
        this.settings = { ...this.settings, firstDayOfWeek: day };
        await this.persistSettings();
        return { ok: true, message: day === 1 ? 'Week starts on Monday' : 'Week starts on Sunday' };
      } catch (error: unknown) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : 'Unable to save the calendar preference'
        };
      } finally {
        this.isSaving = false;
      }
    },

    /** Switches the base currency; refuses once the ledger holds any value. */
    async setBaseCurrency(currency: string): Promise<ServiceResult> {
      this.isSaving = true;
      try {
        await changeBaseCurrency(currency);
        await this.reloadFromDatabase();
        return { ok: true, message: `Base currency switched to ${currency.toUpperCase()}` };
      } catch (error: unknown) {
        this.currencyLockReason = await getBaseCurrencyLockReason().catch(() => this.currencyLockReason);
        return {
          ok: false,
          message: error instanceof Error ? error.message : 'Unable to change the base currency'
        };
      } finally {
        this.isSaving = false;
      }
    },

    /** Stamps the export time shown by the stale-backup reminder. */
    async markExported(): Promise<void> {
      try {
        await markBackupExported();
        await this.reloadFromDatabase();
      } catch {
        // A failed timestamp write must never invalidate a successful export.
      }
    },

    async refreshCurrencyLock(): Promise<void> {
      this.currencyLockReason = await getBaseCurrencyLockReason();
    }
  }
});
