<script setup lang="ts">
/**
 * Ledger filter bar.
 *
 * A search field stays visible at all times; every other dimension lives in a
 * bottom sheet so the ledger keeps its vertical space on phones. Active filters
 * are summarised as removable chips above the list.
 */

import { computed, ref } from 'vue';
import {
  countActiveFilters,
  createDefaultFilters,
  type TransactionFilters
} from '@/types/filters';
import { useHaptics } from '@/composables/useHaptics';
import AppButton from '@/components/ui/AppButton.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppModalSheet from '@/components/ui/AppModalSheet.vue';
import AppSegmented from '@/components/ui/AppSegmented.vue';
import AccountPicker from '@/components/molecules/AccountPicker.vue';
import CategoryPicker from '@/components/molecules/CategoryPicker.vue';
import {
  formatDateLabel,
  getCurrentLocalDateString,
  getCurrentYearMonth,
  getMonthBoundaries,
  shiftDateByDays,
  shiftYearMonth
} from '@/utils/date';
import type { Account, Category, TransactionType } from '@/types/models';

interface Props {
  modelValue: TransactionFilters;
  accounts: readonly Account[];
  categories: readonly Category[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: TransactionFilters): void;
  (event: 'reset'): void;
}>();

const haptics = useHaptics();
const isSheetOpen = ref(false);
const isDateSheetOpen = ref(false);

const typeOptions: Array<{ label: string; value: TransactionType | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Expense', value: 'expense' },
  { label: 'Income', value: 'income' },
  { label: 'Transfer', value: 'transfer' }
];

const activeCount = computed(() => countActiveFilters(props.modelValue));

const accountName = computed(() => {
  if (props.modelValue.accountId === 'all') return '';
  return props.accounts.find((account) => account.id === props.modelValue.accountId)?.name ?? 'Unknown account';
});

const categoryName = computed(() => {
  if (props.modelValue.categoryId === 'all') return '';
  return (
    props.categories.find((category) => category.id === props.modelValue.categoryId)?.name ?? 'Unknown category'
  );
});

const typeLabel = computed(() => props.modelValue.type === 'all' ? '' : props.modelValue.type);

const dateRangeLabel = computed(() => {
  const { from, to } = props.modelValue;
  if (from.length === 0 && to.length === 0) return '';
  if (from.length > 0 && to.length > 0) return `${formatDateLabel(from)} – ${formatDateLabel(to)}`;
  if (from.length > 0) return `From ${formatDateLabel(from)}`;
  return `Until ${formatDateLabel(to)}`;
});

const update = (patch: Partial<TransactionFilters>): void => {
  emit('update:modelValue', { ...props.modelValue, ...patch });
};

const handleSearchInput = (value: string): void => {
  update({ search: value });
};

const handleTypeChange = (value: string | number): void => {
  update({ type: value as TransactionFilters['type'] });
};

const handleAccountChange = (accountId: string): void => {
  update({ accountId });
};

const handleCategoryChange = (categoryId: string): void => {
  update({ categoryId });
};

const clearDateRange = (): void => {
  haptics.trigger('selection');
  update({ from: '', to: '' });
};

const handleReset = (): void => {
  haptics.trigger('warning');
  emit('update:modelValue', createDefaultFilters());
  emit('reset');
};

const handleDateInput = (key: 'from' | 'to', event: Event): void => {
  update({ [key]: (event.target as HTMLInputElement).value } as Partial<TransactionFilters>);
};

const openSheet = (): void => {
  haptics.trigger('light');
  isSheetOpen.value = true;
};

const openDateSheet = (): void => {
  haptics.trigger('light');
  isDateSheetOpen.value = true;
};

type QuickRangeKey = '7d' | '30d' | '90d' | 'this-month' | 'last-month';

const quickRanges: Array<{ key: QuickRangeKey; label: string }> = [
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: 'this-month', label: 'This month' },
  { key: 'last-month', label: 'Last month' }
];

