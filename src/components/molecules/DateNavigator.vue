<script setup lang="ts">
/**
 * Period stepper with a picker sheet.
 *
 * Two modes share one control: `month` steps `YYYY-MM` buckets with a
 * year + month grid picker, `day` steps calendar days with a native date field.
 * Both clamp to the supplied bounds, so a screen can forbid navigating into
 * months that cannot hold data.
 */

import { computed, ref } from 'vue';
import { useHaptics } from '@/composables/useHaptics';
import AppIcon from '@/components/ui/AppIcon.vue';
import AppModalSheet from '@/components/ui/AppModalSheet.vue';
import AppButton from '@/components/ui/AppButton.vue';
import {
  formatDateLabel,
  formatYearMonthLabel,
  getCurrentLocalDateString,
  getCurrentYearMonth,
  isValidCalendarDayString,
  isValidYearMonthString,
  shiftDateByDays,
  shiftYearMonth
} from '@/utils/date';

type NavigatorMode = 'month' | 'day';

interface Props {
  /** `YYYY-MM` in month mode, `YYYY-MM-DD` in day mode. */
  modelValue: string;
  mode?: NavigatorMode;
  /** Inclusive navigation bounds in the active format. */
  min?: string;
  max?: string;
  /** Disables forward navigation entirely (for example on future months). */
  disableForward?: boolean;
  label?: string;
}

const props = withDefaults(defineProps<Props>(), {
  mode: 'month',
  min: undefined,
  max: undefined,
  disableForward: false,
  label: 'Period'
});

const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>();

const haptics = useHaptics();
const isPickerOpen = ref(false);
const pickerYear = ref<number>(Number(getCurrentYearMonth().slice(0, 4)));

const currentValue = computed(() => {
  const isValid =
    props.mode === 'month' ? isValidYearMonthString(props.modelValue) : isValidCalendarDayString(props.modelValue);
  if (isValid) return props.modelValue;
  return props.mode === 'month' ? getCurrentYearMonth() : getCurrentLocalDateString();
});

const isMonthMode = computed(() => props.mode === 'month');

const activeYear = computed(() => Number(currentValue.value.slice(0, 4)));

const displayLabel = computed(() =>
  isMonthMode.value ? formatYearMonthLabel(currentValue.value) : formatDateLabel(currentValue.value)
);

const step = (delta: number): string =>
  isMonthMode.value ? shiftYearMonth(currentValue.value, delta) : shiftDateByDays(currentValue.value, delta);

const withinBounds = (value: string): boolean => {
  if (props.min !== undefined && value < props.min) return false;
  if (props.max !== undefined && value > props.max) return false;
  return true;
};

const canGoPrevious = computed(() => withinBounds(step(-1)));
const canGoNext = computed(() => !props.disableForward && withinBounds(step(1)));

const move = (delta: number, allowed: boolean): void => {
  if (!allowed) return;

  haptics.trigger('selection');
  emit('update:modelValue', step(delta));
};

const monthNames = computed(() =>
  Array.from({ length: 12 }, (_, index) => {
    const label = formatYearMonthLabel(`${pickerYear.value}-${(index + 1).toString().padStart(2, '0')}`);
    return label.split(' ')[0] ?? label;
  })
);

const isSelectedMonth = (index: number): boolean =>
  isMonthMode.value && activeYear.value === pickerYear.value && Number(currentValue.value.slice(5, 7)) === index + 1;

const monthDisabled = (index: number): boolean => {
  const candidate = `${pickerYear.value}-${(index + 1).toString().padStart(2, '0')}`;
  return !withinBounds(candidate);
};

const openPicker = (): void => {
  haptics.trigger('light');
  pickerYear.value = activeYear.value;
  isPickerOpen.value = true;
};

const selectMonth = (index: number): void => {
  if (monthDisabled(index)) return;

  haptics.trigger('selection');
  emit('update:modelValue', `${pickerYear.value}-${(index + 1).toString().padStart(2, '0')}`);
  isPickerOpen.value = false;
};

const shiftPickerYear = (delta: number): void => {
  haptics.trigger('selection');
  pickerYear.value += delta;
};

