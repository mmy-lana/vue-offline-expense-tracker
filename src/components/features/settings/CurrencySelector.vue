<script setup lang="ts">
/**
 * Base currency selector.
 *
 * The currency is locked as soon as the ledger or any budget holds value,
 * because stored minor units are never converted (no network, no FX rates). The
 * lock reason comes from the ledger service so the explanation always matches the
 * actual guard.
 */

import { computed, ref } from 'vue';
import { useSettingsStore } from '@/stores/settingsStore';
import AppIcon from '@/components/ui/AppIcon.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppModalSheet from '@/components/ui/AppModalSheet.vue';

const settingsStore = useSettingsStore();

const isSheetOpen = ref(false);
const query = ref('');
const isSaving = ref(false);
const error = ref<string | null>(null);
const success = ref<string | null>(null);

/** Currency list resolved from the runtime's own ICU data (offline, no API). */
const allCurrencies = computed<string[]>(() => {
  const supportedValuesOf = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
    .supportedValuesOf;
  if (typeof supportedValuesOf !== 'function') return [settingsStore.baseCurrency];
  return supportedValuesOf('currency').slice().sort();
});

const filteredCurrencies = computed(() => {
  const term = query.value.trim().toUpperCase();
  if (term.length === 0) return allCurrencies.value;
  return allCurrencies.value.filter((code) => code.includes(term));
});

const isLocked = computed(() => settingsStore.isBaseCurrencyLocked);
const lockReason = computed(
  () => settingsStore.currencyLockReason ?? 'The base currency is locked for this ledger.'
);

const openSheet = (): void => {
  if (isLocked.value) return;

  query.value = '';
  error.value = null;
  isSheetOpen.value = true;
};

const selectCurrency = async (code: string): Promise<void> => {
  error.value = null;
  isSaving.value = true;

  try {
    const result = await settingsStore.setBaseCurrency(code);
    if (!result.ok) {
      error.value = result.message;
      return;
    }

    success.value = result.message;
    isSheetOpen.value = false;
  } finally {
    isSaving.value = false;
  }
};
</script>

<template>
  <section class="settings-section" aria-labelledby="currency-heading">
    <header class="section-head">
      <h2 id="currency-heading" class="section-title">Base currency</h2>
      <p class="section-subtitle">Single-currency ledger: every amount is stored in this currency's minor units.</p>
    </header>

    <button
      type="button"
      class="currency-row"
      :class="{ 'is-locked': isLocked }"
      :disabled="isLocked"
      :aria-label="isLocked ? `Base currency ${settingsStore.baseCurrency}, locked` : `Change base currency, currently ${settingsStore.baseCurrency}`"
      @click="openSheet"
    >
      <span class="currency-code">{{ settingsStore.baseCurrency }}</span>
      <span class="currency-meta">
        <template v-if="isLocked">
          <AppIcon name="lock" :size="14" />
          <span>Locked</span>
        </template>
        <template v-else>
          <span>Change</span>
          <AppIcon name="chevron-right" :size="16" />
        </template>
      </span>
    </button>

    <p v-if="isLocked" class="lock-note">{{ lockReason }}</p>
    <p v-else class="lock-note">
      Editable while the ledger is empty. Switch now if this is not your currency.
    </p>

    <p v-if="success" class="success-note" role="status">{{ success }}</p>

    <AppModalSheet
      v-model="isSheetOpen"
      title="Select base currency"
      description="Only possible before the first transaction exists."
    >
      <AppInput
        v-model="query"
        label="Search currency"
        placeholder="USD, EUR, JPY…"
        icon="search"
        input-mode="search"
        autocomplete="off"
        clearable
      />

      <div v-if="error" class="currency-error" role="alert">
        <AppIcon name="alert-circle" :size="16" />
        <span>{{ error }}</span>
      </div>

      <ul v-if="filteredCurrencies.length > 0" class="currency-grid">
        <li v-for="code in filteredCurrencies" :key="code">
          <button
            type="button"
            class="currency-cell"
            :class="{ 'is-selected': code === settingsStore.baseCurrency }"
            :disabled="isSaving"
            @click="selectCurrency(code)"
          >
            {{ code }}
          </button>
        </li>
      </ul>

      <p v-else class="currency-empty">No currency matches “{{ query }}”.</p>
    </AppModalSheet>
  </section>
</template>

<style scoped>
.settings-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.section-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
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

.currency-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: 56px;
  padding: 0 var(--space-4);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  font-family: inherit;
  cursor: pointer;
}

.currency-row.is-locked {
  cursor: not-allowed;
  opacity: 0.75;
}

.currency-code {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
  letter-spacing: 0.04em;
}

.currency-meta {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-muted);
}

.lock-note {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.success-note {
  margin: 0;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--color-success);
}

.currency-error {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background-color: var(--color-danger-soft);
  border-radius: var(--radius-md);
  color: var(--color-danger);
  font-size: var(--font-size-sm);
}

.currency-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
  margin: var(--space-3) 0 0;
  padding: 0;
  list-style: none;
}

.currency-cell {
  width: 100%;
  min-height: var(--tap-target);
  background-color: var(--color-surface-sunken);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  font-family: inherit;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.04em;
  cursor: pointer;
}

.currency-cell.is-selected {
  background-color: var(--color-primary-soft);
  border-color: var(--color-primary);
  color: var(--color-primary-strong);
}

.currency-cell:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.currency-empty {
  margin: var(--space-4) 0 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  text-align: center;
}
</style>
