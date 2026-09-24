<script setup lang="ts">
/**
 * High-speed transaction creator / editor.
 *
 * Rendered as an overlay inside the shell frame, so the layout is split into a
 * fixed head (type, amount hero, validation), a scrollable middle (accounts,
 * category, date, note) and a docked keypad that yields to the native keyboard
 * when the note field is focused.
 *
 * The same screen serves creation and editing (`/entry?id=…`), which is what the
 * ledger's swipe "Edit" action opens.
 */

import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useLedgerStore } from '@/stores/ledgerStore';
import { useCurrency } from '@/composables/useCurrency';
import { useHaptics } from '@/composables/useHaptics';
import AppButton from '@/components/ui/AppButton.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppKeypad, { type KeypadKey } from '@/components/ui/AppKeypad.vue';
import AppModalSheet from '@/components/ui/AppModalSheet.vue';
import AppSegmented from '@/components/ui/AppSegmented.vue';
import AccountPicker from '@/components/molecules/AccountPicker.vue';
import CategoryPicker from '@/components/molecules/CategoryPicker.vue';
import DateNavigator from '@/components/molecules/DateNavigator.vue';
import { resolveIconName, ICON_NAMES, type IconName } from '@/components/ui/icons';
import { formatMinorToMajorString } from '@/utils/money';
import { getCurrentLocalDateString, shiftDateByDays } from '@/utils/date';
import { validateTransactionInput } from '@/utils/validation';
import type { CategoryType, NewCategoryDTO, TransactionType } from '@/types/models';

const MAX_INPUT_DIGITS = 12;
const CATEGORY_COLORS = [
  '#10B981',
  '#F59E0B',
  '#3B82F6',
  '#6366F1',
  '#EC4899',
  '#EF4444',
  '#8B5CF6',
  '#0D9488',
  '#64748B'
];

const route = useRoute();
const router = useRouter();
const ledgerStore = useLedgerStore();
const haptics = useHaptics();
const { activeCurrency, fractionDigits, parseMajorToMinor, formatCurrency } = useCurrency();

/* --------------------------------- state ---------------------------------- */

const transactionType = ref<TransactionType>('expense');
const amountString = ref<string>('0');
const selectedAccountId = ref<string>('');
const selectedToAccountId = ref<string>('');
const selectedCategoryId = ref<string>('');
const note = ref<string>('');
const transactionDate = ref<string>(getCurrentLocalDateString());
const isNoteFocused = ref(false);
const isSubmitting = ref(false);
const formError = ref<string | null>(null);
const isDeleteConfirmOpen = ref(false);

const isEditing = computed(() => editingId.value.length > 0);
const editingId = computed(() => (typeof route.query.id === 'string' ? route.query.id : ''));

const typeOptions: Array<{ label: string; value: TransactionType }> = [
  { label: 'Expense', value: 'expense' },
  { label: 'Income', value: 'income' },
  { label: 'Transfer', value: 'transfer' }
];

const visibleCategories = computed(() => {
  if (transactionType.value === 'transfer') return [];
  return transactionType.value === 'expense' ? ledgerStore.expenseCategories : ledgerStore.incomeCategories;
});

const selectedAccount = computed(() => ledgerStore.accountById(selectedAccountId.value));
const entryCurrency = computed(() => selectedAccount.value?.currency ?? activeCurrency.value);
const entryFractionDigits = computed(() =>
  entryCurrency.value === activeCurrency.value ? fractionDigits.value : 2
);

const amountMinor = computed(() =>
  parseMajorToMinor(amountString.value, entryCurrency.value)
);

const formattedAmount = computed(() => formatCurrency(amountMinor.value, entryCurrency.value));

const canSave = computed(
  () => amountMinor.value > 0 && selectedAccountId.value.length > 0 && !isSubmitting.value
);

/* ------------------------------- initialisation ---------------------------- */

