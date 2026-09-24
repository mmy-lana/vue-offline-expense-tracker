<script setup lang="ts">
/**
 * Budget create / edit sheet.
 *
 * Reuses the shared validators and writes through the ledger store, so the
 * envelope is always denominated in the locked base currency and the
 * `&[categoryId+yearMonth]` unique index is respected by `upsertBudget`.
 */

import { computed, ref, watch } from 'vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppModalSheet from '@/components/ui/AppModalSheet.vue';
import CategoryPicker from '@/components/molecules/CategoryPicker.vue';
import { useCurrency } from '@/composables/useCurrency';
import { useLedgerStore } from '@/stores/ledgerStore';
import { formatMinorToMajorString } from '@/utils/money';
import { formatYearMonthLabel } from '@/utils/date';
import { validateBudgetInput } from '@/utils/validation';
import type { Budget, Category } from '@/types/models';

interface Props {
  modelValue: boolean;
  /** Month bucket the envelope belongs to, `YYYY-MM`. */
  yearMonth: string;
  /** Existing envelope when editing. */
  budget?: Budget | null;
  categories: readonly Category[];
}

const props = withDefaults(defineProps<Props>(), { budget: null });

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
  (event: 'saved', message: string): void;
  (event: 'deleted', message: string): void;
}>();

const ledgerStore = useLedgerStore();
const { activeCurrency, formatCurrency } = useCurrency();

const selectedCategoryId = ref<string>('');
const amountInput = ref<string>('');
const formError = ref<string | null>(null);
const isSaving = ref(false);

const isEditing = computed(() => props.budget !== null);

const expenseCategories = computed(() =>
  props.categories.filter((category) => category.type === 'expense' && !category.isHidden && !category.isArchived)
);

const selectedCategory = computed(() =>
  expenseCategories.value.find((category) => category.id === selectedCategoryId.value)
);

const title = computed(() => (isEditing.value ? 'Edit envelope' : 'New envelope'));

const description = computed(() => `Limits apply to ${formatYearMonthLabel(props.yearMonth)}.`);

const parsedPreview = computed(() => {
  const result = validateBudgetInput({ amountMajor: amountInput.value, currency: activeCurrency.value });
  return result.isValid && result.data ? formatCurrency(result.data.amount) : '—';
});

const resetForm = (): void => {
  formError.value = null;

  if (props.budget) {
    selectedCategoryId.value = props.budget.categoryId;
    amountInput.value = formatMinorToMajorString(props.budget.amount, activeCurrency.value);
    return;
  }

  selectedCategoryId.value = expenseCategories.value[0]?.id ?? '';
  amountInput.value = '';
};

watch(
  () => [props.modelValue, props.budget?.id ?? ''] as const,
  ([isOpen]) => {
    if (isOpen) resetForm();
  },
  { immediate: true }
);

const handleSave = async (): Promise<void> => {
  formError.value = null;

  if (selectedCategoryId.value.length === 0) {
    formError.value = 'Select the expense category this envelope covers';
    return;
  }

  const validation = validateBudgetInput({ amountMajor: amountInput.value, currency: activeCurrency.value });
  if (!validation.isValid || !validation.data) {
    formError.value = Object.values(validation.errors)[0] ?? 'Enter a valid budget amount';
    return;
  }

  isSaving.value = true;
  try {
    const result = await ledgerStore.upsertBudget({
      categoryId: selectedCategoryId.value,
      amount: validation.data.amount,
      period: 'monthly',
      yearMonth: props.yearMonth
    });

    if (!result.ok) {
      formError.value = result.message;
      return;
    }

    emit('saved', result.message);
    emit('update:modelValue', false);
  } finally {
    isSaving.value = false;
  }
};

const handleDelete = async (): Promise<void> => {
  const budget = props.budget;
  if (!budget) return;

  isSaving.value = true;
  try {
    const result = await ledgerStore.deleteBudget(budget.id);
    if (!result.ok) {
      formError.value = result.message;
      return;
    }

    emit('deleted', result.message);
    emit('update:modelValue', false);
  } finally {
    isSaving.value = false;
  }
};
</script>

<template>
  <AppModalSheet
    :model-value="modelValue"
    :title="title"
    :description="description"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div v-if="formError" class="form-error" role="alert">
      <AppIcon name="alert-circle" :size="16" />
      <span>{{ formError }}</span>
    </div>

    <div class="form-body">
      <div class="form-row">
        <span class="row-label">Category</span>
        <CategoryPicker v-model="selectedCategoryId" :categories="expenseCategories" label="Budget category" />
        <p v-if="selectedCategory" class="row-hint">
          {{ selectedCategory.name }} · already budgeted for this month is updated in place.
        </p>
      </div>

      <div class="form-row">
        <AppInput
          v-model="amountInput"
          label="Monthly limit"
          input-mode="decimal"
          enter-key-hint="done"
          placeholder="0.00"
          :suffix="activeCurrency"
          icon="target"
          hint="Stored in minor units; no rounding surprises."
          @enter="handleSave"
        />
        <p class="row-hint">Preview: {{ parsedPreview }}</p>
      </div>
    </div>

    <template #footer>
      <AppButton
        v-if="isEditing"
        variant="danger"
        icon="trash"
        :disabled="isSaving"
        label="Remove envelope"
        @click="handleDelete"
      />
      <AppButton variant="secondary" block :disabled="isSaving" @click="emit('update:modelValue', false)">
        Cancel
      </AppButton>
      <AppButton variant="primary" block :loading="isSaving" @click="handleSave">
        {{ isEditing ? 'Update' : 'Create' }}
      </AppButton>
    </template>
  </AppModalSheet>
</template>

<style scoped>
.form-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.row-label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.row-hint {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.form-error {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background-color: var(--color-danger-soft);
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-md);
  color: var(--color-danger);
  font-size: var(--font-size-sm);
}
</style>
