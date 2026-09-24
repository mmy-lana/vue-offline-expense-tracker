<script setup lang="ts">
/**
 * Settings: accounts, preferences and data sovereignty.
 *
 * Account editing happens in a sheet that mirrors the ledger service rules
 * (single base currency, whole minor units, at least one active account) and
 * surfaces every rejection verbatim, so a blocked action always explains itself.
 */

import { computed, ref } from 'vue';
import { useLedgerStore } from '@/stores/ledgerStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useCurrency } from '@/composables/useCurrency';
import { useHaptics } from '@/composables/useHaptics';
import AccountPicker from '@/components/molecules/AccountPicker.vue';
import BackupRestoreSection from '@/components/features/settings/BackupRestoreSection.vue';
import CurrencySelector from '@/components/features/settings/CurrencySelector.vue';
import PwaStatusCard from '@/components/features/settings/PwaStatusCard.vue';
import AmountDisplay from '@/components/molecules/AmountDisplay.vue';
import AppBadge from '@/components/ui/AppBadge.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppModalSheet from '@/components/ui/AppModalSheet.vue';
import AppSegmented from '@/components/ui/AppSegmented.vue';
import { formatMinorToMajorString } from '@/utils/money';
import { validateAccountInput } from '@/utils/validation';
import type { Account, AccountType, ThemeMode } from '@/types/models';

const ACCOUNT_COLORS = ['#10B981', '#3B82F6', '#EF4444', '#8B5CF6', '#F59E0B', '#0D9488', '#64748B'];

const ledgerStore = useLedgerStore();
const settingsStore = useSettingsStore();
const haptics = useHaptics();
const { activeCurrency, formatCurrency } = useCurrency();

/* ---------------------------- account management --------------------------- */

const isAccountSheetOpen = ref(false);
const editingAccount = ref<Account | null>(null);
const accountName = ref('');
const accountType = ref<AccountType>('bank');
const accountBalance = ref('0');
const accountColor = ref<string>(ACCOUNT_COLORS[0] ?? '#10B981');
const accountError = ref<string | null>(null);
const isSavingAccount = ref(false);
const isDeleteConfirmOpen = ref(false);

const accountTypeOptions: Array<{ label: string; value: AccountType }> = [
  { label: 'Cash', value: 'cash' },
  { label: 'Bank', value: 'bank' },
  { label: 'Credit', value: 'credit' },
  { label: 'Invest', value: 'investment' }
];

const themeOptions: Array<{ label: string; value: ThemeMode }> = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' }
];

const weekOptions: Array<{ label: string; value: 0 | 1 }> = [
  { label: 'Sunday', value: 0 },
  { label: 'Monday', value: 1 }
];

const balanceByAccountId = computed(() => ledgerStore.balanceByAccountId);

const openCreateAccount = (): void => {
  editingAccount.value = null;
  accountName.value = '';
  accountType.value = 'bank';
  accountBalance.value = '0';
  accountColor.value = ACCOUNT_COLORS[0] ?? '#10B981';
  accountError.value = null;
  isAccountSheetOpen.value = true;
};

const openEditAccount = (account: Account): void => {
  editingAccount.value = account;
  accountName.value = account.name;
  accountType.value = account.type;
  accountBalance.value = formatMinorToMajorString(account.initialBalance, account.currency);
  accountColor.value = account.colorHex;
  accountError.value = null;
  isAccountSheetOpen.value = true;
};

const accountPreview = computed(() => {
  const validation = validateAccountInput({
    name: accountName.value,
    type: accountType.value,
    initialBalanceMajor: accountBalance.value,
    currency: activeCurrency.value,
    colorHex: accountColor.value
  });

  if (!validation.isValid || !validation.data) {
    return { valid: false, message: Object.values(validation.errors)[0] ?? 'Check the highlighted fields' };
  }

  return { valid: true, message: `Opening balance ${formatCurrency(validation.data.initialBalance, activeCurrency.value)}` };
});