const primeForm = (): void => {
  const existing = editingId.value.length > 0 ? ledgerStore.transactionById(editingId.value) : undefined;

  if (existing) {
    transactionType.value = existing.type;
    amountString.value = formatMinorToMajorString(existing.amount, entryCurrency.value);
    selectedAccountId.value = existing.accountId;
    selectedToAccountId.value = existing.toAccountId ?? '';
    selectedCategoryId.value = existing.categoryId;
    note.value = existing.note;
    transactionDate.value = existing.date;
    return;
  }

  const firstAccount = ledgerStore.activeAccounts[0];
  selectedAccountId.value = firstAccount?.id ?? '';
  selectedToAccountId.value = ledgerStore.activeAccounts[1]?.id ?? '';
  selectedCategoryId.value = visibleCategories.value[0]?.id ?? '';
};

// Re-prime once the live queries deliver the first emission (or the id changes).
watch(
  () => [ledgerStore.isReady, editingId.value] as const,
  ([isReady]) => {
    if (isReady) primeForm();
  },
  { immediate: true }
);

watch(selectedAccountId, (accountId) => {
  if (!selectedToAccountId.value || selectedToAccountId.value === accountId) {
    selectedToAccountId.value = ledgerStore.activeAccounts.find((account) => account.id !== accountId)?.id ?? '';
  }

  if (isEditing.value) return;
  const existing = ledgerStore.transactionById(editingId.value);
  if (existing) return;
  amountString.value = formatMinorToMajorString(parseMajorToMinor(amountString.value, entryCurrency.value), entryCurrency.value);
});

/* --------------------------------- keypad --------------------------------- */

const handleKeypadPress = (key: KeypadKey): void => {
  if (isSubmitting.value) return;

  if (key === 'clear') {
    amountString.value = '0';
    return;
  }

  if (key === 'backspace') {
    amountString.value = amountString.value.length <= 1 ? '0' : amountString.value.slice(0, -1);
    return;
  }

  if (key === '.') {
    if (entryFractionDigits.value === 0) return;
    if (!amountString.value.includes('.')) amountString.value = `${amountString.value}.`;
    return;
  }

  if (amountString.value.replace('.', '').length >= MAX_INPUT_DIGITS) return;

  if (amountString.value === '0') {
    amountString.value = key;
    return;
  }

  const [, fractionPart = ''] = amountString.value.split('.');
  if (fractionPart.length >= entryFractionDigits.value) return;
  amountString.value += key;
};

/* ----------------------------- type switching ----------------------------- */

const handleTypeChange = (value: string | number): void => {
  transactionType.value = value as TransactionType;
  haptics.trigger('selection');

  if (transactionType.value === 'transfer') {
    const alternate = ledgerStore.activeAccounts.find((account) => account.id !== selectedAccountId.value);
    selectedToAccountId.value = alternate?.id ?? '';
    return;
  }

  if (!visibleCategories.value.some((category) => category.id === selectedCategoryId.value)) {
    selectedCategoryId.value = visibleCategories.value[0]?.id ?? '';
  }
};

/* ------------------------------ quick category ---------------------------- */

const isCategorySheetOpen = ref(false);
const newCategoryName = ref('');
const newCategoryIcon = ref<IconName>('tag');
const newCategoryColor = ref<string>(CATEGORY_COLORS[0] ?? '#10B981');
const categoryError = ref<string | null>(null);
const isSavingCategory = ref(false);

const iconChoices = computed<IconName[]>(() => {
  const preferred: IconName[] = [
    'shopping-cart',
    'utensils',
    'car',
    'home',
    'film',
    'activity',
    'dollar-sign',
    'briefcase',
    'trending-up',
    'tag',
    'camera',
    'repeat'
  ];
  return preferred.filter((name) => (ICON_NAMES as readonly string[]).includes(name));
});

const openCategorySheet = (): void => {
  newCategoryName.value = '';
  newCategoryIcon.value = 'tag';
  newCategoryColor.value = CATEGORY_COLORS[0] ?? '#10B981';
  categoryError.value = null;
  isCategorySheetOpen.value = true;
};

