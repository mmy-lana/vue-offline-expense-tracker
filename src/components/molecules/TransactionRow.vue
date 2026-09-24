<script setup lang="ts">
/**
 * Swipeable ledger row.
 *
 * Gesture contract: `touch-action: pan-y` keeps vertical scrolling native while a
 * horizontal drag reveals the edit/delete rail. The rail is never the only way
 * to reach an action — the row itself is a 44px+ button, and the revealed
 * actions are real buttons reachable by keyboard.
 */

import { computed, ref } from 'vue';
import { useHaptics } from '@/composables/useHaptics';
import AmountDisplay from './AmountDisplay.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import { resolveIconName } from '@/components/ui/icons';
import { formatDayHeaderLabel } from '@/utils/date';
import type { Account, Category, Transaction } from '@/types/models';

interface Props {
  transaction: Transaction;
  category?: Category;
  account?: Account;
  /** Destination account label for transfer rows. */
  toAccount?: Account;
  currency: string;
  /** Renders the day header instead of the note line. */
  showDate?: boolean;
  /** Shows a paperclip marker when the entry has an attachment. */
  hasReceipt?: boolean;
  /** Enables the swipe rail; disabled in read-only contexts. */
  swipeable?: boolean;
  /** Open instance rail, controlled by the parent list so only one stays open. */
  isOpen?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  category: undefined,
  account: undefined,
  toAccount: undefined,
  showDate: false,
  hasReceipt: false,
  swipeable: true,
  isOpen: false
});

const emit = defineEmits<{
  (event: 'select', transaction: Transaction): void;
  (event: 'edit', transaction: Transaction): void;
  (event: 'delete', transaction: Transaction): void;
  (event: 'toggle-open', transaction: Transaction, open: boolean): void;
}>();

const RAIL_WIDTH = 140;
const REVEAL_THRESHOLD = 48;
const DRAG_LOCK = 8;

const haptics = useHaptics();
const dragOffset = ref(0);
const isDragging = ref(false);

let startX = 0;
let startY = 0;
let axisLocked: 'none' | 'horizontal' | 'vertical' = 'none';

const baseOffset = computed(() => (props.isOpen ? -RAIL_WIDTH : 0));
const offset = computed(() => {
  const raw = isDragging.value ? baseOffset.value + dragOffset.value : baseOffset.value;
  return Math.min(0, Math.max(-RAIL_WIDTH, raw));
});

const surfaceStyle = computed(() => ({
  transform: offset.value === 0 ? undefined : `translateX(${offset.value}px)`,
  transition: isDragging.value ? 'none' : undefined
}));

const iconName = computed(() => resolveIconName(props.category?.icon ?? 'help-circle'));
const bubbleColor = computed(() => props.category?.colorHex ?? '#64748B');
const title = computed(() => {
  if (props.transaction.type === 'transfer') {
    const from = props.account?.name ?? 'Account';
    const to = props.toAccount?.name ?? 'Account';
    return `${from} → ${to}`;
  }
  return props.category?.name ?? 'Uncategorized';
});

const subtitle = computed(() => {
  if (props.transaction.note.length > 0) return props.transaction.note;
  if (props.showDate) return formatDayHeaderLabel(props.transaction.date);
  return props.account?.name ?? '';
});

const amountTone = computed(() => props.transaction.type);

const handleTouchStart = (event: TouchEvent): void => {
  if (!props.swipeable) return;
  const touch = event.touches[0];
  if (!touch) return;

  startX = touch.clientX;
  startY = touch.clientY;
  axisLocked = 'none';
  isDragging.value = true;
  dragOffset.value = 0;
};

const handleTouchMove = (event: TouchEvent): void => {
  if (!isDragging.value) return;
  const touch = event.touches[0];
  if (!touch) return;

  const deltaX = touch.clientX - startX;
  const deltaY = touch.clientY - startY;

  if (axisLocked === 'none') {
    if (Math.abs(deltaX) < DRAG_LOCK && Math.abs(deltaY) < DRAG_LOCK) return;
    axisLocked = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
  }

  if (axisLocked === 'vertical') {
    dragOffset.value = 0;
    return;
  }

  dragOffset.value = deltaX;
};