/** Applies a rolling window relative to today, in local calendar days. */
const applyQuickRange = (key: QuickRangeKey): void => {
  haptics.trigger('selection');
  const today = getCurrentLocalDateString();

  if (key === 'this-month' || key === 'last-month') {
    const yearMonth =
      key === 'this-month' ? getCurrentYearMonth() : shiftYearMonth(getCurrentYearMonth(), -1);
    const { start, end } = getMonthBoundaries(yearMonth);
    update({ from: start, to: end });
    isDateSheetOpen.value = false;
    return;
  }

  const days = key === '7d' ? 7 : key === '30d' ? 30 : 90;
  update({ from: shiftDateByDays(today, -(days - 1)), to: today });
  isDateSheetOpen.value = false;
};

const applyAllTime = (): void => {
  haptics.trigger('selection');
  update({ from: '', to: '' });
  isDateSheetOpen.value = false;
};
</script>

<template>
  <section class="filter-bar" aria-label="Ledger filters">
    <div class="search-row">
      <AppInput
        class="search-field"
        :model-value="modelValue.search"
        type="search"
        input-mode="search"
        placeholder="Search notes, tags, accounts"
        autocomplete="off"
        icon="search"
        clearable
        hide-label
        label="Search transactions"
        @update:model-value="handleSearchInput"
      />

      <button
        type="button"
        class="filter-button"
        :class="{ 'is-active': activeCount > 0 }"
        :aria-label="`Filters${activeCount > 0 ? `, ${activeCount} active` : ''}`"
        @click="openSheet"
      >
        <AppIcon name="filter" :size="20" />
        <span v-if="activeCount > 0" class="filter-count">{{ activeCount }}</span>
      </button>
    </div>

    <div v-if="activeCount > 0" class="chip-row">
      <button v-if="typeLabel" type="button" class="filter-chip" @click="update({ type: 'all' })">
        {{ typeLabel }}
        <AppIcon name="x" :size="12" />
      </button>

      <button v-if="accountName" type="button" class="filter-chip" @click="update({ accountId: 'all' })">
        {{ accountName }}
        <AppIcon name="x" :size="12" />
      </button>

      <button v-if="categoryName" type="button" class="filter-chip" @click="update({ categoryId: 'all' })">
        {{ categoryName }}
        <AppIcon name="x" :size="12" />
      </button>

      <button v-if="dateRangeLabel" type="button" class="filter-chip" @click="clearDateRange">
        {{ dateRangeLabel }}
        <AppIcon name="x" :size="12" />
      </button>

      <button type="button" class="filter-chip reset-chip" @click="handleReset">Clear all</button>
    </div>

    <AppModalSheet v-model="isSheetOpen" title="Filter ledger" description="Narrow the ledger by type, account, category and date.">
      <div class="sheet-section">
        <span class="section-label">Type</span>
        <AppSegmented
          :model-value="modelValue.type"
          :options="typeOptions"
          label="Transaction type"
          size="sm"
          @update:model-value="handleTypeChange"
        />
      </div>

      <div class="sheet-section">
        <AccountPicker
          :model-value="modelValue.accountId === 'all' ? '' : modelValue.accountId"
          :accounts="accounts"
          :show-balance="false"
          label="Account filter"
          @update:model-value="handleAccountChange"
        />
        <button
          type="button"
          class="sheet-clear"
          :class="{ 'is-selected': modelValue.accountId === 'all' }"
          @click="update({ accountId: 'all' })"
        >
          Any account
        </button>
      </div>

      <div class="sheet-section">
        <span class="section-label">Category</span>
        <button
          type="button"
          class="sheet-clear"
          :class="{ 'is-selected': modelValue.categoryId === 'all' }"
          @click="update({ categoryId: 'all' })"
        >
          Any category
        </button>
        <CategoryPicker
          :model-value="modelValue.categoryId === 'all' ? '' : modelValue.categoryId"
          :categories="categories"
          label="Category filter"
          @update:model-value="handleCategoryChange"
        />
      </div>

      <div class="sheet-section">
        <span class="section-label">Date range</span>
        <div class="date-row">
          <label class="date-field">
            <span>From</span>
            <input
              class="date-input"
              type="date"
              :value="modelValue.from"
              :max="modelValue.to || undefined"
              @change="handleDateInput('from', $event)"
            />
          </label>
          <label class="date-field">
            <span>To</span>
            <input
              class="date-input"
              type="date"
              :value="modelValue.to"
              :min="modelValue.from || undefined"
              @change="handleDateInput('to', $event)"
            />
          </label>
        </div>
        <button v-if="dateRangeLabel" type="button" class="sheet-clear" @click="clearDateRange">
          Clear date range
        </button>
      </div>

      <template #footer>
        <AppButton variant="secondary" block @click="openDateSheet()">Quick range</AppButton>
        <AppButton variant="primary" block @click="isSheetOpen = false">Done</AppButton>
      </template>
    </AppModalSheet>

    <AppModalSheet v-model="isDateSheetOpen" title="Quick range" description="Common rolling windows for the ledger.">
      <div class="quick-range-grid">
        <button
          v-for="option in quickRanges"
          :key="option.key"
          type="button"
          class="quick-range-button"
          @click="applyQuickRange(option.key)"
        >
          <AppIcon name="calendar" :size="16" />
          <span>{{ option.label }}</span>
        </button>
      </div>

      <template #footer>
        <AppButton variant="secondary" block @click="applyAllTime">All time</AppButton>
        <AppButton variant="ghost" block @click="isDateSheetOpen = false">Cancel</AppButton>
      </template>
    </AppModalSheet>
  </section>
