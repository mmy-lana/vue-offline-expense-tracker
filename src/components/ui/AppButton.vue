<script setup lang="ts">
/**
 * Touch-first button.
 *
 * Ergonomics: 44px minimum hit box at every size, active-state compression for
 * tactile feedback, haptic pulse on press, and a busy state that blocks
 * double-submission while keeping its measured width.
 */

import { computed } from 'vue';
import { useHaptics, type HapticType } from '@/composables/useHaptics';
import AppIcon from './AppIcon.vue';
import type { IconName } from './icons';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon';
type ButtonSize = 'sm' | 'md' | 'lg';

interface Props {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Native button type; `submit` for form actions. */
  nativeType?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  loading?: boolean;
  /** Stretch to the container width. */
  block?: boolean;
  /** Leading icon, or the only visible content for `variant="icon"`. */
  icon?: IconName;
  /** Trailing icon rendered after the label. */
  trailingIcon?: IconName;
  /** Accessible name, required when the button has no text content. */
  label?: string;
  /** Haptic pattern; `none` disables the pulse. */
  haptic?: HapticType | 'none';
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  nativeType: 'button',
  disabled: false,
  loading: false,
  block: false,
  icon: undefined,
  trailingIcon: undefined,
  label: undefined,
  haptic: 'light'
});

const emit = defineEmits<{ (event: 'click', payload: MouseEvent): void }>();

const haptics = useHaptics();

const isInteractive = computed(() => !props.disabled && !props.loading);
const isIconOnly = computed(() => props.variant === 'icon');

const handleClick = (event: MouseEvent): void => {
  if (!isInteractive.value) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  if (props.haptic !== 'none') haptics.trigger(props.haptic);
  emit('click', event);
};
</script>

<template>
  <button
    class="app-button"
    :class="[`variant-${variant}`, `size-${size}`, { block, loading }]"
    :type="nativeType"
    :disabled="disabled || loading"
    :aria-label="label"
    :aria-busy="loading ? 'true' : undefined"
    @click="handleClick"
  >
    <span v-if="loading" class="spinner" aria-hidden="true" />
    <AppIcon v-else-if="icon" :name="icon" :size="isIconOnly ? 22 : size === 'sm' ? 16 : 18" />

    <span v-if="!isIconOnly" class="label">
      <slot />
    </span>

    <AppIcon v-if="trailingIcon && !loading" :name="trailingIcon" :size="16" />
  </button>
</template>

<script lang="ts">
export default {
  name: 'AppButton'
};
</script>

<style scoped>
.app-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: var(--tap-target);
  min-width: var(--tap-target);
  padding: 0 var(--space-4);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  line-height: 1;
  cursor: pointer;
  transition:
    transform var(--duration-fast) var(--ease-standard),
    background-color var(--duration-fast) var(--ease-standard),
    border-color var(--duration-fast) var(--ease-standard),
    opacity var(--duration-fast) var(--ease-standard);
}

.app-button.block {
  display: flex;
  width: 100%;
}

.app-button:active:not(:disabled) {
  transform: scale(0.96);
}

.app-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

/* ---------- Sizes ---------- */
.size-sm {
  min-height: var(--tap-target);
  padding: 0 var(--space-3);
  font-size: var(--font-size-sm);
}

.size-md {
  padding: 0 var(--space-4);
}

.size-lg {
  min-height: 52px;
  padding: 0 var(--space-6);
  font-size: var(--font-size-md);
  border-radius: var(--radius-lg);
}

.size-sm.variant-icon,
.size-md.variant-icon,
.size-lg.variant-icon {
  padding: 0;
  width: var(--tap-target);
}

.size-lg.variant-icon {
  width: 52px;
  height: 52px;
}

/* ---------- Variants ---------- */
.variant-primary {
  background-color: var(--color-primary-strong);
  color: #ffffff;
  box-shadow: var(--shadow-sm);
}

.variant-primary:active:not(:disabled) {
  background-color: var(--color-primary);
}

.variant-secondary {
  background-color: var(--color-surface);
  border-color: var(--color-border);
  color: var(--color-text-primary);
}

.variant-secondary:active:not(:disabled) {
  background-color: var(--color-surface-sunken);
}

.variant-danger {
  background-color: var(--color-danger);
  color: #ffffff;
}

.variant-ghost {
  background-color: transparent;
  color: var(--color-primary);
}

.variant-ghost:active:not(:disabled) {
  background-color: var(--color-primary-soft);
}

.variant-icon {
  background-color: transparent;
  color: var(--color-text-secondary);
  border-radius: var(--radius-sm);
}

.variant-icon:active:not(:disabled) {
  background-color: var(--color-surface-sunken);
  color: var(--color-text-primary);
}

/* ---------- States ---------- */
.label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  white-space: nowrap;
}

.spinner {
  width: 16px;
  height: 16px;
  border-radius: var(--radius-circle);
  border: 2px solid currentColor;
  border-top-color: transparent;
  animation: button-spin 0.7s linear infinite;
}

@keyframes button-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-button:active:not(:disabled) {
    transform: none;
  }

  .spinner {
    animation-duration: 2s;
  }
}
</style>
