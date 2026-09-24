<script setup lang="ts">
/**
 * Dashboard: monthly position at a glance.
 *
 * Composition order follows what a user checks first — net position, this
 * month's flow, the burn-down against the month's envelopes, budget alerts, then
 * the most recent entries.
 */

import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useLedgerStore } from '@/stores/ledgerStore';
import { useCurrency } from '@/composables/useCurrency';
import { useLedgerCalculations } from '@/composables/useLedgerCalculations';
import { useHaptics } from '@/composables/useHaptics';
import AmountDisplay from '@/components/molecules/AmountDisplay.vue';
import BudgetProgressBar from '@/components/molecules/BudgetProgressBar.vue';
import DateNavigator from '@/components/molecules/DateNavigator.vue';
import TransactionList from '@/components/features/transactions/TransactionList.vue';
import AppBadge from '@/components/ui/AppBadge.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import { db } from '@/services/db';
import {
  getCurrentYearMonth,
  getDayOfMonth,
  getDaysInMonth,
  getMonthBoundaries,
  isFutureYearMonth
} from '@/utils/date';

import type { Transaction } from '@/types/models';

const router = useRouter();
const ledgerStore = useLedgerStore();
const haptics = useHaptics();
const { formatCurrency, activeCurrency } = useCurrency();
const {
  calculateFinancialSummary,
  calculateBudgetUtilization,
  calculateDailySpending
} = useLedgerCalculations();

const activeYearMonth = ref(getCurrentYearMonth());
const receiptIds = ref<Set<string>>(new Set());

const loadReceiptIds = async (): Promise<void> => {
  try {
    const receipts = await db.receipts.toArray();
    receiptIds.value = new Set(receipts.map((receipt) => receipt.transactionId));
  } catch {
    receiptIds.value = new Set();
  }
};

void loadReceiptIds();

const boundaries = computed(() => getMonthBoundaries(activeYearMonth.value));
const monthTransactions = computed(() => ledgerStore.transactionsInMonth(activeYearMonth.value));

const summary = computed(() =>
  calculateFinancialSummary(monthTransactions.value, boundaries.value.start, boundaries.value.end)
);

const savingsRateLabel = computed(() => `${Math.round(summary.value.savingsRate * 100)}%`);

const hasAnyTransaction = computed(() => ledgerStore.transactions.length > 0);
const isCurrentMonth = computed(() => activeYearMonth.value === getCurrentYearMonth());

const utilizations = computed(() =>
  calculateBudgetUtilization(
    ledgerStore.budgetsForMonth(activeYearMonth.value),
    ledgerStore.transactions,
    ledgerStore.categories,
    activeYearMonth.value
  )
);

const budgetAlerts = computed(() =>
  utilizations.value.filter((utilization) => utilization.utilizationPercentage >= 80).slice(0, 3)
);

const totalBudgeted = computed(() =>
  utilizations.value.reduce((total, utilization) => total + utilization.budgetAmount, 0)
);

/* --------------------------------- burn-down -------------------------------- */

interface BurnDown {
  linePath: string;
  areaPath: string;
  pacePath: string;
  todayX: number;
  hasData: boolean;
}

