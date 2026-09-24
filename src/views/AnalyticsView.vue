<script setup lang="ts">
/**
 * Analytics: distribution and cash-flow views for one month.
 *
 * Both modes read the same month slice, so switching tabs never refetches. The
 * donut answers "where did it go", the bar chart answers "how does this month
 * compare", and the trend list gives the same numbers as text.
 */

import { computed, ref } from 'vue';
import { useLedgerStore } from '@/stores/ledgerStore';
import { useCurrency } from '@/composables/useCurrency';
import { useLedgerCalculations, type MonthlyCashFlowPoint } from '@/composables/useLedgerCalculations';
import AmountDisplay from '@/components/molecules/AmountDisplay.vue';
import AppBadge from '@/components/ui/AppBadge.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import AppSegmented from '@/components/ui/AppSegmented.vue';
import DateNavigator from '@/components/molecules/DateNavigator.vue';
import SpendingDonutChart from '@/components/features/analytics/SpendingDonutChart.vue';
import CashFlowBarChart from '@/components/features/analytics/CashFlowBarChart.vue';
import SpendingTrendsList from '@/components/features/analytics/SpendingTrendsList.vue';
import { formatCurrency } from '@/utils/money';
import { getCurrentYearMonth, getMonthBoundaries, isFutureYearMonth } from '@/utils/date';
import type { CategorySpendBreakdown } from '@/types/models';

type AnalyticsMode = 'breakdown' | 'cashflow';

const TREND_MONTHS = 6;

const ledgerStore = useLedgerStore();
const { activeCurrency } = useCurrency();
const {
  calculateFinancialSummary,
  calculateCategoryBreakdown,
  calculateTrailingCashFlow
} = useLedgerCalculations();

const mode = ref<AnalyticsMode>('breakdown');
const activeYearMonth = ref(getCurrentYearMonth());

const modeOptions: Array<{ label: string; value: AnalyticsMode }> = [
  { label: 'Category breakdown', value: 'breakdown' },
  { label: 'Cash flow', value: 'cashflow' }
];

const boundaries = computed(() => getMonthBoundaries(activeYearMonth.value));
const monthTransactions = computed(() => ledgerStore.transactionsInMonth(activeYearMonth.value));

const summary = computed(() =>
  calculateFinancialSummary(monthTransactions.value, boundaries.value.start, boundaries.value.end)
);

const breakdown = computed(() => calculateCategoryBreakdown(monthTransactions.value, ledgerStore.categories));

const topCategory = computed<CategorySpendBreakdown | undefined>(() => breakdown.value[0]);

const cashFlow = computed<MonthlyCashFlowPoint[]>(() =>
  calculateTrailingCashFlow(ledgerStore.transactions, activeYearMonth.value, TREND_MONTHS)
);

const savingsRateLabel = computed(() => `${Math.round(summary.value.savingsRate * 100)}%`);
const hasMonthActivity = computed(() => monthTransactions.value.length > 0);
const isCurrentMonth = computed(() => activeYearMonth.value === getCurrentYearMonth());
const isFutureMonth = computed(() => isFutureYearMonth(activeYearMonth.value));

const averageDailySpend = computed(() => {
  const daysWithActivity = new Set(monthTransactions.value.filter((t) => t.type === 'expense').map((t) => t.date)).size;
  if (daysWithActivity === 0) return 0;
  return Math.round(summary.value.totalExpense / daysWithActivity);
});

const biggestExpense = computed(() => {
  const expenses = monthTransactions.value.filter((transaction) => transaction.type === 'expense');
  return expenses.reduce<number>((max, transaction) => Math.max(max, transaction.amount), 0);
});

const handleSegmentChange = (value: string | number): void => {
  mode.value = value as AnalyticsMode;
};

const handleTrendSelect = (yearMonth: string): void => {
  activeYearMonth.value = yearMonth;
  mode.value = 'cashflow';
};
</script>