const handleTouchEnd = (): void => {
  if (!isDragging.value) return;

  const shouldOpen = axisLocked === 'horizontal' && dragOffset.value < -REVEAL_THRESHOLD;
  const shouldClose = axisLocked === 'horizontal' && dragOffset.value > REVEAL_THRESHOLD;

  isDragging.value = false;
  dragOffset.value = 0;
  axisLocked = 'none';

  if (shouldOpen && !props.isOpen) {
    haptics.trigger('selection');
    emit('toggle-open', props.transaction, true);
  } else if ((shouldClose && props.isOpen) || (shouldOpen && props.isOpen)) {
    emit('toggle-open', props.transaction, false);
  }
};

const handleSelect = (): void => {
  if (props.isOpen) {
    emit('toggle-open', props.transaction, false);
    return;
  }

  haptics.trigger('light');
  emit('select', props.transaction);
};

const handleEdit = (): void => {
  haptics.trigger('light');
  emit('edit', props.transaction);
};

const handleDelete = (): void => {
  haptics.trigger('warning');
  emit('delete', props.transaction);
};
</script>

<template>
  <div class="tx-row" :class="{ 'is-open': isOpen }">
    <div v-if="swipeable" class="tx-rail" aria-hidden="false">
      <button type="button" class="rail-button rail-edit" aria-label="Edit transaction" @click="handleEdit">
        <AppIcon name="edit" :size="18" />
        <span class="rail-label">Edit</span>
      </button>
      <button
        type="button"
        class="rail-button rail-delete"
        aria-label="Delete transaction"
        @click="handleDelete"
      >
        <AppIcon name="trash" :size="18" />
        <span class="rail-label">Delete</span>
      </button>
    </div>

    <button
      type="button"
      class="tx-surface"
      :style="surfaceStyle"
      @click="handleSelect"
      @touchstart.passive="handleTouchStart"
      @touchmove.passive="handleTouchMove"
      @touchend.passive="handleTouchEnd"
      @touchcancel.passive="handleTouchEnd"
    >
      <span class="tx-bubble" :style="{ backgroundColor: bubbleColor }">
        <AppIcon :name="iconName" :size="18" color="#FFFFFF" />
      </span>

      <span class="tx-body">
        <span class="tx-title-row">
          <span class="tx-title">{{ title }}</span>
          <AppIcon v-if="hasReceipt" class="tx-receipt" name="receipt" :size="14" />
        </span>
        <span v-if="subtitle" class="tx-subtitle">{{ subtitle }}</span>
      </span>

      <AmountDisplay
        class="tx-amount"
        :amount="transaction.amount"
        :currency="currency"
        :tone="amountTone"
        :show-sign="transaction.type !== 'transfer'"
        size="md"
      />
    </button>
  </div>
</template>

<style scoped>
.tx-row {
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-lg);
  background-color: var(--color-surface);
  touch-action: pan-y;
}

.tx-rail {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: stretch;
}

.rail-button {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 70px;
  min-width: var(--tap-target);
  border: none;
  color: #ffffff;
  font-family: inherit;
  font-size: var(--font-size-2xs);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
}

.rail-button:active {
  filter: brightness(0.92);
}

.rail-edit {
  background-color: var(--color-primary-strong);
}

.rail-delete {
  background-color: var(--color-danger);
}

.rail-label {
  line-height: 1;
}

.tx-surface {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 60px;
  padding: var(--space-2) var(--space-4);
  background-color: var(--color-surface);
  border: none;
  border-radius: var(--radius-lg);
  text-align: left;
  cursor: pointer;
  transition: transform var(--duration-base) var(--ease-decelerate);
}

.tx-surface:active {
  background-color: var(--color-surface-sunken);
}

.tx-bubble {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  border-radius: var(--radius-circle);
}

.tx-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.tx-title-row {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  min-width: 0;
}

.tx-title {
  overflow: hidden;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tx-receipt {
  color: var(--color-text-muted);
}

.tx-subtitle {
  overflow: hidden;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tx-amount {
  flex-shrink: 0;
}

@media (prefers-reduced-motion: reduce) {
  .tx-surface {
    transition: none;
  }
}
</style>
