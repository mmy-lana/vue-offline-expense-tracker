<script setup lang="ts">
/**
 * Compact status / category chip.
 *
 * Colour comes from semantic variants only, so contrast stays AA-compliant in
 * both themes; an optional dot or icon adds a second, non-colour signal.
 */

import { computed } from 'vue';
import AppIcon from './AppIcon.vue';
import type { IconName } from './icons';

type BadgeVariant = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';
type BadgeSize = 'sm' | 'md';

interface Props {
  variant?: BadgeVariant;
  size?: BadgeSize;
  /** Leading status dot. */
  dot?: boolean;
  icon?: IconName;
  /** Accessible text when the badge content is purely visual. */
  label?: string;
  /** Circle colour override, used for category chips. */
  color?: string;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'neutral',
  size: 'sm',
  dot: false,
  icon: undefined,
  label: undefined,
  color: undefined
});

const dotStyle = computed(() => (props.color ? { backgroundColor: props.color } : undefined));
</script>

<template>
  <span
    class="app-badge"
    :class="[`variant-${variant}`, `size-${size}`]"
    :aria-label="label"
    :style="color ? { '--badge-accent': color } : undefined"
  >
    <span v-if="dot" class="badge-dot" :style="dotStyle" aria-hidden="true" />
    <AppIcon v-if="icon" :name="icon" :size="size === 'sm' ? 12 : 14" />
    <slot />
  </span>
</template>

<style scoped>
.app-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  border-radius: var(--radius-pill);
  font-weight: var(--font-weight-semibold);
  line-height: 1;
  white-space: nowrap;
}

.size-sm {
  min-height: 22px;
  padding: 0 var(--space-2);
  font-size: var(--font-size-2xs);
}

.size-md {
  min-height: 26px;
  padding: 0 var(--space-3);
  font-size: var(--font-size-xs);
}

.badge-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-circle);
  background-color: var(--badge-accent, currentColor);
}

.variant-neutral {
  background-color: var(--color-neutral-soft);
  color: var(--color-text-secondary);
}

.variant-primary {
  background-color: var(--color-primary-soft);
  color: var(--color-primary-strong);
}

.variant-success {
  background-color: var(--color-success-soft);
  color: var(--color-success);
}

.variant-warning {
  background-color: var(--color-warning-soft);
  color: var(--color-warning);
}

.variant-danger {
  background-color: var(--color-danger-soft);
  color: var(--color-danger);
}
</style>
