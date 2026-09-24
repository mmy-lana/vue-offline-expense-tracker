<script setup lang="ts">
/**
 * Grouped, virtualisation-free ledger list.
 *
 * Transactions are grouped into sticky day sections with a per-day subtotal, and
 * only one row keeps its swipe rail open at a time. Infinite scroll is delegated
 * to the parent through an IntersectionObserver sentinel, so the view owns the
 * page size while the list owns presentation.
 */

import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import TransactionRow from '@/components/molecules/TransactionRow.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import AppButton from '@/components/ui/AppButton.vue';
import { formatCurrency } from '@/utils/money';
import { formatDayHeaderLabel } from '@/utils/date';
import type { Account, Category, Transaction } from '@/types/models';

interface Props {
  transactions: readonly Transaction[];
  currency: string;
  categoryById: (id: string) => Category | undefined;
  accountById: (id: string) => Account | undefined;
  /** Transaction ids that own at least one attachment. */
  receiptTransactionIds?: ReadonlySet<string>;
  /** True while the first database emission is pending. */
  loading?: boolean;
  /** True when more rows can be revealed by the parent. */
  hasMore?: boolean;
  /** True while the parent is extending the page. */
  loadingMore?: boolean;
  emptyTitle?: string;
  emptyMessage?: string;
  /** Renders skeleton rows instead of the list. */
  showSkeletons?: boolean;
  /** Enables the swipe edit/delete rail; disabled in preview lists. */
  canManage?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  receiptTransactionIds: () => new Set<string>(),
  loading: false,
  hasMore: false,
  loadingMore: false,
  emptyTitle: 'No transactions yet',
  emptyMessage: 'Add your first transaction to start building your local ledger.',
  showSkeletons: false,
  canManage: true
});

const emit = defineEmits<{
  (event: 'select', transaction: Transaction): void;
  (event: 'edit', transaction: Transaction): void;
  (event: 'delete', transaction: Transaction): void;
  (event: 'load-more'): void;
  (event: 'create'): void;
}>();

const openRowId = ref<string | null>(null);
const sentinelRef = ref<HTMLElement | null>(null);

let observer: IntersectionObserver | null = null;

interface DaySection {
  date: string;
  label: string;
  subtotal: number;
  subtotalLabel: string;
  transactions: Transaction[];
}

const sections = computed<DaySection[]>(() => {
  const grouped = new Map<string, Transaction[]>();

  for (const transaction of props.transactions) {
    const bucket = grouped.get(transaction.date);
    if (bucket) bucket.push(transaction);
    else grouped.set(transaction.date, [transaction]);
  }

  return Array.from(grouped, ([date, transactions]) => {
    const subtotal = transactions.reduce((total, transaction) => {
      if (transaction.type === 'income') return total + transaction.amount;
      if (transaction.type === 'expense') return total - transaction.amount;
      return total;
    }, 0);

    return {
      date,
      label: formatDayHeaderLabel(date),
      subtotal,
      subtotalLabel: formatCurrency(Math.abs(subtotal), props.currency),
      transactions
    };
  }).sort((a, b) => (a.date < b.date ? 1 : -1));
});

const isEmpty = computed(() => !props.loading && !props.showSkeletons && props.transactions.length === 0);

const toggleOpen = (transaction: Transaction, open: boolean): void => {
  openRowId.value = open ? transaction.id : null;
};

const handleSelect = (transaction: Transaction): void => {
  if (openRowId.value !== null) {
    openRowId.value = null;
    return;
  }
  emit('select', transaction);
};

const handleEdit = (transaction: Transaction): void => {
  openRowId.value = null;
  emit('edit', transaction);
};

const handleDelete = (transaction: Transaction): void => {
  openRowId.value = null;
  emit('delete', transaction);
};

onMounted(() => {
  if (typeof IntersectionObserver === 'undefined') return;

  observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (!entry?.isIntersecting) return;
      if (!props.hasMore || props.loadingMore) return;
      emit('load-more');
    },
    { rootMargin: '200px 0px' }
  );

  if (sentinelRef.value) observer.observe(sentinelRef.value);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});