const burnDown = computed<BurnDown>(() => {
  const series = calculateDailySpending(monthTransactions.value, activeYearMonth.value);
  const days = series.length;

  if (days === 0) {
    return { linePath: '', areaPath: '', pacePath: '', todayX: 0, hasData: false };
  }

  let cumulative = 0;
  const cumulativeSeries = series.map((point) => {
    cumulative += point.total;
    return { day: getDayOfMonth(point.date), cumulative };
  });

  const totalSpent = cumulative;
  const plannedTotal = totalBudgeted.value > 0 ? totalBudgeted.value : totalSpent;
  const scaleMax = Math.max(plannedTotal, totalSpent, 1);
  const xFor = (index: number): number => (days === 1 ? 0 : (index / (days - 1)) * 100);
  const yFor = (value: number): number => 100 - (value / scaleMax) * 100;

  const linePath = cumulativeSeries
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(index).toFixed(2)} ${yFor(point.cumulative).toFixed(2)}`)
    .join(' ');

  const areaPath = `${linePath} L 100 100 L 0 100 Z`;
  const pacePath = `M 0 ${yFor(plannedTotal).toFixed(2)} L 100 ${yFor(plannedTotal).toFixed(2)}`;

  // Marker for where "today" sits inside the month (end of month for past months).
  const referenceDay = isCurrentMonth.value ? Math.min(new Date().getDate(), days) : days;
  const todayX = days > 1 ? ((referenceDay - 1) / (days - 1)) * 100 : 0;

  return { linePath, areaPath, pacePath, todayX, hasData: totalSpent > 0 };
});

const projectedTotal = computed(() => {
  if (!isCurrentMonth.value) return summary.value.totalExpense;

  const daysElapsed = Math.max(new Date().getDate(), 1);
  const daysInMonth = getDaysInMonth(activeYearMonth.value);
  return Math.round((summary.value.totalExpense / daysElapsed) * daysInMonth);
});

const burnDownCaption = computed(() => {
  if (!burnDown.value.hasData) return 'No expenses recorded in this month yet.';
  if (totalBudgeted.value > 0) {
    return `Spent ${formatCurrency(summary.value.totalExpense, activeCurrency.value)} of ${formatCurrency(totalBudgeted.value, activeCurrency.value)} budgeted · projected ${formatCurrency(projectedTotal.value, activeCurrency.value)}`;
  }
  return `Spent ${formatCurrency(summary.value.totalExpense, activeCurrency.value)} · projected ${formatCurrency(projectedTotal.value, activeCurrency.value)} this month`;
});

/* --------------------------------- actions --------------------------------- */

const recentTransactions = computed(() => ledgerStore.sortedTransactions.slice(0, 5));

const openQuickAdd = (): void => {
  void router.push({ name: 'entry' });
};

const openLedger = (): void => {
  haptics.trigger('selection');
  void router.push('/transactions');
};

const openBudgets = (): void => {
  haptics.trigger('selection');
  void router.push('/budgets');
};

/** A recent entry jumps straight into the ledger, fully scrolled to the row. */
const openTransaction = (transaction: Transaction): void => {
  haptics.trigger('selection');
  void router.push({ path: '/transactions', query: { focus: transaction.id } });
};

const isBrowsingPastMonth = computed(
  () => !isCurrentMonth.value && !isFutureYearMonth(activeYearMonth.value)
);
</script>

<template>
  <div class="dashboard">
    <section class="position-card" aria-labelledby="position-heading">
      <div class="position-head">
        <h2 id="position-heading" class="position-label">Net position</h2>
        <AppBadge :variant="ledgerStore.netWorth >= 0 ? 'success' : 'danger'" size="sm">
          {{ activeCurrency }}
        </AppBadge>
      </div>

      <AmountDisplay :amount="ledgerStore.netWorth" size="hero" tone="neutral" />

      <div class="position-figures">
        <div class="figure">
          <span class="figure-label">Active accounts</span>
          <span class="figure-value">{{ ledgerStore.activeAccounts.length }}</span>
        </div>
        <div class="figure">
          <span class="figure-label">Entries</span>
          <span class="figure-value">{{ ledgerStore.transactions.length }}</span>
        </div>
      </div>
    </section>

    <section class="month-section" aria-labelledby="month-heading">
      <div class="section-head">
        <h2 id="month-heading" class="section-title">This month</h2>
        <DateNavigator
          v-model="activeYearMonth"
          mode="month"
          :max="getCurrentYearMonth()"
          label="Dashboard month"
        />
      </div>

      <p v-if="isBrowsingPastMonth" class="forward-hint">
        Browsing a past month. Use the arrow to return to the current month.
      </p>

      <div class="summary-grid">
        <div class="summary-cell">
          <span class="summary-label">Income</span>
          <AmountDisplay :amount="summary.totalIncome" :currency="activeCurrency" tone="income" size="md" />
        </div>
        <div class="summary-cell">
          <span class="summary-label">Expenses</span>
          <AmountDisplay :amount="summary.totalExpense" :currency="activeCurrency" tone="expense" size="md" />
        </div>
        <div class="summary-cell">
          <span class="summary-label">{{ summary.netSavings >= 0 ? 'Saved' : 'Overspent' }}</span>
          <AmountDisplay
            :amount="Math.abs(summary.netSavings)"
            :currency="activeCurrency"
            :tone="summary.netSavings >= 0 ? 'income' : 'expense'"
            size="md"
          />
        </div>
        <div class="summary-cell">
          <span class="summary-label">Savings rate</span>
          <span class="summary-rate">{{ savingsRateLabel }}</span>
        </div>
      </div>

      <div class="burndown-card">
        <div class="burndown-head">
          <span class="burndown-title">Daily burn-down</span>
          <span class="burndown-caption">{{ burnDownCaption }}</span>
        </div>

        <svg
          v-if="burnDown.hasData"
          class="burndown-svg"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          role="img"
          aria-label="Cumulative spending across the month"
        >
          <path class="pace-path" :d="burnDown.pacePath" vector-effect="non-scaling-stroke" />
          <path class="area-path" :d="burnDown.areaPath" />
          <path class="line-path" :d="burnDown.linePath" vector-effect="non-scaling-stroke" />
          <line
            v-if="isCurrentMonth"
            class="today-line"
            :x1="burnDown.todayX"
            y1="0"
            :x2="burnDown.todayX"
            y2="100"
            vector-effect="non-scaling-stroke"
          />
        </svg>

        <p v-else class="burndown-empty">
          Nothing spent yet this month. Add an expense to start the chart.
        </p>
      </div>
    </section>

    <section v-if="budgetAlerts.length > 0" class="alerts-section" aria-labelledby="alerts-heading">
      <div class="section-head">
        <h2 id="alerts-heading" class="section-title">
          <AppIcon name="alert-circle" :size="16" />
          Budget alerts
        </h2>
        <button type="button" class="link-button" @click="openBudgets">Manage</button>
      </div>

      <ul class="alert-list">
        <li v-for="utilization in budgetAlerts" :key="utilization.budgetId">
          <BudgetProgressBar :utilization="utilization" :currency="activeCurrency" @select="openBudgets" />
        </li>
      </ul>
    </section>

    <section class="recent-section" aria-labelledby="recent-heading">
      <div class="section-head">
        <h2 id="recent-heading" class="section-title">Recent transactions</h2>
        <button v-if="hasAnyTransaction" type="button" class="link-button" @click="openLedger">
          View all
        </button>
      </div>

      <TransactionList
        :transactions="recentTransactions"
        :currency="activeCurrency"
        :category-by-id="ledgerStore.categoryById"
        :account-by-id="ledgerStore.accountById"
        :receipt-transaction-ids="receiptIds"
        :loading="!ledgerStore.isReady"
        :can-manage="false"
        empty-title="Your ledger is empty"
        empty-message="Record your first transaction and the dashboard will start tracking your position, pace and budgets."
        @select="openTransaction"
        @create="openQuickAdd"
      />

      <AppButton v-if="hasAnyTransaction" class="quick-add" variant="primary" block icon="plus" @click="openQuickAdd">
        Add transaction
      </AppButton>
    </section>
  </div>
</template>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

/* ------------------------------ position card ----------------------------- */
.position-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-5);
  background: linear-gradient(135deg, var(--color-primary-soft), var(--color-surface));
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
}

.position-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.position-label {
  margin: 0;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.position-figures {
  display: flex;
  gap: var(--space-5);
}

.figure {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.figure-label {
  font-size: var(--font-size-2xs);
  color: var(--color-text-muted);
}

.figure-value {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
}

/* -------------------------------- sections -------------------------------- */
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.section-title {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  margin: 0;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
}

.link-button {
  min-height: var(--tap-target);
  padding: 0 var(--space-2);
  background: transparent;
  border: none;
  color: var(--color-primary);
  font-family: inherit;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
}

.month-section,
.alerts-section,
.recent-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.forward-hint {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}

.summary-cell {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
  padding: var(--space-3);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.summary-label {
  font-size: var(--font-size-2xs);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.summary-rate {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
}

/* -------------------------------- burn-down ------------------------------- */
.burndown-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.burndown-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.burndown-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.burndown-caption {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.burndown-svg {
  width: 100%;
  height: 120px;
  overflow: visible;
}

.area-path {
  fill: var(--color-primary-soft);
  opacity: 0.7;
}

.line-path {
  fill: none;
  stroke: var(--color-primary);
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.pace-path {
  fill: none;
  stroke: var(--color-border-strong);
  stroke-width: 1.5;
  stroke-dasharray: 4 4;
}

.today-line {
  stroke: var(--color-expense);
  stroke-width: 1.5;
  stroke-dasharray: 3 3;
  opacity: 0.7;
}

.burndown-empty {
  margin: 0;
  padding: var(--space-4);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  text-align: center;
}

.alert-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.quick-add {
  margin-top: var(--space-1);
}
</style>