</template>

<style scoped>
.filter-bar {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.search-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.search-field {
  flex: 1;
  min-width: 0;
}

.filter-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--tap-target);
  height: var(--tap-target);
  flex-shrink: 0;
  background-color: var(--color-surface-sunken);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.filter-button.is-active {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background-color: var(--color-primary-soft);
}

.filter-count {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: var(--radius-pill);
  background-color: var(--color-primary-strong);
  color: #ffffff;
  font-size: var(--font-size-2xs);
  font-weight: var(--font-weight-bold);
  line-height: 18px;
  text-align: center;
}

.chip-row {
  display: flex;
  gap: var(--space-2);
  overflow-x: auto;
  padding-bottom: var(--space-1);
  scrollbar-width: none;
}

.chip-row::-webkit-scrollbar {
  display: none;
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  flex-shrink: 0;
  min-height: 32px;
  padding: 0 var(--space-3);
  background-color: var(--color-primary-soft);
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  color: var(--color-primary-strong);
  font-family: inherit;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-transform: capitalize;
  cursor: pointer;
}

.reset-chip {
  background-color: transparent;
  border-color: var(--color-border);
  color: var(--color-text-muted);
}

.sheet-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-bottom: var(--space-4);
}

.section-label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.sheet-clear {
  align-self: flex-start;
  min-height: 32px;
  padding: 0 var(--space-3);
  background-color: var(--color-surface-sunken);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  color: var(--color-text-secondary);
  font-family: inherit;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
}

.sheet-clear.is-selected {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.date-row {
  display: flex;
  gap: var(--space-3);
}

.date-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  flex: 1;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.date-input {
  width: 100%;
  min-height: var(--tap-target);
  padding: 0 var(--space-2);
  background-color: var(--color-surface-sunken);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
}

.quick-range-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.quick-range-button {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: var(--tap-target);
  padding: 0 var(--space-3);
  background-color: var(--color-surface-sunken);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  font-family: inherit;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  text-align: left;
  cursor: pointer;
}

.quick-range-button:active {
  background-color: var(--color-primary-soft);
  border-color: var(--color-primary);
}
</style>
