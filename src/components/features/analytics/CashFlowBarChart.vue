<script setup lang="ts">
/**
 * Income vs expense comparison bars (pure SVG).
 *
 * One group per month bucket; the chart is sized from the data (never squeezed),
 * so on phones <= 430px it scrolls horizontally instead of distorting. Tapping a
 * group selects it, and the selection summary above the chart carries the exact
 * figures — the bars themselves are decorative with an accessible summary label.
 */

import { computed, ref, watch } from 'vue';
import { useCurrency } from '@/composables/useCurrency';
import { useHaptics } from '@/composables/useHaptics';
import AppIcon from '@/components/ui/AppIcon.vue';
import { formatYearMonthCompactLabel, formatYearMonthShortLabel } from '@/utils/date';
import type { MonthlyCashFlowPoint } from '@/composables/useLedgerCalculations';

interface Props {
  /** Ordered oldest to newest. */
  points: readonly MonthlyCashFlowPoint[];
  currency?: string;
  /** Plot height in px (excluding the label row). */
  height?: number;
  barWidth?: number;
  groupGap?: number;
  interactive?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  currency: undefined,
  height: 160,
  barWidth: 16,
  groupGap: 20,
  interactive: true
});

const emit = defineEmits<{ (event: 'select', point: MonthlyCashFlowPoint): void }>();

const { formatCurrency } = useCurrency();
const haptics = useHaptics();

const AXIS_HEIGHT = 26;
const TOP_PADDING = 12;

const activeIndex = ref<number>(Math.max(props.points.length - 1, 0));

watch(
  () => props.points.length,
  (length) => {
    activeIndex.value = Math.max(length - 1, 0);
  }
);

const groupWidth = computed(() => props.barWidth * 2 + 10);
const chartWidth = computed(() =>
  Math.max(props.points.length * (groupWidth.value + props.groupGap) + props.groupGap, 120)
);
/**
 * The outer SVG height is clamped too, not just the plot area: a negative or
 * zero `height` prop would otherwise emit `<svg height="-30">`, which browsers
 * reject as invalid geometry and log a warning for.
 */
const svgHeight = computed(() => Math.max(0, props.height));
const plotHeight = computed(() => Math.max(0, svgHeight.value - AXIS_HEIGHT - TOP_PADDING));

const maxValue = computed(() =>
  props.points.reduce((max, point) => Math.max(max, point.income, point.expense), 0)
);

const isEmpty = computed(() => props.points.length === 0 || maxValue.value === 0);

const activePoint = computed<MonthlyCashFlowPoint | null>(() => props.points[activeIndex.value] ?? null);

const barHeight = (value: number): number => {
  if (maxValue.value <= 0) return 0;
  return Math.max((value / maxValue.value) * plotHeight.value, value > 0 ? 2 : 0);
};

interface BarGroup {
  point: MonthlyCashFlowPoint;
  index: number;
  x: number;
  incomeHeight: number;
  expenseHeight: number;
  label: string;
  isActive: boolean;
}

const groups = computed<BarGroup[]>(() =>
  props.points.map((point, index) => ({
    point,
    index,
    x: props.groupGap + index * (groupWidth.value + props.groupGap),
    incomeHeight: barHeight(point.income),
    expenseHeight: barHeight(point.expense),
    label: formatYearMonthShortLabel(point.yearMonth),
    isActive: index === activeIndex.value
  }))
);

const baselineY = computed(() => TOP_PADDING + plotHeight.value);

const chartLabel = computed(() => {
  if (isEmpty.value) return 'Cash flow chart: no activity recorded for this period';
  return props.points
    .map(
      (point) =>
        `${formatYearMonthCompactLabel(point.yearMonth)}: income ${formatCurrency(point.income, props.currency)}, expenses ${formatCurrency(point.expense, props.currency)}`
    )
    .join('. ');
});

const selectGroup = (index: number): void => {
  if (!props.interactive) return;

  haptics.trigger('selection');
  activeIndex.value = index;

  const point = props.points[index];
  if (point) emit('select', point);
};
</script>

