<script setup lang="ts">
/**
 * Ledger screen: searchable, filterable, paginated transaction history.
 *
 * Filtering runs in memory over the reactive ledger (the whole ledger already
 * lives in the store), and the list reveals 30 rows at a time as the sentinel
 * scrolls into view. Row taps open the receipt when one exists, otherwise they
 * open the entry sheet for editing.
 */

import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useLedgerStore } from '@/stores/ledgerStore';
import { useCurrency } from '@/composables/useCurrency';
import { useHaptics } from '@/composables/useHaptics';
import TransactionFilterBar from '@/components/features/transactions/TransactionFilterBar.vue';
import TransactionList from '@/components/features/transactions/TransactionList.vue';
import ReceiptViewerModal from '@/components/features/transactions/ReceiptViewerModal.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import AppModalSheet from '@/components/ui/AppModalSheet.vue';
import { db } from '@/services/db';
import {
  countActiveFilters,
  createDefaultFilters,
  filterTransactions,
  type TransactionFilters
} from '@/types/filters';
import { formatCurrency } from '@/utils/money';
import type { Transaction } from '@/types/models';

const PAGE_SIZE = 30;

const route = useRoute();
const router = useRouter();
const ledgerStore = useLedgerStore();
const haptics = useHaptics();
const { activeCurrency } = useCurrency();

const filters = ref<TransactionFilters>(createDefaultFilters());
const visibleCount = ref(PAGE_SIZE);
const receiptIds = ref<Set<string>>(new Set());
const receiptTarget = ref<Transaction | null>(null);
const isReceiptOpen = ref(false);
const deleteTarget = ref<Transaction | null>(null);
const isDeleteOpen = ref(false);
const statusMessage = ref<string | null>(null);

const loadReceiptIds = async (): Promise<void> => {
  try {
    const receipts = await db.receipts.toArray();
    receiptIds.value = new Set(receipts.map((receipt) => receipt.transactionId));
  } catch {
    receiptIds.value = new Set();
  }
};

onMounted(() => {
  void loadReceiptIds();

  const focusId = route.query.focus;
  if (typeof focusId === 'string' && focusId.length > 0) {
    statusMessage.value = 'Showing the entry you selected from the dashboard.';
  }
});

const filtered = computed(() =>
  filterTransactions(ledgerStore.sortedTransactions, filters.value, (transaction) => {
    const category = ledgerStore.categoryById(transaction.categoryId);
    const account = ledgerStore.accountById(transaction.accountId);
    const toAccount = transaction.toAccountId ? ledgerStore.accountById(transaction.toAccountId) : undefined;

    return {
      categoryName: category?.name,
      accountName: account?.name,
      toAccountName: toAccount?.name
    };
  })
);

const visibleTransactions = computed(() => filtered.value.slice(0, visibleCount.value));
const hasMore = computed(() => filtered.value.length > visibleCount.value);
const activeFilterCount = computed(() => countActiveFilters(filters.value));
const hasAnyTransaction = computed(() => ledgerStore.transactions.length > 0);

const filteredTotals = computed(() =>
  filtered.value.reduce(
    (totals, transaction) => {
      if (transaction.type === 'income') totals.income += transaction.amount;
      if (transaction.type === 'expense') totals.expense += transaction.amount;
      return totals;
    },
    { income: 0, expense: 0 }
  )
);

// Any filter change restarts pagination.
watch(
  filters,
  () => {
    visibleCount.value = PAGE_SIZE;
  },
  { deep: true }
);

const loadMore = (): void => {
  if (!hasMore.value) return;
  visibleCount.value += PAGE_SIZE;
};

const handleSelect = (transaction: Transaction): void => {
  if (receiptIds.value.has(transaction.id)) {
    receiptTarget.value = transaction;
    isReceiptOpen.value = true;
    return;
  }

  openEdit(transaction);
};

const openEdit = (transaction: Transaction): void => {
  void router.push({ name: 'entry', query: { id: transaction.id } });
};

const requestDelete = (transaction: Transaction): void => {
  deleteTarget.value = transaction;
  isDeleteOpen.value = true;
};

const confirmDelete = async (): Promise<void> => {
  const target = deleteTarget.value;
  if (!target) return;

  const result = await ledgerStore.deleteTransaction(target.id);
  isDeleteOpen.value = false;
  deleteTarget.value = null;
  statusMessage.value = result.message;

  if (result.ok) {
    haptics.trigger('success');
    await loadReceiptIds();
  }
};

const resetFilters = (): void => {
  filters.value = createDefaultFilters();
  visibleCount.value = PAGE_SIZE;
};

