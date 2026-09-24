/**
 * Pure financial aggregation engine.
 *
 * Every figure is derived from integer minor units, so aggregations cannot
 * accumulate floating-point drift. All functions are side-effect free, which
 * keeps them safe to call inside computed properties.
 */

import {
  getDaysInMonth,
  getRemainingDaysInMonth,
  getTrailingYearMonths,
  toYearMonth
} from '@/utils/date';
import type {
  Budget,
  BudgetUtilization,
  Category,
  CategorySpendBreakdown,
  FinancialSummary,
  Transaction
} from '@/types/models';

export interface DailySpendingPoint {
  date: string;
  total: number;
}

export interface MonthlyCashFlowPoint {
  yearMonth: string;
  income: number;
  expense: number;
  net: number;
}

const isExpenseInMonth = (transaction: Transaction, yearMonth: string): boolean =>
  transaction.type === 'expense' && transaction.yearMonth === yearMonth;

export function useLedgerCalculations() {
  /** Income, expense, net savings and savings rate for an inclusive period. */
  const calculateFinancialSummary = (
    transactions: readonly Transaction[],
    periodStart: string,
    periodEnd: string
  ): FinancialSummary => {
    let totalIncome = 0;
    let totalExpense = 0;

    for (const transaction of transactions) {
      if (transaction.date < periodStart || transaction.date > periodEnd) continue;

      if (transaction.type === 'income') {
        totalIncome += transaction.amount;
      } else if (transaction.type === 'expense') {
        totalExpense += transaction.amount;
      }
    }

    const netSavings = totalIncome - totalExpense;
    const savingsRate = totalIncome > 0 ? Math.max(0, netSavings / totalIncome) : 0;

    return { totalIncome, totalExpense, netSavings, savingsRate, periodStart, periodEnd };
  };

  /** Expense distribution by category, sorted by amount, with percentages. */
  const calculateCategoryBreakdown = (
    transactions: readonly Transaction[],
    categories: readonly Category[]
  ): CategorySpendBreakdown[] => {
    const expenseTransactions = transactions.filter((transaction) => transaction.type === 'expense');
    const totalExpense = expenseTransactions.reduce((total, transaction) => total + transaction.amount, 0);

    const totals = new Map<string, { total: number; count: number }>();
    for (const transaction of expenseTransactions) {
      const existing = totals.get(transaction.categoryId) ?? { total: 0, count: 0 };
      totals.set(transaction.categoryId, {
        total: existing.total + transaction.amount,
        count: existing.count + 1
      });
    }

    const categoryLookup = new Map(categories.map((category) => [category.id, category]));

    const breakdown: CategorySpendBreakdown[] = [];
    totals.forEach((data, categoryId) => {
      const category = categoryLookup.get(categoryId);

      breakdown.push({
        categoryId,
        categoryName: category?.name ?? 'Uncategorized',
        colorHex: category?.colorHex ?? '#94A3B8',
        icon: category?.icon ?? 'help-circle',
        totalSpent: data.total,
        percentageOfTotal: totalExpense > 0 ? Math.round((data.total / totalExpense) * 10000) / 100 : 0,
        transactionCount: data.count
      });
    });

    return breakdown.sort((a, b) => b.totalSpent - a.totalSpent);
  };

  /** Envelope pacing for one month, including the remaining daily allowance. */
  const calculateBudgetUtilization = (
    budgets: readonly Budget[],
    transactions: readonly Transaction[],
    categories: readonly Category[],
    targetYearMonth?: string,
    referenceDate: Date = new Date()
  ): BudgetUtilization[] => {
    const activeYearMonth = targetYearMonth ?? toYearMonth(referenceDate);
    const expenseTransactions = transactions.filter((transaction) =>
      isExpenseInMonth(transaction, activeYearMonth)
    );
    const relevantBudgets = budgets.filter((budget) => budget.yearMonth === activeYearMonth);
    const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
    const remainingDays = getRemainingDaysInMonth(activeYearMonth, referenceDate);

    return relevantBudgets
      .map((budget) => {
        const actualSpent = expenseTransactions
          .filter((transaction) => transaction.categoryId === budget.categoryId)
          .reduce((total, transaction) => total + transaction.amount, 0);

        const remainingAmount = budget.amount - actualSpent;
        const utilizationPercentage =
          budget.amount > 0 ? Math.round((actualSpent / budget.amount) * 10000) / 100 : 0;

        return {
          budgetId: budget.id,
          categoryId: budget.categoryId,
          categoryName: categoryNames.get(budget.categoryId) ?? 'Unknown Category',
          budgetAmount: budget.amount,
          actualSpent,
          remainingAmount,
          utilizationPercentage,
          isExceeded: actualSpent > budget.amount,
          projectedDailyAllowance:
            remainingAmount > 0 && remainingDays > 0 ? Math.floor(remainingAmount / remainingDays) : 0
        };
      })
      .sort((a, b) => b.utilizationPercentage - a.utilizationPercentage);
  };

  /** Per-day expense totals for a month, including zero-spend days. */
  const calculateDailySpending = (
    transactions: readonly Transaction[],
    yearMonth: string
  ): DailySpendingPoint[] => {
    const daysInMonth = getDaysInMonth(yearMonth);
    const totals = new Map<string, number>();

    for (let day = 1; day <= daysInMonth; day++) {
      totals.set(`${yearMonth}-${day.toString().padStart(2, '0')}`, 0);
    }

    for (const transaction of transactions) {
      if (!isExpenseInMonth(transaction, yearMonth)) continue;

      const current = totals.get(transaction.date);
      if (current === undefined) continue;
      totals.set(transaction.date, current + transaction.amount);
    }

    return Array.from(totals, ([date, total]) => ({ date, total }));
  };

  /** Income/expense/net per month bucket, in the order supplied. */
  const calculateMonthlyCashFlow = (
    transactions: readonly Transaction[],
    yearMonths: readonly string[]
  ): MonthlyCashFlowPoint[] => {
    const buckets = new Map<string, MonthlyCashFlowPoint>(
      yearMonths.map((yearMonth) => [yearMonth, { yearMonth, income: 0, expense: 0, net: 0 }])
    );

    for (const transaction of transactions) {
      const bucket = buckets.get(transaction.yearMonth);
      if (!bucket) continue;

      if (transaction.type === 'income') bucket.income += transaction.amount;
      else if (transaction.type === 'expense') bucket.expense += transaction.amount;
    }

    return yearMonths
      .map((yearMonth) => buckets.get(yearMonth))
      .filter((point): point is MonthlyCashFlowPoint => point !== undefined)
      .map((point) => ({ ...point, net: point.income - point.expense }));
  };

  /** Convenience wrapper for the trailing N months ending at `yearMonth`. */
  const calculateTrailingCashFlow = (
    transactions: readonly Transaction[],
    yearMonth: string,
    monthCount = 6
  ): MonthlyCashFlowPoint[] =>
    calculateMonthlyCashFlow(transactions, getTrailingYearMonths(yearMonth, monthCount));

  return {
    calculateFinancialSummary,
    calculateCategoryBreakdown,
    calculateBudgetUtilization,
    calculateDailySpending,
    calculateMonthlyCashFlow,
    calculateTrailingCashFlow
  };
}
