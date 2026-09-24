<script setup lang="ts">
/**
 * Docked numeric keypad for high-speed amount entry.
 *
 * Presentational and stateless: it reports key presses and lets the owning
 * screen own the buffer. Each key is a 48px+ target that fires on pointer-down
 * (never waiting for click) with an immediate haptic pulse; holding backspace
 * clears the whole entry, matching native calculator keyboards.
 */

import { computed, onBeforeUnmount } from 'vue';
import { useHaptics } from '@/composables/useHaptics';
import AppIcon from './AppIcon.vue';

export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'backspace' | 'clear';

interface Props {
  /** Decimal digits of the active currency; `0` disables the decimal key. */
  fractionDigits?: number;
  /** Adds a dedicated clear key as the tenth slot. */
  showClear?: boolean;
  disabled?: boolean;
  /** Accessible name for the keypad group. */
  label?: string;
}

const props = withDefaults(defineProps<Props>(), {
  fractionDigits: 2,
  showClear: false,
  disabled: false,
  label: 'Numeric keypad'
});

const emit = defineEmits<{ (event: 'press', key: KeypadKey): void }>();

const LONG_PRESS_MS = 550;
const haptics = useHaptics();

let holdTimer: ReturnType<typeof setTimeout> | null = null;

const decimalEnabled = computed(() => props.fractionDigits > 0);

const keys = computed<KeypadKey[]>(() => {
  const rows: KeypadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  if (props.showClear) rows.push('clear');
  rows.push('.', '0', 'backspace');
  return rows;
});

const clearHoldTimer = (): void => {
  if (holdTimer !== null) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
};

const isDisabledKey = (key: KeypadKey): boolean => {
  if (props.disabled) return true;
  // Zero-decimal currencies have no fractional key; the slot stays empty.
  if (key === '.' && !decimalEnabled.value) return true;
  return false;
};

const handlePointerDown = (key: KeypadKey, event: PointerEvent): void => {
  if (isDisabledKey(key)) return;

  // Suppress the synthetic click and text selection on touch devices.
  event.preventDefault();

  if (key === 'backspace') {
    holdTimer = setTimeout(() => {
      holdTimer = null;
      haptics.trigger('warning');
      emit('press', 'clear');
    }, LONG_PRESS_MS);
  }

  haptics.trigger('light');
  emit('press', key);
};

const handlePointerUp = (): void => {
  clearHoldTimer();
};

/** Keyboard parity for switch-control and desktop users. */
const handleKeydown = (key: KeypadKey, event: KeyboardEvent): void => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  if (isDisabledKey(key)) return;

  event.preventDefault();
  haptics.trigger('light');
  emit('press', key);
};

onBeforeUnmount(clearHoldTimer);

/** Exposed for screens that need to cancel an in-flight hold (for example on route leave). */
defineExpose({ cancelHold: handlePointerUp });
</script>

<template>
  <div class="app-keypad" role="group" :aria-label="label" :class="{ disabled }">
    <button
      v-for="(key, index) in keys"
      :key="`${key}-${index}`"
      type="button"
      class="keypad-key"
      :class="{ 'keypad-key--action': key === 'backspace' || key === 'clear' }"
      :disabled="isDisabledKey(key)"
      :aria-label="key === 'backspace' ? 'Delete last digit' : key === 'clear' ? 'Clear amount' : key"
      @pointerdown="handlePointerDown(key, $event)"
      @pointerup="handlePointerUp"
      @pointercancel="handlePointerUp"
      @pointerleave="handlePointerUp"
      @keydown="handleKeydown(key, $event)"
    >
      <AppIcon v-if="key === 'backspace'" name="delete" :size="22" />
      <AppIcon v-else-if="key === 'clear'" name="x" :size="20" />
      <span v-else class="key-label">{{ key }}</span>
    </button>
  </div>
</template>

<style scoped>
.app-keypad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2);
  width: 100%;
}

.app-keypad.disabled {
  opacity: 0.5;
}

.keypad-key {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: var(--keypad-key-height);
  min-width: var(--tap-target);
  padding: 0;
  background-color: var(--color-surface-sunken);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  font-family: var(--font-family-numeric);
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  touch-action: manipulation;
  user-select: none;
  transition:
    background-color var(--duration-instant) var(--ease-standard),
    transform var(--duration-instant) var(--ease-standard);
}

.keypad-key:active:not(:disabled) {
  background-color: var(--color-primary-soft);
  transform: scale(0.96);
}

.keypad-key:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.keypad-key--action {
  color: var(--color-text-secondary);
}

.key-label {
  line-height: 1;
}

@media (prefers-reduced-motion: reduce) {
  .keypad-key:active:not(:disabled) {
    transform: none;
  }
}
</style>