const setSentinelRef = (element: unknown): void => {
  sentinelRef.value = element instanceof HTMLElement ? element : null;
};
</script>

<template>
  <div class="tx-list">
    <div v-if="loading || showSkeletons" class="skeleton-stack" aria-hidden="true">
      <div v-for="index in 4" :key="index" class="skeleton-row">
        <span class="skeleton-bubble" />
        <span class="skeleton-lines">
          <span class="skeleton-line skeleton-line--wide" />
          <span class="skeleton-line" />
        </span>
      </div>
    </div>

    <template v-else-if="!isEmpty">
      <section v-for="section in sections" :key="section.date" class="day-section">
        <header class="day-header">
          <span class="day-label">{{ section.label }}</span>
          <span class="day-subtotal" :class="section.subtotal >= 0 ? 'is-positive' : 'is-negative'">
            {{ section.subtotal >= 0 ? '+' : '−' }}{{ section.subtotalLabel }}
          </span>
        </header>

        <ul class="day-rows">
          <li v-for="transaction in section.transactions" :key="transaction.id">
            <TransactionRow
              :transaction="transaction"
              :category="categoryById(transaction.categoryId)"
              :account="accountById(transaction.accountId)"
              :to-account="transaction.toAccountId ? accountById(transaction.toAccountId) : undefined"
              :currency="currency"
              :has-receipt="receiptTransactionIds.has(transaction.id)"
              :swipeable="canManage"
              :is-open="openRowId === transaction.id"
              @select="handleSelect"
              @edit="handleEdit"
              @delete="handleDelete"
              @toggle-open="toggleOpen"
            />
          </li>
        </ul>
      </section>

      <div :ref="setSentinelRef" class="load-sentinel">
        <span v-if="loadingMore" class="sentinel-text">Loading more…</span>
        <span v-else-if="!hasMore" class="sentinel-text">End of ledger</span>
      </div>
    </template>

    <div v-else class="empty-state">
      <span class="empty-icon">
        <AppIcon name="list" :size="26" />
      </span>
      <h3 class="empty-title">{{ emptyTitle }}</h3>
      <p class="empty-message">{{ emptyMessage }}</p>
      <AppButton variant="primary" icon="plus" @click="emit('create')">Add transaction</AppButton>
    </div>
  </div>
</template>

<style scoped>
.tx-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.day-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.day-header {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-1);
  background-color: var(--color-bg-primary);
}

.day-label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.day-subtotal {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  font-variant-numeric: tabular-nums;
}

.day-subtotal.is-positive {
  color: var(--color-income);
}

.day-subtotal.is-negative {
  color: var(--color-expense);
}

.day-rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.load-sentinel {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
}

.sentinel-text {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-7) var(--space-5);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-xl);
  text-align: center;
}

.empty-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: var(--radius-circle);
  background-color: var(--color-surface-sunken);
  color: var(--color-text-muted);
}

.empty-title {
  margin: 0;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
}

.empty-message {
  margin: 0;
  max-width: 34ch;
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.skeleton-stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.skeleton-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  min-height: 60px;
  background-color: var(--color-surface);
  border-radius: var(--radius-lg);
}

.skeleton-bubble,
.skeleton-line {
  background-color: var(--color-skeleton);
  animation: skeleton-pulse 1.4s ease-in-out infinite;
}

.skeleton-bubble {
  width: 38px;
  height: 38px;
  border-radius: var(--radius-circle);
  flex-shrink: 0;
}

.skeleton-lines {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex: 1;
}

.skeleton-line {
  height: 10px;
  width: 40%;
  border-radius: var(--radius-pill);
}

.skeleton-line--wide {
  width: 70%;
}

@keyframes skeleton-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-bubble,
  .skeleton-line {
    animation: none;
  }
}
</style>