const saveAccount = async (): Promise<void> => {
  accountError.value = null;

  const validation = validateAccountInput({
    name: accountName.value,
    type: accountType.value,
    initialBalanceMajor: accountBalance.value,
    currency: activeCurrency.value,
    colorHex: accountColor.value
  });

  if (!validation.isValid || !validation.data) {
    accountError.value = Object.values(validation.errors)[0] ?? 'Check the highlighted fields';
    return;
  }

  isSavingAccount.value = true;
  try {
    const result = editingAccount.value
      ? await ledgerStore.updateAccount(editingAccount.value.id, {
          name: validation.data.name,
          type: validation.data.type,
          initialBalance: validation.data.initialBalance,
          colorHex: validation.data.colorHex
        })
      : await ledgerStore.createAccount({
          name: validation.data.name,
          type: validation.data.type,
          initialBalance: validation.data.initialBalance,
          currency: validation.data.currency,
          colorHex: validation.data.colorHex,
          sortOrder: 0,
          isArchived: false
        });

    if (!result.ok) {
      accountError.value = result.message;
      return;
    }

    haptics.trigger('success');
    isAccountSheetOpen.value = false;
  } finally {
    isSavingAccount.value = false;
  }
};

const toggleArchive = async (account: Account): Promise<void> => {
  const result = await ledgerStore.setAccountArchived(account.id, !account.isArchived);
  if (!result.ok) {
    accountError.value = result.message;
    return;
  }

  haptics.trigger('selection');
  isAccountSheetOpen.value = false;
};

const confirmDeleteAccount = async (): Promise<void> => {
  const account = editingAccount.value;
  if (!account) return;

  isSavingAccount.value = true;
  try {
    const result = await ledgerStore.deleteAccount(account.id);
    isDeleteConfirmOpen.value = false;

    if (!result.ok) {
      accountError.value = result.message;
      return;
    }

    haptics.trigger('warning');
    isAccountSheetOpen.value = false;
  } finally {
    isSavingAccount.value = false;
  }
};

/* -------------------------------- preferences ------------------------------ */

const isUpdatingSettings = ref(false);

const handleThemeChange = async (value: string | number): Promise<void> => {
  isUpdatingSettings.value = true;
  try {
    await settingsStore.setTheme(value as ThemeMode);
  } finally {
    isUpdatingSettings.value = false;
  }
};

const handleWeekChange = async (value: string | number): Promise<void> => {
  isUpdatingSettings.value = true;
  try {
    await settingsStore.setFirstDayOfWeek(value as 0 | 1);
  } finally {
    isUpdatingSettings.value = false;
  }
};

const toggleHaptics = async (): Promise<void> => {
  await settingsStore.setHapticsEnabled(!settingsStore.hapticEnabled);
};

const themeLabel = computed(() => settingsStore.theme);

const storageNote = computed(() =>
  settingsStore.isStoragePersisted
    ? 'Storage is persistent: the browser will not evict your ledger automatically.'
    : 'Storage is best-effort: export backups regularly in case the browser clears data.'
);
</script>

