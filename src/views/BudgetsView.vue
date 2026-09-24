<script setup lang="ts">
/**
 * Budgets: monthly envelope pacing for every expense category.
 *
 * Utilisation is recomputed from the live ledger, so editing an envelope or
 * adding an expense immediately re-paces the remaining daily allowance.
 */

import { computed, ref } from 'vue';
import { useLedgerStore } from '@/stores/ledgerStore';
import { useCurrency } from '@/composables/useCurrency';
import { useLedgerCalculations } from '@/composables/useLedgerCalculations';
import BudgetList from '@/components/features/budgets/BudgetList.vue';
import BudgetCreateModal from '@/components/features/budgets/BudgetCreateModal.vue';
import DateNavigator from '@/components/molecules/DateNavigator.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import { db } from '@/services/db';
import { generateUUID } from '@/utils/id';
import { getCurrentYearMonth, isPastYearMonth } from '@/utils/date';
import type { Budget, BudgetUtilization } from '@/types/models';

const ledgerStore = useLedgerStore();
const { activeCurrency } = useCurrency();
const { calculateBudgetUtilization } = useLedgerCalculations();

const activeYearMonth = ref(getCurrentYearMonth());
const isEditorOpen = ref(false);
const editingBudget = ref<Budget | null>(null);
const statusMessage = ref<string | null>(null);
const isCopying = ref(false);

const isPastPeriod = computed(() => isPastYearMonth(activeYearMonth.value));
const isCurrentMonth = computed(() => activeYearMonth.value === getCurrentYearMonth());

const utilizations = computed(() =>
  calculateBudgetUtilization(
    ledgerStore.budgetsForMonth(activeYearMonth.value),
    ledgerStore.transactions,
    ledgerStore.categories,
    activeYearMonth.value
  )
);

const unbudgetedExpenseCategories = computed(() => {
  const budgeted = new Set(utilizations.value.map((utilization) => utilization.categoryId));
  return ledgerStore.expenseCategories.filter((category) => !budgeted.has(category.id));
});

/** Whether the current month holds envelopes that can be copied into the viewed one. */
const hasBudgetsInCurrentMonth = computed(() =>
  ledgerStore.budgets.some((budget) => budget.yearMonth === getCurrentYearMonth())
);

const openCreate = (): void => {
  editingBudget.value = null;
  isEditorOpen.value = true;
};

const openEdit = (utilization: BudgetUtilization): void => {
  editingBudget.value = ledgerStore.budgets.find((budget) => budget.id === utilization.budgetId) ?? null;
  isEditorOpen.value = true;
};

const handleSaved = (message: string): void => {
  statusMessage.value = message;
};

const handleDeleted = (message: string): void => {
  statusMessage.value = message;
};

/** Copies the current month's envelopes into the month being viewed. */
const copyFromCurrentMonth = async (): Promise<void> => {
  const sourceMonth = getCurrentYearMonth();
  if (sourceMonth === activeYearMonth.value) return;

  isCopying.value = true;
  try {
    const source = await db.budgets.where('yearMonth').equals(sourceMonth).toArray();
    if (source.length === 0) {
      statusMessage.value = 'No envelopes exist in the current month to copy.';
      return;
    }

    let copiedCount = 0;
    await db.transaction('rw', [db.budgets, db.categories], async () => {
      for (const budget of source) {
        const category = await db.categories.get(budget.categoryId);
        if (!category || category.type !== 'expense' || category.isHidden || category.isArchived) {
          continue;
        }

        const existing = await db.budgets
          .where('[categoryId+yearMonth]')
          .equals([budget.categoryId, activeYearMonth.value])
          .first();

        const timestamp = Date.now();
        if (existing) {
          await db.budgets.update(existing.id, { amount: budget.amount, updatedAt: timestamp });
        } else {
          await db.budgets.add({
            id: generateUUID(),
            categoryId: budget.categoryId,
            amount: budget.amount,
            period: 'monthly',
            yearMonth: activeYearMonth.value,
            createdAt: timestamp,
            updatedAt: timestamp
          });
        }
        copiedCount++;
      }
    });

    statusMessage.value = `Copied ${copiedCount} envelope(s) into this month.`;
  } catch (error: unknown) {
    statusMessage.value = error instanceof Error ? error.message : 'Failed to copy envelopes';
  } finally {
    isCopying.value = false;
  }
};

const clearStatus = (): void => {
  statusMessage.value = null;
};
</script>

<template>
  <div class="budgets">
    <section class="period-card" aria-labelledby="budgets-period">
      <div class="period-head">
        <h2 id="budgets-period" class="period-title">Envelope period</h2>
        <DateNavigator
          v-model="activeYearMonth"
          mode="month"
          :disable-forward="isCurrentMonth"
          label="Budget month"
        />
      </div>

      <p v-if="isPastPeriod" class="period-note">
        Viewing a closed period. Daily allowances are reported as zero and alerts are historical.
      </p>
    </section>

    <div v-if="statusMessage" class="status-banner" role="status">
      <AppIcon name="check" :size="16" />
      <span class="status-text">{{ statusMessage }}</span>
      <button type="button" class="status-dismiss" aria-label="Dismiss message" @click="clearStatus">
        <AppIcon name="x" :size="14" />
      </button>
    </div>

    <BudgetList
      :utilizations="utilizations"
      :currency="activeCurrency"
      :is-past-period="isPastPeriod"
      @select="openEdit"
      @create="openCreate"
      @delete="openEdit"
    />

    <div v-if="utilizations.length === 0 && hasBudgetsInCurrentMonth && !isCurrentMonth" class="copy-card">
      <AppIcon name="refresh" :size="18" />
      <div class="copy-body">
        <span class="copy-title">Reuse this month's envelopes</span>
        <span class="copy-text">Copy the current month's limits into the period you are viewing.</span>
      </div>
      <AppButton variant="secondary" size="sm" :loading="isCopying" @click="copyFromCurrentMonth">
        Copy
      </AppButton>
    </div>

    <section v-if="unbudgetedExpenseCategories.length > 0" class="unbudgeted" aria-labelledby="unbudgeted-heading">
      <h2 id="unbudgeted-heading" class="unbudgeted-title">
        Categories without an envelope ({{ unbudgetedExpenseCategories.length }})
      </h2>
      <div class="chip-row">
        <span
          v-for="category in unbudgetedExpenseCategories"
          :key="category.id"
          class="category-chip"
        >
          <span class="chip-dot" :style="{ backgroundColor: category.colorHex }" aria-hidden="true" />
          {{ category.name }}
        </span>
      </div>
      <AppButton variant="ghost" block icon="plus" @click="openCreate">Add an envelope</AppButton>
    </section>

    <BudgetCreateModal
      v-model="isEditorOpen"
      :year-month="activeYearMonth"
      :budget="editingBudget"
      :categories="ledgerStore.categories"
      @saved="handleSaved"
      @deleted="handleDeleted"
    />
  </div>
</template>

<style scoped>
.budgets {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.period-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
}

.period-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.period-title {
  margin: 0;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.period-note {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.status-banner {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background-color: var(--color-success-soft);
  border-radius: var(--radius-md);
  color: var(--color-success);
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

.copy-card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  color: var(--color-text-secondary);
}

.copy-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.copy-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.copy-text {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.unbudgeted {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.unbudgeted-title {
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.category-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-3);
  background-color: var(--color-surface-sunken);
  border-radius: var(--radius-pill);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
}

.chip-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-circle);
}
</style>
