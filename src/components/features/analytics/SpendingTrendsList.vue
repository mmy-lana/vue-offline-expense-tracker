<script setup lang="ts">
/**
 * Text-first spending trend list.
 *
 * Complements the SVG charts with a screen-reader-friendly, scroll-free summary:
 * one row per month with the expense total, the change against the previous
 * month and a proportional bar. Selecting a row lets a parent screen jump to
 * that month.
 */

import { computed } from 'vue';
import { useCurrency } from '@/composables/useCurrency';
import { useHaptics } from '@/composables/useHaptics';
import AmountDisplay from '@/components/molecules/AmountDisplay.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import { formatYearMonthCompactLabel } from '@/utils/date';
import type { MonthlyCashFlowPoint } from '@/composables/useLedgerCalculations';

interface Props {
  /** Ordered oldest to newest. */
  points: readonly MonthlyCashFlowPoint[];
  currency?: string;
  /** Highlights the month currently open elsewhere on the screen. */
  selectedYearMonth?: string;
  /** Rows become buttons that emit `select`. */
  interactive?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  currency: undefined,
  selectedYearMonth: undefined,
  interactive: true
});

const emit = defineEmits<{ (event: 'select', yearMonth: string): void }>();

const { formatCurrency } = useCurrency();
const haptics = useHaptics();

interface TrendRow {
  yearMonth: string;
  label: string;
  expense: number;
  expenseLabel: string;
  net: number;
  changePercentage: number | null;
  changeDirection: 'up' | 'down' | 'flat';
  barWidth: number;
  isSelected: boolean;
  savingsRate: number;
}

const maxExpense = computed(() =>
  props.points.reduce((max, point) => Math.max(max, point.expense), 0)
);

/** Newest first: trends read top-down from the most recent month. */
const rows = computed<TrendRow[]>(() => {
  const ordered = props.points.slice().reverse();

  return ordered.map((point, index) => {
    const previous = ordered[index + 1];
    const changePercentage =
      previous && previous.expense > 0
        ? Math.round(((point.expense - previous.expense) / previous.expense) * 1000) / 10
        : null;

    const changeDirection: TrendRow['changeDirection'] =
      changePercentage === null || changePercentage === 0
        ? 'flat'
        : changePercentage > 0
          ? 'up'
          : 'down';

    return {
      yearMonth: point.yearMonth,
      label: formatYearMonthCompactLabel(point.yearMonth),
      expense: point.expense,
      expenseLabel: formatCurrency(point.expense, props.currency),
      net: point.net,
      changePercentage,
      changeDirection,
      barWidth: maxExpense.value > 0 ? Math.max((point.expense / maxExpense.value) * 100, 2) : 0,
      isSelected: props.selectedYearMonth === point.yearMonth,
      savingsRate: point.income > 0 ? Math.max(0, Math.round((point.net / point.income) * 100)) : 0
    };
  });
});

const isEmpty = computed(() => props.points.length === 0);

const changeLabel = (row: TrendRow): string => {
  if (row.changePercentage === null) return 'No prior month';
  if (row.changeDirection === 'flat') return 'No change';
  const sign = row.changeDirection === 'up' ? '+' : '−';
  return `${sign}${Math.abs(row.changePercentage)}% vs prev.`;
};

const handleSelect = (row: TrendRow): void => {
  if (!props.interactive) return;
  haptics.trigger('selection');
  emit('select', row.yearMonth);
};
</script>

<template>
  <div class="trends">
    <ul v-if="!isEmpty" class="trend-list">
      <li v-for="row in rows" :key="row.yearMonth" class="trend-row">
        <component
          :is="interactive ? 'button' : 'div'"
          class="trend-surface"
          :class="{ 'is-selected': row.isSelected }"
          :type="interactive ? 'button' : undefined"
          :aria-label="interactive ? `Show ${row.label}` : undefined"
          @click="handleSelect(row)"
        >
          <span class="trend-head">
            <span class="trend-month">{{ row.label }}</span>
            <span
              v-if="row.changePercentage !== null"
              class="trend-change"
              :class="`change-${row.changeDirection}`"
            >
              <AppIcon
                :name="row.changeDirection === 'up' ? 'trending-up' : row.changeDirection === 'down' ? 'chevron-down' : 'minus'"
                :size="12"
              />
              {{ changeLabel(row) }}
            </span>
            <span v-else class="trend-change change-flat">{{ changeLabel(row) }}</span>
          </span>

          <span class="trend-bar" aria-hidden="true">
            <span class="trend-bar-fill" :style="{ width: `${row.barWidth}%` }" />
          </span>

          <span class="trend-figures">
            <AmountDisplay :amount="row.expense" :currency="currency" tone="expense" size="sm" />
            <span class="trend-net" :class="row.net >= 0 ? 'net-positive' : 'net-negative'">
              {{ row.net >= 0 ? 'Saved' : 'Overspent' }} {{ formatCurrency(Math.abs(row.net), currency) }}
              <template v-if="row.savingsRate > 0">· {{ row.savingsRate }}%</template>
            </span>
          </span>
        </component>
      </li>
    </ul>

    <p v-else class="trends-empty">
      No monthly history to trend yet. Once transactions span a month, comparisons appear here.
    </p>
  </div>
</template>

<style scoped>
.trends {
  width: 100%;
}

.trend-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.trend-surface {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
  min-height: var(--tap-target);
  padding: var(--space-3);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

div.trend-surface {
  cursor: default;
}

.trend-surface.is-selected {
  border-color: var(--color-primary);
  background-color: var(--color-primary-soft);
}

.trend-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.trend-month {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.trend-change {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: var(--font-size-2xs);
  font-weight: var(--font-weight-semibold);
  font-variant-numeric: tabular-nums;
}

.change-up {
  color: var(--color-danger);
}

.change-down {
  color: var(--color-success);
}

.change-flat {
  color: var(--color-text-muted);
}

.trend-bar {
  display: block;
  height: 6px;
  border-radius: var(--radius-pill);
  background-color: var(--color-surface-sunken);
  overflow: hidden;
}

.trend-bar-fill {
  display: block;
  height: 100%;
  border-radius: var(--radius-pill);
  background-color: var(--color-expense);
  transition: width var(--duration-base) var(--ease-decelerate);
}

.trend-figures {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.trend-net {
  font-size: var(--font-size-2xs);
  font-weight: var(--font-weight-medium);
  font-variant-numeric: tabular-nums;
}

.net-positive {
  color: var(--color-income);
}

.net-negative {
  color: var(--color-expense);
}

.trends-empty {
  margin: 0;
  padding: var(--space-4);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  text-align: center;
}

@media (prefers-reduced-motion: reduce) {
  .trend-bar-fill {
    transition: none;
  }
}
</style>