<template>
  <div class="settings">
    <section class="settings-section" aria-labelledby="accounts-heading">
      <header class="section-head">
        <div class="section-heading">
          <h2 id="accounts-heading" class="section-title">Accounts</h2>
          <p class="section-subtitle">Live balances derived from your ledger and opening balances.</p>
        </div>
        <AppButton variant="secondary" size="sm" icon="plus" @click="openCreateAccount">Add</AppButton>
      </header>

      <ul class="account-list">
        <li v-for="account in ledgerStore.accounts" :key="account.id">
          <button type="button" class="account-row" @click="openEditAccount(account)">
            <span class="account-accent" :style="{ backgroundColor: account.colorHex }" aria-hidden="true" />

            <span class="account-body">
              <span class="account-name-row">
                <span class="account-name">{{ account.name }}</span>
                <AppBadge v-if="account.isArchived" variant="neutral" size="sm">Archived</AppBadge>
              </span>
              <span class="account-meta">{{ account.type }} · {{ account.currency }}</span>
            </span>

            <AmountDisplay
              :amount="balanceByAccountId.get(account.id) ?? account.initialBalance"
              :currency="account.currency"
              :tone="(balanceByAccountId.get(account.id) ?? account.initialBalance) >= 0 ? 'neutral' : 'expense'"
              size="sm"
            />

            <AppIcon name="chevron-right" :size="16" />
          </button>
        </li>
      </ul>

      <p class="storage-note">
        <AppIcon name="database" :size="14" />
        <span>{{ storageNote }}</span>
      </p>
    </section>

    <section class="settings-section" aria-labelledby="preferences-heading">
      <header class="section-head">
        <div class="section-heading">
          <h2 id="preferences-heading" class="section-title">Preferences</h2>
          <p class="section-subtitle">Appearance and feedback for this device.</p>
        </div>
      </header>

      <div class="preference-card">
        <div class="preference-row">
          <span class="preference-label">
            <AppIcon :name="themeLabel === 'dark' ? 'moon' : themeLabel === 'light' ? 'sun' : 'smartphone'" :size="16" />
            Theme
          </span>
          <AppSegmented
            :model-value="settingsStore.theme"
            :options="themeOptions"
            label="Theme"
            size="sm"
            :disabled="isUpdatingSettings"
            @update:model-value="handleThemeChange"
          />
        </div>

        <div class="preference-row">
          <span class="preference-label">
            <AppIcon name="calendar" :size="16" />
            Week starts on
          </span>
          <AppSegmented
            :model-value="settingsStore.firstDayOfWeek"
            :options="weekOptions"
            label="First day of week"
            size="sm"
            :disabled="isUpdatingSettings"
            @update:model-value="handleWeekChange"
          />
        </div>

        <div class="preference-row">
          <span class="preference-label">
            <AppIcon name="activity" :size="16" />
            Haptic feedback
          </span>
          <button
            type="button"
            class="switch"
            role="switch"
            :aria-checked="settingsStore.hapticEnabled"
            :aria-label="`Haptic feedback ${settingsStore.hapticEnabled ? 'on' : 'off'}`"
            :class="{ 'is-on': settingsStore.hapticEnabled }"
            @click="toggleHaptics"
          >
            <span class="switch-knob" />
          </button>
        </div>
      </div>
    </section>

    <CurrencySelector />

    <BackupRestoreSection />

    <PwaStatusCard />

    <section class="settings-section" aria-labelledby="about-heading">
      <header class="section-head">
        <div class="section-heading">
          <h2 id="about-heading" class="section-title">About</h2>
        </div>
      </header>

      <div class="about-card">
        <p class="about-line"><strong>Vue Offline Expense Tracker</strong> · v1.0.0</p>
        <p class="about-line">
          Vue 3 + Vite PWA with an IndexedDB ledger (Dexie). Amounts are stored as integer minor units to
          eliminate floating-point rounding, and no feature requires a network connection.
        </p>
        <p class="about-line">
          Base currency: <strong>{{ activeCurrency }}</strong> · First day of week:
          <strong>{{ settingsStore.firstDayOfWeek === 1 ? 'Monday' : 'Sunday' }}</strong>
        </p>
      </div>
    </section>

    <AppModalSheet
      v-model="isAccountSheetOpen"
      :title="editingAccount ? 'Edit account' : 'New account'"
      description="Accounts use the locked base currency and keep every ledger entry reconcilable."
    >
      <div v-if="accountError" class="form-error" role="alert">
        <AppIcon name="alert-circle" :size="16" />
        <span>{{ accountError }}</span>
      </div>

      <div class="account-form">
        <AppInput v-model="accountName" label="Name" placeholder="Everyday card" :maxlength="40" />

        <div class="form-block">
          <span class="form-label">Type</span>
          <AppSegmented
            v-model="accountType"
            :options="accountTypeOptions"
            label="Account type"
            size="sm"
          />
        </div>

        <AppInput
          v-model="accountBalance"
          label="Opening balance"
          input-mode="decimal"
          enter-key-hint="done"
          :suffix="activeCurrency"
          icon="wallet"
          hint="Credit accounts can start negative, for example -250.00."
        />

        <div class="form-block">
          <span class="form-label">Colour</span>
          <div class="color-grid">
            <button
              v-for="color in ACCOUNT_COLORS"
              :key="color"
              type="button"
              class="color-cell"
              :class="{ 'is-selected': accountColor === color }"
              :style="{ backgroundColor: color }"
              :aria-label="`Colour ${color}`"
              :aria-pressed="accountColor === color"
              @click="accountColor = color"
            />
          </div>
        </div>

        <p class="form-preview" :class="{ 'is-invalid': !accountPreview.valid }">
          {{ accountPreview.message }}
        </p>

        <AccountPicker
          v-if="ledgerStore.accounts.length > 0"
          :model-value="editingAccount?.id ?? ''"
          :accounts="ledgerStore.accounts"
          :transactions="ledgerStore.transactions"
          label="Existing accounts"
          @update:model-value="(id) => { const found = ledgerStore.accountById(id); if (found) openEditAccount(found); }"
        />
      </div>

      <template #footer>
        <AppButton
          v-if="editingAccount"
          variant="ghost"
          icon="trash"
          label="Delete account"
          :disabled="isSavingAccount"
          @click="isDeleteConfirmOpen = true"
        />
        <AppButton
          v-if="editingAccount"
          variant="secondary"
          :disabled="isSavingAccount"
          @click="toggleArchive(editingAccount)"
        >
          {{ editingAccount.isArchived ? 'Restore' : 'Archive' }}
        </AppButton>
        <AppButton variant="primary" block :loading="isSavingAccount" @click="saveAccount">
          {{ editingAccount ? 'Save' : 'Create' }}
        </AppButton>
      </template>
    </AppModalSheet>

    <AppModalSheet
      v-model="isDeleteConfirmOpen"
      title="Delete account?"
      description="Only accounts with no ledger history can be removed."
    >
      <p class="form-preview">
        Deleting removes the account permanently. Accounts already used by a transaction must be archived
        instead so history stays intact.
      </p>

      <template #footer>
        <AppButton variant="secondary" block @click="isDeleteConfirmOpen = false">Cancel</AppButton>
        <AppButton variant="danger" block :loading="isSavingAccount" @click="confirmDeleteAccount">
          Delete account
        </AppButton>
      </template>
    </AppModalSheet>
  </div>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.section-heading {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.section-title {
  margin: 0;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
}

.section-subtitle {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

/* -------------------------------- accounts -------------------------------- */
.account-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.account-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 60px;
  padding: var(--space-2) var(--space-3);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.account-row:active {
  background-color: var(--color-surface-sunken);
}

.account-accent {
  width: 4px;
  align-self: stretch;
  border-radius: var(--radius-pill);
  flex-shrink: 0;
}

.account-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.account-name-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.account-name {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-meta {
  font-size: var(--font-size-2xs);
  color: var(--color-text-muted);
  text-transform: capitalize;
}

.storage-note {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

/* ------------------------------- preferences ------------------------------ */
.preference-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-4);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.preference-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.preference-label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.switch {
  position: relative;
  width: 52px;
  height: 32px;
  flex-shrink: 0;
  padding: 0;
  background-color: var(--color-border-strong);
  border: none;
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition: background-color var(--duration-fast) var(--ease-standard);
}

.switch.is-on {
  background-color: var(--color-primary-strong);
}

.switch-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 26px;
  height: 26px;
  background-color: #ffffff;
  border-radius: var(--radius-circle);
  box-shadow: var(--shadow-sm);
  transition: transform var(--duration-fast) var(--ease-standard);
}

.switch.is-on .switch-knob {
  transform: translateX(20px);
}

/* --------------------------------- about ---------------------------------- */
.about-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.about-line {
  margin: 0;
  font-size: var(--font-size-xs);
  line-height: var(--line-height-base);
  color: var(--color-text-muted);
}

/* ------------------------------ account form ------------------------------ */
.account-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.form-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.form-label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.color-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: var(--space-2);
}

.color-cell {
  min-height: var(--tap-target);
  border: 2px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
}

.color-cell.is-selected {
  border-color: var(--color-text-primary);
  box-shadow: 0 0 0 2px var(--color-surface) inset;
}

.form-error {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background-color: var(--color-danger-soft);
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-md);
  color: var(--color-danger);
  font-size: var(--font-size-sm);
}

.form-preview {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.form-preview.is-invalid {
  color: var(--color-danger);
}

@media (prefers-reduced-motion: reduce) {
  .switch,
  .switch-knob {
    transition: none;
  }
}
</style>