const clearStatus = (): void => {
  statusMessage.value = null;
};

const openQuickAdd = (): void => {
  void router.push({ name: 'entry' });
};

const deletePreview = computed(() =>
  deleteTarget.value
    ? `${formatCurrency(deleteTarget.value.amount, activeCurrency.value)} · ${deleteTarget.value.date}`
    : ''
);
</script>

<template>
  <div class="ledger">
    <TransactionFilterBar
      v-model="filters"
      :accounts="ledgerStore.accounts"
      :categories="ledgerStore.categories"
      @reset="resetFilters"
    />

    <div v-if="statusMessage" class="status-banner" role="status">
      <AppIcon name="info" :size="16" />
      <span class="status-text">{{ statusMessage }}</span>
      <button type="button" class="status-dismiss" aria-label="Dismiss message" @click="clearStatus">
        <AppIcon name="x" :size="14" />
      </button>
    </div>

    <div v-if="hasAnyTransaction" class="ledger-summary">
      <span class="summary-item">
        <span class="summary-label">{{ filtered.length }}</span>
        <span class="summary-text">{{ filtered.length === 1 ? 'entry' : 'entries' }}</span>
      </span>
      <span class="summary-item">
        <span class="summary-label is-income">{{ formatCurrency(filteredTotals.income, activeCurrency) }}</span>
        <span class="summary-text">in</span>
      </span>
      <span class="summary-item">
        <span class="summary-label is-expense">{{ formatCurrency(filteredTotals.expense, activeCurrency) }}</span>
        <span class="summary-text">out</span>
      </span>
    </div>

    <TransactionList
      :transactions="visibleTransactions"
      :currency="activeCurrency"
      :category-by-id="ledgerStore.categoryById"
      :account-by-id="ledgerStore.accountById"
      :receipt-transaction-ids="receiptIds"
      :loading="!ledgerStore.isReady"
      :has-more="hasMore"
      :empty-title="hasAnyTransaction ? 'No entries match these filters' : 'Your ledger is empty'"
      :empty-message="
        hasAnyTransaction
          ? 'Relax or clear the filters to see more of your history.'
          : 'Record your first transaction to start building a private, offline ledger.'
      "
      @select="handleSelect"
      @edit="openEdit"
      @delete="requestDelete"
      @load-more="loadMore"
      @create="openQuickAdd"
    />

    <div v-if="hasAnyTransaction && activeFilterCount > 0 && filtered.length === 0" class="filter-empty">
      <AppButton variant="secondary" block icon="filter" @click="resetFilters">Clear all filters</AppButton>
    </div>

    <AppButton class="ledger-add" variant="primary" block icon="plus" @click="openQuickAdd">
      Add transaction
    </AppButton>

    <ReceiptViewerModal v-model="isReceiptOpen" :transaction="receiptTarget" />

    <AppModalSheet
      v-model="isDeleteOpen"
      title="Delete transaction?"
      :description="deletePreview"
    >
      <p class="confirm-text">
        The entry and any attached receipt are removed from this device. Export a backup first if you
        might need it later.
      </p>

      <template #footer>
        <AppButton variant="secondary" block @click="isDeleteOpen = false">Keep it</AppButton>
        <AppButton variant="danger" block :loading="ledgerStore.isLoading" @click="confirmDelete">
          Delete
        </AppButton>
      </template>
    </AppModalSheet>
  </div>
</template>

<style scoped>
.ledger {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.status-banner {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background-color: var(--color-primary-soft);
  border-radius: var(--radius-md);
  color: var(--color-primary-strong);
  font-size: var(--font-size-sm);
}

.status-text {
  flex: 1;
  min-width: 0;
}

.status-dismiss {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--tap-target);
  height: var(--tap-target);
  background: transparent;
  border: none;
  border-radius: var(--radius-circle);
  color: inherit;
  cursor: pointer;
}

.ledger-summary {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-2) var(--space-3);
  background-color: var(--color-surface-sunken);
  border-radius: var(--radius-md);
}

.summary-item {
  display: inline-flex;
  align-items: baseline;
  gap: var(--space-1);
}

.summary-label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
}

.summary-label.is-income {
  color: var(--color-income);
}

.summary-label.is-expense {
  color: var(--color-expense);
}

.summary-text {
  font-size: var(--font-size-2xs);
  color: var(--color-text-muted);
}

.filter-empty {
  display: flex;
  justify-content: center;
}

.ledger-add {
  margin-top: var(--space-1);
}

.confirm-text {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}
</style>