<template>
  <div class="analytics">
    <section class="period-card" aria-labelledby="analytics-period">
      <div class="period-head">
        <h2 id="analytics-period" class="period-title">Period</h2>
        <DateNavigator
          v-model="activeYearMonth"
          mode="month"
          :max="getCurrentYearMonth()"
          :disable-forward="isCurrentMonth"
          label="Analytics month"
        />
      </div>

      <p v-if="isFutureMonth" class="period-note">
        This month is in the future, so there is nothing to analyse yet.
      </p>

      <div class="period-figures">
        <div class="figure-cell">
          <span class="figure-label">Income</span>
          <AmountDisplay :amount="summary.totalIncome" :currency="activeCurrency" tone="income" size="md" />
        </div>
        <div class="figure-cell">
          <span class="figure-label">Expenses</span>
          <AmountDisplay :amount="summary.totalExpense" :currency="activeCurrency" tone="expense" size="md" />
        </div>
        <div class="figure-cell">
          <span class="figure-label">Net savings</span>
          <AmountDisplay
            :amount="Math.abs(summary.netSavings)"
            :currency="activeCurrency"
            :tone="summary.netSavings >= 0 ? 'income' : 'expense'"
            size="md"
          />
        </div>
        <div class="figure-cell">
          <span class="figure-label">Savings rate</span>
          <AppBadge :variant="summary.savingsRate >= 0.2 ? 'success' : summary.savingsRate > 0 ? 'warning' : 'neutral'" size="md">
            {{ savingsRateLabel }}
          </AppBadge>
        </div>
      </div>
    </section>

    <AppSegmented
      :model-value="mode"
      :options="modeOptions"
      label="Analytics view"
      @update:model-value="handleSegmentChange"
    />

    <section v-if="mode === 'breakdown'" class="panel" aria-labelledby="breakdown-heading">
      <div class="panel-head">
        <h2 id="breakdown-heading" class="panel-title">Where the money went</h2>
        <p v-if="topCategory && hasMonthActivity" class="panel-subtitle">
          Biggest category: {{ topCategory.categoryName }} ({{ topCategory.percentageOfTotal.toFixed(1) }}%)
        </p>
      </div>

      <SpendingDonutChart
        :segments="breakdown"
        :currency="activeCurrency"
        :center-value="undefined"
        center-label="Total spent"
      />

      <div v-if="hasMonthActivity" class="stats-grid">
        <div class="stat-cell">
          <span class="stat-label">Average per active day</span>
          <span class="stat-value">{{ formatCurrency(averageDailySpend, activeCurrency) }}</span>
        </div>
        <div class="stat-cell">
          <span class="stat-label">Largest single expense</span>
          <span class="stat-value">{{ formatCurrency(biggestExpense, activeCurrency) }}</span>
        </div>
        <div class="stat-cell">
          <span class="stat-label">Expense entries</span>
          <span class="stat-value">{{ monthTransactions.filter((t) => t.type === 'expense').length }}</span>
        </div>
        <div class="stat-cell">
          <span class="stat-label">Categories used</span>
          <span class="stat-value">{{ breakdown.length }}</span>
        </div>
      </div>
    </section>

    <section v-else class="panel" aria-labelledby="cashflow-heading">
      <div class="panel-head">
        <h2 id="cashflow-heading" class="panel-title">Cash flow over time</h2>
        <p class="panel-subtitle">Trailing {{ TREND_MONTHS }} months, in {{ activeCurrency }}</p>
      </div>

      <CashFlowBarChart :points="cashFlow" :currency="activeCurrency" />

      <div class="trends-head">
        <AppIcon name="trending-up" :size="16" />
        <span class="trends-title">Month-by-month trend</span>
      </div>

      <SpendingTrendsList
        :points="cashFlow"
        :currency="activeCurrency"
        :selected-year-month="activeYearMonth"
        @select="handleTrendSelect"
      />
    </section>
  </div>
</template>

<style scoped>
.analytics {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.period-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
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
  color: var(--color-warning);
}

.period-figures {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

.figure-cell {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.figure-label {
  font-size: var(--font-size-2xs);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-4);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
}

.panel-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.panel-title {
  margin: 0;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
}

.panel-subtitle {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}

.stat-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-2) var(--space-3);
  background-color: var(--color-surface-sunken);
  border-radius: var(--radius-md);
}

.stat-label {
  font-size: var(--font-size-2xs);
  color: var(--color-text-muted);
}

.stat-value {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
}

.trends-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-secondary);
}

.trends-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
}
</style>