const createCategory = async (): Promise<void> => {
  categoryError.value = null;
  isSavingCategory.value = true;

  try {
    const payload: NewCategoryDTO = {
      name: newCategoryName.value,
      type: (transactionType.value === 'transfer' ? 'expense' : transactionType.value) as CategoryType,
      icon: newCategoryIcon.value,
      colorHex: newCategoryColor.value,
      isSystem: false,
      isHidden: false,
      sortOrder: 0,
      isArchived: false
    };

    const result = await ledgerStore.createCategory(payload);
    if (!result.ok) {
      categoryError.value = result.message;
      return;
    }

    selectedCategoryId.value = result.data ?? selectedCategoryId.value;
    haptics.trigger('success');
    isCategorySheetOpen.value = false;
  } finally {
    isSavingCategory.value = false;
  }
};

/* ---------------------------------- save ---------------------------------- */

const buildError = (errors: Record<string, string>): string =>
  Object.values(errors)[0] ?? 'Please review the highlighted fields';

const handleSave = async (): Promise<void> => {
  if (isSubmitting.value) return;
  formError.value = null;

  const validation = validateTransactionInput({
    type: transactionType.value,
    amountMajor: amountString.value,
    currency: entryCurrency.value,
    accountId: selectedAccountId.value,
    categoryId: selectedCategoryId.value,
    toAccountId: selectedToAccountId.value,
    date: transactionDate.value,
    note: note.value
  });

  if (!validation.isValid || !validation.data) {
    haptics.trigger('error');
    formError.value = buildError(validation.errors);
    return;
  }

  const payload = {
    type: validation.data.type,
    amount: validation.data.amount,
    accountId: validation.data.accountId,
    categoryId: validation.data.categoryId,
    ...(validation.data.toAccountId ? { toAccountId: validation.data.toAccountId } : {}),
    date: validation.data.date,
    yearMonth: validation.data.yearMonth,
    note: validation.data.note,
    tags: validation.data.tags
  };

  isSubmitting.value = true;
  try {
    const result = isEditing.value
      ? await ledgerStore.updateTransaction(editingId.value, payload)
      : await ledgerStore.createTransaction(payload);

    if (!result.ok) {
      haptics.trigger('error');
      formError.value = result.message;
      return;
    }

    haptics.trigger('success');
    await router.replace({ path: '/transactions' });
  } finally {
    isSubmitting.value = false;
  }
};

const handleDelete = async (): Promise<void> => {
  isSubmitting.value = true;
  try {
    const result = await ledgerStore.deleteTransaction(editingId.value);
    isDeleteConfirmOpen.value = false;

    if (!result.ok) {
      formError.value = result.message;
      return;
    }

    haptics.trigger('warning');
    await router.replace({ path: '/transactions' });
  } finally {
    isSubmitting.value = false;
  }
};

const handleDismiss = (): void => {
  haptics.trigger('light');
  void router.replace({ path: '/transactions' });
};

const bumpDate = (delta: number): void => {
  transactionDate.value = shiftDateByDays(transactionDate.value, delta);
};

const resolvedCategoryIcon = computed(() => resolveIconName(newCategoryIcon.value));
</script>

