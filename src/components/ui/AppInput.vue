<script setup lang="ts">
/**
 * Native-feel text field.
 *
 * Owns label/error/hint wiring, a 16px minimum font size (so iOS never zooms on
 * focus), an optional leading icon and a clear affordance. Errors are announced
 * through `aria-invalid` + `aria-describedby`.
 */

import { computed, ref, useId } from 'vue';
import AppIcon from './AppIcon.vue';
import type { IconName } from './icons';

type InputType = 'text' | 'search' | 'email' | 'password' | 'tel' | 'url';
type InputMode = 'text' | 'search' | 'email' | 'numeric' | 'decimal' | 'tel' | 'url';
type EnterKeyHint = 'enter' | 'done' | 'go' | 'next' | 'previous' | 'search' | 'send';

interface Props {
  modelValue: string;
  label?: string;
  placeholder?: string;
  type?: InputType;
  inputMode?: InputMode;
  enterKeyHint?: EnterKeyHint;
  autocomplete?: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
  readonly?: boolean;
  clearable?: boolean;
  maxlength?: number;
  icon?: IconName;
  /** Static suffix such as a currency code. */
  suffix?: string;
  /** Renders the label visually hidden while keeping it for screen readers. */
  hideLabel?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  label: undefined,
  placeholder: undefined,
  type: 'text',
  inputMode: 'text',
  enterKeyHint: undefined,
  autocomplete: 'off',
  error: undefined,
  hint: undefined,
  disabled: false,
  readonly: false,
  clearable: false,
  maxlength: undefined,
  icon: undefined,
  suffix: undefined,
  hideLabel: false
});

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
  (event: 'focus', payload: FocusEvent): void;
  (event: 'blur', payload: FocusEvent): void;
  (event: 'enter'): void;
  (event: 'clear'): void;
}>();

const inputId = useId();
const errorId = `${inputId}-error`;
const hintId = `${inputId}-hint`;
const inputRef = ref<HTMLInputElement | null>(null);

const hasError = computed(() => Boolean(props.error && props.error.length > 0));
const showClear = computed(() => props.clearable && props.modelValue.length > 0 && !props.disabled && !props.readonly);
const describedBy = computed(() => {
  const ids = [hasError.value ? errorId : null, props.hint && !hasError.value ? hintId : null].filter(
    (id): id is string => id !== null
  );
  return ids.length > 0 ? ids.join(' ') : undefined;
});

const handleInput = (event: Event): void => {
  emit('update:modelValue', (event.target as HTMLInputElement).value);
};

const handleClear = (): void => {
  emit('update:modelValue', '');
  emit('clear');
  inputRef.value?.focus();
};

const handleEnter = (): void => {
  emit('enter');
};

/** Exposed so parent screens can drive focus (for example after a validation error). */
const focus = (): void => inputRef.value?.focus();
const blur = (): void => inputRef.value?.blur();

defineExpose({ focus, blur, inputRef });
</script>

<template>
  <div class="app-input" :class="{ 'has-error': hasError, disabled }">
    <label v-if="label" class="field-label" :class="{ 'visually-hidden': hideLabel }" :for="inputId">
      {{ label }}
    </label>

    <div class="field-shell">
      <AppIcon v-if="icon" class="field-icon" :name="icon" :size="18" />

      <input
        :id="inputId"
        ref="inputRef"
        class="field-control"
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        :inputmode="inputMode"
        :enterkeyhint="enterKeyHint"
        :autocomplete="autocomplete"
        :maxlength="maxlength"
        :disabled="disabled"
        :readonly="readonly"
        :aria-invalid="hasError ? 'true' : undefined"
        :aria-describedby="describedBy"
        @input="handleInput"
        @focus="emit('focus', $event)"
        @blur="emit('blur', $event)"
        @keydown.enter="handleEnter"
      />

      <span v-if="suffix" class="field-suffix">{{ suffix }}</span>

      <button
        v-if="showClear"
        type="button"
        class="clear-button"
        aria-label="Clear input"
        @click="handleClear"
      >
        <AppIcon name="x" :size="16" />
      </button>
    </div>

    <p v-if="hasError" :id="errorId" class="field-error" role="alert">{{ error }}</p>
    <p v-else-if="hint" :id="hintId" class="field-hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.app-input {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.field-label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

.field-shell {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--tap-target);
  padding: 0 var(--space-3);
  background-color: var(--color-surface-sunken);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  transition:
    border-color var(--duration-fast) var(--ease-standard),
    box-shadow var(--duration-fast) var(--ease-standard);
}

.field-shell:focus-within {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-soft);
}

.has-error .field-shell {
  border-color: var(--color-danger);
}

.has-error .field-shell:focus-within {
  box-shadow: 0 0 0 3px var(--color-danger-soft);
}

.disabled .field-shell {
  opacity: 0.55;
}

.field-icon {
  color: var(--color-text-muted);
}

.field-control {
  flex: 1;
  min-width: 0;
  min-height: calc(var(--tap-target) - 2px);
  padding: 0;
  background: transparent;
  border: none;
  outline: none;
  color: var(--color-text-primary);
}

.field-control::placeholder {
  color: var(--color-text-muted);
}

.field-control:disabled {
  cursor: not-allowed;
}

.field-suffix {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-muted);
}

.clear-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: var(--radius-circle);
  background-color: var(--color-border);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.clear-button:active {
  transform: scale(0.9);
}

.field-error {
  margin: 0;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-danger);
}

.field-hint {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}
</style>
