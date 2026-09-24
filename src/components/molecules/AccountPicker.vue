<script setup lang="ts">
/**
 * Horizontal account selector with live balances.
 *
 * Balances are derived with the ledger engine (`computeAccountBalances`) from
 * the transactions supplied by the caller, so the pill strip always reflects
 * the same arithmetic as the dashboard and settings screens.
 */

import { computed } from 'vue';
import { useCurrency } from '@/composables/useCurrency';
import { useHaptics } from '@/composables/useHaptics';
import { computeAccountBalances } from '@/services/ledgerService';
import AppIcon from '@/components/ui/AppIcon.vue';
import type { Account, Transaction } from '@/types/models';

interface Props {
  modelValue: string;
  accounts: readonly Account[];
  /** Ledger used to derive live balances. */
  transactions?: readonly Transaction[];
  /** Hides one account, for example the transfer source. */
  excludeAccountId?: string;
  showBalance?: boolean;
  /** Includes archived accounts (settings screens). */
  includeArchived?: boolean;
  /** Shows a trailing "add account" pill. */
  allowCreate?: boolean;
  disabled?: boolean;
  label?: string;
}

const props = withDefaults(defineProps<Props>(), {
  transactions: () => [],
  excludeAccountId: undefined,
  showBalance: true,
  includeArchived: false,
  allowCreate: false,
  disabled: false,
  label: 'Account'
});

const emit = defineEmits<{
  (event: 'update:modelValue', accountId: string): void;
  (event: 'create'): void;
  (event: 'select', account: Account): void;
}>();

const haptics = useHaptics();
const { formatCurrency } = useCurrency();

const balanceByAccount = computed(() => computeAccountBalances([...props.accounts], [...props.transactions]));

const visibleAccounts = computed(() =>
  props.accounts
    .filter((account) => (props.includeArchived || !account.isArchived) && account.id !== props.excludeAccountId)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
);

const isEmpty = computed(() => visibleAccounts.value.length === 0);

const balanceLabel = (account: Account): string =>
  formatCurrency(balanceByAccount.value.get(account.id) ?? account.initialBalance, account.currency);

const selectAccount = (account: Account): void => {
  if (props.disabled || account.id === props.modelValue) return;

  haptics.trigger('selection');
  emit('update:modelValue', account.id);
  emit('select', account);
};

const handleCreate = (): void => {
  haptics.trigger('light');
  emit('create');
};
</script>

<template>
  <div class="account-picker" role="radiogroup" :aria-label="label">
    <div class="pill-scroll">
      <button
        v-for="account in visibleAccounts"
        :key="account.id"
        type="button"
        class="account-pill"
        role="radio"
        :aria-checked="account.id === modelValue"
        :class="{ selected: account.id === modelValue, archived: account.isArchived }"
        :disabled="disabled"
        @click="selectAccount(account)"
      >
        <span class="pill-dot" :style="{ backgroundColor: account.colorHex }" aria-hidden="true" />
        <span class="pill-body">
          <span class="pill-name">{{ account.name }}</span>
          <span v-if="showBalance" class="pill-balance">{{ balanceLabel(account) }}</span>
        </span>
        <AppIcon v-if="account.isArchived" name="lock" :size="12" />
      </button>

      <button
        v-if="allowCreate"
        type="button"
        class="account-pill create-pill"
        :disabled="disabled"
        aria-label="Add account"
        @click="handleCreate"
      >
        <AppIcon name="plus" :size="16" />
        <span class="pill-name">Add account</span>
      </button>
    </div>

    <p v-if="isEmpty" class="account-empty">
      No accounts available. Create one in Settings to start tracking.
    </p>
  </div>
</template>

<style scoped>
.account-picker {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.pill-scroll {
  display: flex;
  gap: var(--space-2);
  overflow-x: auto;
  padding-bottom: var(--space-1);
  scrollbar-width: none;
  overscroll-behavior-x: contain;
}

.pill-scroll::-webkit-scrollbar {
  display: none;
}

.account-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
  min-height: var(--tap-target);
  padding: var(--space-1) var(--space-3);
  background-color: var(--color-surface-sunken);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  color: var(--color-text-primary);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color var(--duration-fast) var(--ease-standard),
    background-color var(--duration-fast) var(--ease-standard);
}

.account-pill:active {
  transform: scale(0.97);
}

.account-pill.selected {
  background-color: var(--color-primary-soft);
  border-color: var(--color-primary);
}

.account-pill.archived {
  opacity: 0.65;
}

.account-pill:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.pill-dot {
  width: 10px;
  height: 10px;
  border-radius: var(--radius-circle);
  flex-shrink: 0;
}

.pill-body {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.pill-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  white-space: nowrap;
}

.pill-balance {
  font-size: var(--font-size-2xs);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.create-pill {
  border-style: dashed;
  color: var(--color-text-muted);
  background-color: transparent;
}

.account-empty {
  margin: 0;
  padding: var(--space-3);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

@media (prefers-reduced-motion: reduce) {
  .account-pill:active {
    transform: none;
  }
}
</style>