<template>
  <div class="entry-view" role="dialog" aria-modal="true" aria-label="Transaction entry">
    <header class="entry-header">
      <button type="button" class="header-button" aria-label="Close entry" @click="handleDismiss">
        <AppIcon name="x" :size="22" />
      </button>

      <h1 class="entry-title">{{ isEditing ? 'Edit transaction' : 'New transaction' }}</h1>

      <button
        type="button"
        class="save-button"
        :disabled="!canSave"
        :aria-busy="isSubmitting ? 'true' : undefined"
        @click="handleSave"
      >
        {{ isSubmitting ? 'Saving…' : 'Save' }}
      </button>
    </header>

    <div class="entry-top">
      <div v-if="formError" class="validation-banner" role="alert">
        <AppIcon name="alert-circle" :size="16" />
        <span>{{ formError }}</span>
      </div>

      <AppSegmented
        :model-value="transactionType"
        :options="typeOptions"
        label="Transaction type"
        @update:model-value="handleTypeChange"
      />

      <div class="amount-hero" :class="`tone-${transactionType}`">
        <span class="amount-text" aria-live="polite">{{ formattedAmount }}</span>
        <span class="amount-hint">
          {{ selectedAccount ? selectedAccount.name : 'Select an account' }} · {{ entryCurrency }}
        </span>
      </div>
    </div>

    <div class="entry-content">
      <section class="field-block">
        <span class="field-label">From account</span>
        <AccountPicker
          v-model="selectedAccountId"
          :accounts="ledgerStore.activeAccounts"
          :transactions="ledgerStore.transactions"
          label="Source account"
          @create="handleDismiss"
        />
      </section>

      <section v-if="transactionType === 'transfer'" class="field-block">
        <span class="field-label">To account</span>
        <AccountPicker
          v-model="selectedToAccountId"
          :accounts="ledgerStore.activeAccounts"
          :transactions="ledgerStore.transactions"
          :exclude-account-id="selectedAccountId"
          label="Destination account"
        />
        <p v-if="ledgerStore.activeAccounts.length < 2" class="field-hint">
          Add a second account in Settings to record transfers.
        </p>
      </section>

      <section v-else class="field-block">
        <span class="field-label">Category</span>
        <CategoryPicker
          v-model="selectedCategoryId"
          :categories="visibleCategories"
          allow-create
          label="Category"
          @create="openCategorySheet"
        />
      </section>

      <section class="field-block">
        <span class="field-label">Date</span>
        <div class="date-row">
          <button type="button" class="date-step" aria-label="Previous day" @click="bumpDate(-1)">
            <AppIcon name="chevron-left" :size="18" />
          </button>
          <DateNavigator v-model="transactionDate" mode="day" label="Transaction date" />
          <button type="button" class="date-step" aria-label="Next day" @click="bumpDate(1)">
            <AppIcon name="chevron-right" :size="18" />
          </button>
        </div>
      </section>

      <section class="field-block">
        <AppInput
          v-model="note"
          label="Note"
          placeholder="What was this for?"
          :maxlength="120"
          enter-key-hint="done"
          clearable
          @focus="isNoteFocused = true"
          @blur="isNoteFocused = false"
          @enter="isNoteFocused = false"
        />
      </section>
    </div>

    <div v-show="!isNoteFocused" class="keypad-dock">
      <AppKeypad
        :fraction-digits="entryFractionDigits"
        show-clear
        :disabled="isSubmitting"
        @press="handleKeypadPress"
      />
    </div>

    <div v-if="isEditing" class="entry-danger">
      <AppButton variant="ghost" block icon="trash" @click="isDeleteConfirmOpen = true">
        Delete transaction
      </AppButton>
    </div>

    <AppModalSheet v-model="isCategorySheetOpen" title="New category" description="Added to your local category catalog.">
      <div v-if="categoryError" class="validation-banner" role="alert">
        <AppIcon name="alert-circle" :size="16" />
        <span>{{ categoryError }}</span>
      </div>

      <AppInput v-model="newCategoryName" label="Name" placeholder="Coffee, Rent, Petrol…" :maxlength="40" />

      <div class="sheet-block">
        <span class="field-label">Icon</span>
        <div class="icon-grid">
          <button
            v-for="icon in iconChoices"
            :key="icon"
            type="button"
            class="icon-cell"
            :class="{ 'is-selected': newCategoryIcon === icon }"
            :aria-label="icon"
            :aria-pressed="newCategoryIcon === icon"
            @click="newCategoryIcon = icon"
          >
            <AppIcon :name="icon" :size="18" />
          </button>
        </div>
      </div>

      <div class="sheet-block">
        <span class="field-label">Colour</span>
        <div class="color-grid">
          <button
            v-for="color in CATEGORY_COLORS"
            :key="color"
            type="button"
            class="color-cell"
            :class="{ 'is-selected': newCategoryColor === color }"
            :style="{ backgroundColor: color }"
            :aria-label="`Colour ${color}`"
            :aria-pressed="newCategoryColor === color"
            @click="newCategoryColor = color"
          />
        </div>
      </div>

      <div class="category-preview">
        <span class="preview-bubble" :style="{ backgroundColor: newCategoryColor }">
          <AppIcon :name="resolvedCategoryIcon" :size="18" color="#FFFFFF" />
        </span>
        <span class="preview-name">{{ newCategoryName || 'New category' }}</span>
      </div>

      <template #footer>
        <AppButton variant="secondary" block :disabled="isSavingCategory" @click="isCategorySheetOpen = false">
          Cancel
        </AppButton>
        <AppButton variant="primary" block :loading="isSavingCategory" @click="createCategory">Create</AppButton>
      </template>
    </AppModalSheet>

    <AppModalSheet
      v-model="isDeleteConfirmOpen"
      title="Delete this transaction?"
      description="The entry and any attached receipt are removed from this device."
    >
      <p class="confirm-text">This cannot be undone. Consider exporting a backup first.</p>

      <template #footer>
        <AppButton variant="secondary" block :disabled="isSubmitting" @click="isDeleteConfirmOpen = false">
          Keep it
        </AppButton>
        <AppButton variant="danger" block :loading="isSubmitting" @click="handleDelete">Delete</AppButton>
      </template>
    </AppModalSheet>
  </div>
