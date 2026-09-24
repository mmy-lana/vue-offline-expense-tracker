<script setup lang="ts">
/**
 * Category bubble grid.
 *
 * Presents expense or income categories as colour-coded bubbles with a ring
 * selection indicator and two-line clamped labels, plus an inline entry point
 * for creating a category without leaving the entry flow.
 */

import { computed, nextTick, ref } from 'vue';
import { useHaptics } from '@/composables/useHaptics';
import AppIcon from '@/components/ui/AppIcon.vue';
import { resolveIconName } from '@/components/ui/icons';
import type { Category } from '@/types/models';

interface Props {
  modelValue: string;
  categories: readonly Category[];
  /** Shows the trailing "create category" tile. */
  allowCreate?: boolean;
  disabled?: boolean;
  /** Accessible group name. */
  label?: string;
}

const props = withDefaults(defineProps<Props>(), {
  allowCreate: false,
  disabled: false,
  label: 'Category'
});

const emit = defineEmits<{
  (event: 'update:modelValue', categoryId: string): void;
  (event: 'create'): void;
  (event: 'select', category: Category): void;
}>();

const haptics = useHaptics();

const visibleCategories = computed(() =>
  props.categories.filter((category) => !category.isArchived && !category.isHidden)
);

const isEmpty = computed(() => visibleCategories.value.length === 0);
const buttonRefs = ref<HTMLButtonElement[]>([]);

const selectCategory = (category: Category): void => {
  if (props.disabled || category.id === props.modelValue) return;

  haptics.trigger('selection');
  emit('update:modelValue', category.id);
  emit('select', category);
};

const handleCreate = (): void => {
  haptics.trigger('light');
  emit('create');
};

const handleKeydown = async (event: KeyboardEvent, index: number): Promise<void> => {
  const total = visibleCategories.value.length;
  if (total === 0) return;

  let nextIndex: number | null = null;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    nextIndex = (index + 1) % total;
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    nextIndex = (index - 1 + total) % total;
  }

  if (nextIndex !== null) {
    event.preventDefault();
    const target = visibleCategories.value[nextIndex];
    if (target) {
      selectCategory(target);
      await nextTick();
      buttonRefs.value[nextIndex]?.focus();
    }
  }
};
</script>

<template>
  <div class="category-picker" role="radiogroup" :aria-label="label">
    <button
      v-for="(category, index) in visibleCategories"
      :key="category.id"
      :ref="(el) => { if (el) buttonRefs[index] = el as HTMLButtonElement; }"
      type="button"
      class="category-tile"
      role="radio"
      :aria-checked="category.id === modelValue"
      :tabindex="category.id === modelValue || (!modelValue && index === 0) ? 0 : -1"
      :disabled="disabled"
      :class="{ selected: category.id === modelValue }"
      @click="selectCategory(category)"
      @keydown="handleKeydown($event, index)"
    >
      <span class="category-bubble" :style="{ backgroundColor: category.colorHex }">
        <AppIcon :name="resolveIconName(category.icon)" :size="18" color="#FFFFFF" />
      </span>
      <span class="category-label">{{ category.name }}</span>
    </button>

    <button
      v-if="allowCreate"
      type="button"
      class="category-tile create-tile"
      :disabled="disabled"
      aria-label="Create new category"
      @click="handleCreate"
    >
      <span class="category-bubble create-bubble">
        <AppIcon name="plus" :size="18" />
      </span>
      <span class="category-label">New</span>
    </button>

    <p v-if="isEmpty && !allowCreate" class="category-empty">
      No categories available for this type yet.
    </p>
    <p v-else-if="isEmpty" class="category-empty">
      No categories yet — create your first one to start categorising.
    </p>
  </div>
</template>

<style scoped>
.category-picker {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-3) var(--space-2);
  width: 100%;
}

@media (min-width: 430px) {
  .category-picker {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}

.category-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  min-width: 0;
  min-height: var(--tap-target);
  padding: var(--space-1);
  background: transparent;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
}

.category-tile:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.category-bubble {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border-radius: var(--radius-circle);
  transition:
    transform var(--duration-fast) var(--ease-spring),
    outline-color var(--duration-fast) var(--ease-standard);
  outline: 2px solid transparent;
  outline-offset: 2px;
}

.category-tile:active .category-bubble {
  transform: scale(0.94);
}

.category-tile.selected .category-bubble {
  outline: 3px solid var(--color-primary);
  transform: scale(1.04);
}

.category-label {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  max-width: 72px;
  font-size: var(--font-size-2xs);
  font-weight: var(--font-weight-medium);
  line-height: 1.15;
  color: var(--color-text-muted);
  text-align: center;
  word-break: break-word;
}

.category-tile.selected .category-label {
  color: var(--color-text-primary);
  font-weight: var(--font-weight-semibold);
}

.create-bubble {
  background-color: transparent;
  border: 1.5px dashed var(--color-border-strong);
  color: var(--color-text-muted);
}

.create-tile:active .create-bubble {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.category-empty {
  grid-column: 1 / -1;
  margin: 0;
  padding: var(--space-4);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  text-align: center;
}

@media (prefers-reduced-motion: reduce) {
  .category-bubble {
    transition: none;
    transform: none;
  }
}
</style>
