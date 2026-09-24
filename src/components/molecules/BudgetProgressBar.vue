<script setup lang="ts">
/**
 * Envelope pacing indicator.
 *
 * Three-tier colour thresholds (<80% normal, 80–99% warning, >=100% exceeded)
 * are paired with an explicit textual status so the signal never depends on
 * colour alone. The projected daily allowance communicates what is still safe to
 * spend today; closed periods report zero and say so.
 */

import { computed } from 'vue';
import { useCurrency } from '@/composables/useCurrency';
import AppBadge from '@/components/ui/AppBadge.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import type { BudgetUtilization } from '@/types/models';

type BudgetStatus = 'normal' | 'warning' | 'exceeded';

interface Props {
  utilization: BudgetUtilization;
  currency?: string;
  /** Closes the projection for months that have already ended. */
  isPastPeriod?: boolean;
  /** Renders a chevron and makes the whole card actionable. */
  interactive?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  currency: undefined,
  isPastPeriod: false,
  interactive: false
});

const emit = defineEmits<{ (event: 'select', utilization: BudgetUtilization): void }>();

const { formatCurrency } = useCurrency();

const status = computed<BudgetStatus>(() => {
  if (props.utilization.isExceeded || props.utilization.utilizationPercentage >= 100) return 'exceeded';
  if (props.utilization.utilizationPercentage >= 80) return 'warning';
  return 'normal';
});

const statusLabel = computed(() => {
  switch (status.value) {
    case 'exceeded':
      return 'Over budget';
    case 'warning':
      return 'Nearing limit';
    default:
      return 'On track';
  }
});

const statusVariant = computed(() => {
  switch (status.value) {
    case 'exceeded':
      return 'danger' as const;
    case 'warning':
      return 'warning' as const;
    default:
      return 'success' as const;
  }
});

/** Fill percentage, clamped for rendering while the true value stays exact. */
const fillPercentage = computed(() => Math.min(100, Math.max(0, props.utilization.utilizationPercentage)));

const percentageLabel = computed(() => {
  const rounded = Math.round(props.utilization.utilizationPercentage);
  return `${rounded}%`;
});

const spentLabel = computed(
  () => `${formatCurrency(props.utilization.actualSpent, props.currency)} of ${formatCurrency(props.utilization.budgetAmount, props.currency)}`
);

const remainingLabel = computed(() => {
  const remaining = props.utilization.remainingAmount;
  if (remaining >= 0) return `${formatCurrency(remaining, props.currency)} left`;
  return `${formatCurrency(Math.abs(remaining), props.currency)} over`;
});

const projectionLabel = computed(() => {
  if (props.isPastPeriod) return 'Period closed';
  if (status.value === 'exceeded') return 'No allowance left';
  return `${formatCurrency(props.utilization.projectedDailyAllowance, props.currency)}/day left`;
});

const progressLabel = computed(
  () => `${props.utilization.categoryName}: ${percentageLabel.value} of the monthly envelope used`
);

const handleSelect = (): void => {
  if (!props.interactive) return;
  emit('select', props.utilization);
};
</script>

<template>
  <div class="budget-card" :class="[`status-${status}`, { interactive }]">
    <div class="budget-header">
      <div class="budget-heading">
        <span class="budget-name">{{ utilization.categoryName }}</span>
        <span class="budget-spent">{{ spentLabel }}</span>
      </div>

      <div class="budget-status">
        <AppBadge :variant="statusVariant" size="sm">{{ statusLabel }}</AppBadge>
        <AppIcon v-if="interactive" name="chevron-right" :size="16" />
      </div>
    </div>

    <div
      class="budget-track"
      role="progressbar"
      :aria-label="progressLabel"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="fillPercentage"
    >
      <span class="budget-fill" :style="{ width: `${fillPercentage}%` }" />
    </div>

    <div class="budget-meta">
      <span class="budget-percentage">{{ percentageLabel }}</span>
      <span class="budget-remaining">{{ remainingLabel }}</span>
      <span class="budget-projection">{{ projectionLabel }}</span>
    </div>

    <button
      v-if="interactive"
      type="button"
      class="budget-hit-area"
      :aria-label="`Open ${utilization.categoryName} budget`"
      @click="handleSelect"
    />
  </div>
</template>

<style scoped>
.budget-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.budget-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-2);
}

.budget-heading {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.budget-name {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.budget-spent {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.budget-status {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  flex-shrink: 0;
  color: var(--color-text-muted);
}

.budget-track {
  position: relative;
  height: 8px;
  border-radius: var(--radius-pill);
  background-color: var(--color-surface-sunken);
  overflow: hidden;
}

.budget-fill {
  display: block;
  height: 100%;
  border-radius: var(--radius-pill);
  background-color: var(--color-success);
  transition: width var(--duration-base) var(--ease-decelerate);
}

.status-warning .budget-fill {
  background-color: var(--color-warning);
}

.status-exceeded .budget-fill {
  background-color: var(--color-danger);
}

.budget-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  font-size: var(--font-size-2xs);
  color: var(--color-text-muted);
}

.budget-percentage {
  font-weight: var(--font-weight-bold);
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}

.budget-remaining {
  font-variant-numeric: tabular-nums;
}

.budget-projection {
  font-weight: var(--font-weight-semibold);
  font-variant-numeric: tabular-nums;
}

.status-exceeded .budget-projection {
  color: var(--color-danger);
}

.budget-hit-area {
  position: absolute;
  inset: 0;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: var(--radius-lg);
  cursor: pointer;
}

.budget-hit-area:active {
  background-color: var(--color-surface-sunken);
  opacity: 0.35;
}

@media (prefers-reduced-motion: reduce) {
  .budget-fill {
    transition: none;
  }
}
</style>