const handleDateInput = (event: Event): void => {
  const value = (event.target as HTMLInputElement).value;
  if (!isValidCalendarDayString(value)) return;

  emit('update:modelValue', value);
  isPickerOpen.value = false;
};

const goToToday = (): void => {
  haptics.trigger('selection');
  const today = isMonthMode.value ? getCurrentYearMonth() : getCurrentLocalDateString();
  if (!withinBounds(today)) return;

  emit('update:modelValue', today);
  isPickerOpen.value = false;
};
</script>

<template>
  <div class="date-navigator" role="group" :aria-label="label">
    <button
      type="button"
      class="nav-button"
      :disabled="!canGoPrevious"
      :aria-label="isMonthMode ? 'Previous month' : 'Previous day'"
      @click="move(-1, canGoPrevious)"
    >
      <AppIcon name="chevron-left" :size="20" />
    </button>

    <button
      type="button"
      class="period-button"
      :aria-label="`Selected period: ${displayLabel}. Open picker`"
      @click="openPicker"
    >
      <span class="period-label">{{ displayLabel }}</span>
      <AppIcon name="chevron-down" :size="16" />
    </button>

    <button
      type="button"
      class="nav-button"
      :disabled="!canGoNext"
      :aria-label="isMonthMode ? 'Next month' : 'Next day'"
      @click="move(1, canGoNext)"
    >
      <AppIcon name="chevron-right" :size="20" />
    </button>

    <AppModalSheet
      v-model="isPickerOpen"
      :title="isMonthMode ? 'Select month' : 'Select date'"
      sheet-class="date-picker-sheet"
    >
      <div v-if="isMonthMode" class="picker-month-mode">
        <div class="year-stepper">
          <button type="button" class="year-button" aria-label="Previous year" @click="shiftPickerYear(-1)">
            <AppIcon name="chevron-left" :size="18" />
          </button>
          <span class="year-label">{{ pickerYear }}</span>
          <button type="button" class="year-button" aria-label="Next year" @click="shiftPickerYear(1)">
            <AppIcon name="chevron-right" :size="18" />
          </button>
        </div>

        <div class="month-grid">
          <button
            v-for="(monthName, index) in monthNames"
            :key="monthName"
            type="button"
            class="month-cell"
            :class="{ selected: isSelectedMonth(index) }"
            :disabled="monthDisabled(index)"
            @click="selectMonth(index)"
          >
            {{ monthName }}
          </button>
        </div>
      </div>

      <div v-else class="picker-day-mode">
        <input
          class="native-date"
          type="date"
          :value="currentValue"
          :min="min"
          :max="max"
          aria-label="Pick a date"
          @change="handleDateInput"
        />
      </div>

      <template #footer>
        <AppButton variant="secondary" block @click="goToToday">
          {{ isMonthMode ? 'This month' : 'Today' }}
        </AppButton>
        <AppButton variant="ghost" block @click="isPickerOpen = false">Cancel</AppButton>
      </template>
    </AppModalSheet>
  </div>
</template>

<style scoped>
.date-navigator {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.nav-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--tap-target);
  height: var(--tap-target);
  padding: 0;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.nav-button:active:not(:disabled) {
  background-color: var(--color-surface-sunken);
  transform: scale(0.94);
}

.nav-button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.period-button {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  flex: 1;
  min-width: 0;
  min-height: var(--tap-target);
  padding: 0 var(--space-2);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  font-family: inherit;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  justify-content: center;
}

.period-button:active {
  background-color: var(--color-surface-sunken);
}

.period-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker-month-mode,
.picker-day-mode {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.year-stepper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.year-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--tap-target);
  height: var(--tap-target);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background-color: var(--color-surface-sunken);
  color: var(--color-text-primary);
  cursor: pointer;
}

.year-label {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
}

.month-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
}

.month-cell {
  min-height: var(--tap-target);
  padding: 0 var(--space-1);
  background-color: var(--color-surface-sunken);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  font-family: inherit;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
}

.month-cell.selected {
  background-color: var(--color-primary-strong);
  border-color: var(--color-primary-strong);
  color: #ffffff;
  font-weight: var(--font-weight-semibold);
}

.month-cell:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.native-date {
  width: 100%;
  min-height: var(--tap-target);
  padding: 0 var(--space-3);
  background-color: var(--color-surface-sunken);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
}
</style>