<template>
  <div class="cashflow">
    <div v-if="activePoint" class="cashflow-summary">
      <div class="summary-period">
        <span class="summary-month">{{ formatYearMonthCompactLabel(activePoint.yearMonth) }}</span>
        <span
          class="summary-net"
          :class="activePoint.net >= 0 ? 'net-positive' : 'net-negative'"
        >{{ activePoint.net >= 0 ? 'Surplus' : 'Deficit' }}
          {{ formatCurrency(Math.abs(activePoint.net), currency) }}</span
        >
      </div>

      <div class="summary-figures">
        <span class="figure">
          <AppIcon name="trending-up" :size="14" color="var(--color-income)" />
          <span class="figure-value">{{ formatCurrency(activePoint.income, currency) }}</span>
        </span>
        <span class="figure">
          <AppIcon name="minus" :size="14" color="var(--color-expense)" />
          <span class="figure-value">{{ formatCurrency(activePoint.expense, currency) }}</span>
        </span>
      </div>
    </div>

    <div class="cashflow-scroll">
      <svg
        class="cashflow-svg"
        :width="chartWidth"
        :height="svgHeight"
        :viewBox="`0 0 ${chartWidth} ${svgHeight}`"
        role="img"
        :aria-label="chartLabel"
      >
        <line
          class="axis-line"
          :x1="0"
          :y1="baselineY"
          :x2="chartWidth"
          :y2="baselineY"
        />

        <template v-for="group in groups" :key="group.point.yearMonth">
          <rect
            class="bar bar-income"
            :class="{ 'is-dimmed': !group.isActive }"
            :x="group.x"
            :y="baselineY - group.incomeHeight"
            :width="barWidth"
            :height="group.incomeHeight"
            rx="4"
          />
          <rect
            class="bar bar-expense"
            :class="{ 'is-dimmed': !group.isActive }"
            :x="group.x + barWidth + 6"
            :y="baselineY - group.expenseHeight"
            :width="barWidth"
            :height="group.expenseHeight"
            rx="4"
          />

          <rect
            v-if="interactive"
            class="bar-hit"
            :x="group.x - 6"
            :y="TOP_PADDING"
            :width="groupWidth + 12"
            :height="plotHeight"
            @click="selectGroup(group.index)"
          />

          <text class="axis-label" :x="group.x + groupWidth / 2" :y="baselineY + 18" text-anchor="middle">
            {{ group.label }}
          </text>
        </template>
      </svg>
    </div>

    <p v-if="isEmpty" class="cashflow-empty">
      No income or expenses recorded in the trailing months yet.
    </p>

    <ul v-else class="cashflow-legend">
      <li class="legend-key"><span class="key-swatch key-income" aria-hidden="true" />Income</li>
      <li class="legend-key"><span class="key-swatch key-expense" aria-hidden="true" />Expenses</li>
    </ul>
  </div>
</template>

<style scoped>
.cashflow {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  width: 100%;
  min-width: 0;
}

.cashflow-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background-color: var(--color-surface-sunken);
  border-radius: var(--radius-md);
}

.summary-period {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.summary-month {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.summary-net {
  font-size: var(--font-size-2xs);
  font-weight: var(--font-weight-semibold);
  font-variant-numeric: tabular-nums;
}

.net-positive {
  color: var(--color-income);
}

.net-negative {
  color: var(--color-expense);
}

.summary-figures {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.figure {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

.figure-value {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
}

.cashflow-scroll {
  width: 100%;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
}

.cashflow-svg {
  display: block;
}

.axis-line {
  stroke: var(--color-border);
  stroke-width: 1;
}

.axis-label {
  fill: var(--color-text-muted);
  font-size: 10px;
  font-weight: 600;
}

.bar {
  transform-origin: bottom;
  transition:
    opacity var(--duration-fast) var(--ease-standard),
    y var(--duration-base) var(--ease-decelerate),
    height var(--duration-base) var(--ease-decelerate);
}

.bar-income {
  fill: var(--color-income);
}

.bar-expense {
  fill: var(--color-expense);
}

.bar.is-dimmed {
  opacity: 0.4;
}

.bar-hit {
  fill: transparent;
  cursor: pointer;
}

.cashflow-legend {
  display: flex;
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.legend-key {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--font-size-2xs);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-muted);
}

.key-swatch {
  width: 10px;
  height: 10px;
  border-radius: 3px;
}

.key-income {
  background-color: var(--color-income);
}

.key-expense {
  background-color: var(--color-expense);
}

.cashflow-empty {
  margin: 0;
  padding: var(--space-4);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  text-align: center;
}

@media (prefers-reduced-motion: reduce) {
  .bar {
    transition: none;
  }
}
</style>
