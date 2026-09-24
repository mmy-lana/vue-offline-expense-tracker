<script setup lang="ts">
/**
 * iOS-style segmented control with a sliding pill indicator.
 *
 * Accessibility: exposed as a radiogroup with roving tabindex and full arrow
 * key support, so it behaves like a native picker rather than a row of buttons.
 */

import { computed, nextTick, ref, watch } from 'vue';
import { useHaptics } from '@/composables/useHaptics';
import AppIcon from './AppIcon.vue';
import type { IconName } from './icons';

export interface SegmentOption {
  label: string;
  value: string | number;
  icon?: IconName;
  disabled?: boolean;
}

interface Props {
  modelValue: string | number;
  options: readonly SegmentOption[];
  /** Accessible name for the group. */
  label?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  label: undefined,
  size: 'md',
  disabled: false
});

const emit = defineEmits<{ (event: 'update:modelValue', value: string | number): void }>();

const haptics = useHaptics();
const buttonRefs = ref<HTMLButtonElement[]>([]);

const activeIndex = computed(() => {
  const index = props.options.findIndex((option) => option.value === props.modelValue);
  return index >= 0 ? index : 0;
});

const segmentCount = computed(() => Math.max(props.options.length, 1));

const indicatorStyle = computed(() => ({
  width: `calc((100% - 2 * var(--segment-padding)) / ${segmentCount.value})`,
  transform: `translateX(calc(${activeIndex.value} * 100%))`
}));

const selectIndex = (index: number): void => {
  const option = props.options[index];
  if (!option || option.disabled || props.disabled || option.value === props.modelValue) return;

  haptics.trigger('selection');
  emit('update:modelValue', option.value);
};

const moveFocus = async (index: number): Promise<void> => {
  selectIndex(index);
  await nextTick();
  buttonRefs.value[index]?.focus();
};

const handleKeydown = (event: KeyboardEvent): void => {
  const lastIndex = props.options.length - 1;

  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      event.preventDefault();
      void moveFocus(Math.min(activeIndex.value + 1, lastIndex));
      break;
    case 'ArrowLeft':
    case 'ArrowUp':
      event.preventDefault();
      void moveFocus(Math.max(activeIndex.value - 1, 0));
      break;
    case 'Home':
      event.preventDefault();
      void moveFocus(0);
      break;
    case 'End':
      event.preventDefault();
      void moveFocus(lastIndex);
      break;
    default:
      break;
  }
};

// Keep the element list in sync when options change length.
watch(
  () => props.options.length,
  (length) => {
    buttonRefs.value = buttonRefs.value.slice(0, length);
  }
);

const setButtonRef = (element: unknown, index: number): void => {
  if (element instanceof HTMLButtonElement) {
    buttonRefs.value[index] = element;
  }
};
</script>

<template>
  <div
    class="app-segmented"
    :class="[`size-${size}`, { disabled }]"
    role="radiogroup"
    :aria-label="label"
    @keydown="handleKeydown"
  >
    <span class="indicator" :style="indicatorStyle" aria-hidden="true" />

    <button
      v-for="(option, index) in options"
      :key="option.value"
      :ref="(element) => setButtonRef(element, index)"
      type="button"
      class="segment"
      :class="{ active: index === activeIndex }"
      role="radio"
      :aria-checked="index === activeIndex"
      :tabindex="index === activeIndex ? 0 : -1"
      :disabled="option.disabled || disabled"
      @click="selectIndex(index)"
    >
      <AppIcon v-if="option.icon" :name="option.icon" :size="size === 'sm' ? 14 : 16" />
      <span class="segment-label">{{ option.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.app-segmented {
  --segment-padding: 3px;
  position: relative;
  display: flex;
  align-items: stretch;
  padding: var(--segment-padding);
  background-color: var(--color-surface-sunken);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  isolation: isolate;
}

.app-segmented.disabled {
  opacity: 0.5;
}

.indicator {
  position: absolute;
  top: var(--segment-padding);
  left: var(--segment-padding);
  bottom: var(--segment-padding);
  background-color: var(--color-surface);
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-sm);
  transition: transform var(--duration-base) var(--ease-spring);
  z-index: 0;
}

.segment {
  position: relative;
  z-index: 1;
  flex: 1 1 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  min-width: 0;
  min-height: var(--tap-target);
  padding: 0 var(--space-2);
  background: transparent;
  border: none;
  border-radius: var(--radius-pill);
  color: var(--color-text-muted);
  font-family: inherit;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-standard);
}

.segment.active {
  color: var(--color-text-primary);
}

.segment:disabled {
  cursor: not-allowed;
}

.segment-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.size-sm .segment {
  min-height: var(--tap-target);
  font-size: var(--font-size-xs);
}

@media (prefers-reduced-motion: reduce) {
  .indicator {
    transition: none;
  }
}
</style>