</template>

<style scoped>
.entry-view {
  position: absolute;
  inset: 0;
  z-index: var(--z-overlay);
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--color-bg-primary);
  color: var(--color-text-primary);
}

.entry-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: max(var(--safe-area-top), var(--space-3)) var(--space-3) var(--space-2);
  border-bottom: 1px solid var(--color-border);
}

.entry-title {
  margin: 0;
  flex: 1;
  text-align: center;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
}

.header-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--tap-target);
  height: var(--tap-target);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.header-button:active {
  background-color: var(--color-surface-sunken);
}

.save-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 72px;
  min-height: var(--tap-target);
  padding: 0 var(--space-4);
  background-color: var(--color-primary-strong);
  border: none;
  border-radius: var(--radius-pill);
  color: #ffffff;
  font-family: inherit;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  cursor: pointer;
}

.save-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.entry-top {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4) 0;
}

.amount-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) 0;
}

.amount-text {
  font-family: var(--font-family-numeric);
  font-size: var(--font-size-hero);
  font-weight: var(--font-weight-heavy);
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.tone-expense .amount-text {
  color: var(--color-expense);
}

.tone-income .amount-text {
  color: var(--color-income);
}

.tone-transfer .amount-text {
  color: var(--color-transfer);
}

.amount-hint {
  font-size: var(--font-size-2xs);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-muted);
}

.entry-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  overflow-y: auto;
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
  padding: var(--space-4);
}

.field-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.field-label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.field-hint {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.date-row {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.date-step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  background-color: var(--color-surface-sunken);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.keypad-dock {
  flex-shrink: 0;
  padding: var(--space-2) var(--space-3) max(var(--safe-area-bottom), var(--space-3));
  background-color: var(--color-bg-primary);
  border-top: 1px solid var(--color-border);
}

.entry-danger {
  flex-shrink: 0;
  padding: 0 var(--space-4) max(var(--safe-area-bottom), var(--space-3));
}

.validation-banner {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background-color: var(--color-danger-soft);
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-md);
  color: var(--color-danger);
  font-size: var(--font-size-sm);
}

.sheet-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: var(--space-4);
}

.icon-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: var(--space-2);
}

.icon-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--tap-target);
  background-color: var(--color-surface-sunken);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.icon-cell.is-selected {
  border-color: var(--color-primary);
  background-color: var(--color-primary-soft);
  color: var(--color-primary-strong);
}

.color-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: var(--space-2);
}

.color-cell {
  min-height: var(--tap-target);
  border: 2px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
}

.color-cell.is-selected {
  border-color: var(--color-text-primary);
  box-shadow: 0 0 0 2px var(--color-surface) inset;
}

.category-preview {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-top: var(--space-4);
  padding: var(--space-3);
  background-color: var(--color-surface-sunken);
  border-radius: var(--radius-md);
}

.preview-bubble {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-circle);
}

.preview-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.confirm-text {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

@media (min-height: 760px) {
  .entry-content {
    gap: var(--space-5);
  }
}
</style>
