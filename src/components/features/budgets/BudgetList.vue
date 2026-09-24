<script setup lang="ts">
/**
 * Monthly envelope list.
 *
 * Renders one pacing gauge per budget with a summary header, per-row delete
 * affordance and an explicit empty state that links straight into creation.
 */

import { computed } from 'vue';
import BudgetProgressBar from '@/components/molecules/BudgetProgressBar.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import { useCurrency } from '@/composables/useCurrency';
import type { BudgetUtilization } from '@/types/models';

interface Props {
  utilizations: readonly BudgetUtilization[];
  currency?: string;
  isPastPeriod?: boolean;
  /** Enables row selection (opens the edit sheet). */
  interactive?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  currency: undefined,
  isPastPeriod: false,
  interactive: true
});

const emit = defineEmits<{
  (event: 'select', utilization: BudgetUtilization): void;
  (event: 'delete', utilization: BudgetUtilization): void;
  (event: 'create'): void;
}>();

const { formatCurrency } = useCurrency();

const totals = computed(() =>
  props.utilizations.reduce(
    (accumulator, utilization) => ({
      budgeted: accumulator.budgeted + utilization.budgetAmount,
      spent: accumulator.spent + utilization.actualSpent
    }),
    { budgeted: 0, spent: 0 }
  )
);

const remaining = computed(() => totals.value.budgeted - totals.value.spent);

const overallPercentage = computed(() =>
  totals.value.budgeted > 0 ? Math.round((totals.value.spent / totals.value.budgeted) * 100) : 0
);

const exceededCount = computed(
  () => props.utilizations.filter((utilization) => utilization.isExceeded).length
);

const isEmpty = computed(() => props.utilizations.length === 0);
</script>

<template>
  <div class="budget-list">
    <template v-if="!isEmpty">
      <div class="budget-summary">
        <div class="summary-block">
          <span class="summary-label">Budgeted</span>
          <span class="summary-value">{{ formatCurrency(totals.budgeted, currency) }}</span>
        </div>
        <div class="summary-block">
          <span class="summary-label">Spent</span>
          <span class="summary-value">{{ formatCurrency(totals.spent, currency) }}</span>
        </div>
        <div class="summary-block">
          <span class="summary-label">{{ remaining >= 0 ? 'Remaining' : 'Over' }}</span>
          <span class="summary-value" :class="remaining >= 0 ? 'is-positive' : 'is-negative'">
            {{ formatCurrency(Math.abs(remaining), currency) }}
          </span>
        </div>
      </div>

      <p class="budget-overall" :class="{ 'is-warning': overallPercentage >= 80 }">
        {{ overallPercentage }}% of the monthly envelope used
        <template v-if="exceededCount > 0">
          · {{ exceededCount }} {{ exceededCount === 1 ? 'category' : 'categories' }} over limit
        </template>
      </p>

      <ul class="budget-rows">
        <li v-for="utilization in utilizations" :key="utilization.budgetId" class="budget-row">
          <BudgetProgressBar
            class="budget-gauge"
            :utilization="utilization"
            :currency="currency"
            :is-past-period="isPastPeriod"
            :interactive="interactive"
            @select="emit('select', utilization)"
          />

          <button
            type="button"
            class="row-delete"
            :aria-label="`Remove ${utilization.categoryName} budget`"
            @click="emit('delete', utilization)"
          >
            <AppIcon name="trash" :size="18" />
          </button>
        </li>
      </ul>

      <AppButton class="add-budget" variant="secondary" block icon="plus" @click="emit('create')">
        Add another envelope
      </AppButton>
    </template>

    <div v-else class="budget-empty">
      <span class="empty-icon">
        <AppIcon name="target" :size="26" />
      </span>
      <h3 class="empty-title">No envelopes for this month</h3>
      <p class="empty-message">
        Set a monthly limit per expense category and the tracker will pace your spending and warn you
        before you overshoot.
      </p>
      <AppButton variant="primary" icon="plus" @click="emit('create')">Create first budget</AppButton>
    </div>
  </div>
</template>

<style scoped>
.budget-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.budget-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
  padding: var(--space-3);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.summary-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.summary-label {
  font-size: var(--font-size-2xs);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.summary-value {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
}

.summary-value.is-positive {
  color: var(--color-income);
}

.summary-value.is-negative {
  color: var(--color-expense);
}

.budget-overall {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.budget-overall.is-warning {
  color: var(--color-warning);
  font-weight: var(--font-weight-semibold);
}

.budget-rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.budget-row {
  display: flex;
  align-items: stretch;
  gap: var(--space-2);
}

.budget-gauge {
  flex: 1;
  min-width: 0;
}

.row-delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--tap-target);
  flex-shrink: 0;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  color: var(--color-text-muted);
  cursor: pointer;
}

.row-delete:active {
  background-color: var(--color-danger-soft);
  border-color: var(--color-danger);
  color: var(--color-danger);
}

.budget-empty {
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
  max-width: 38ch;
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}
</style>
