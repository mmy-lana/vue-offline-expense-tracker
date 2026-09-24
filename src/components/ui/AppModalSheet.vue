<script setup lang="ts">
/**
 * Native bottom-sheet modal.
 *
 * Behaviour contract:
 *  - Teleports to `<body>` so it escapes the shell's stacking/overflow context.
 *  - Dims and blurs the page behind it, and locks background scrolling.
 *  - Traps Tab focus, closes on Escape, and restores focus to the trigger.
 *  - Dismisses on a downward swipe (~96px) through passive touch listeners, so
 *    the gesture can never block scrolling inside the sheet.
 */

import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import AppIcon from './AppIcon.vue';

interface Props {
  modelValue: boolean;
  title?: string;
  description?: string;
  /** When false, backdrop taps and swipes are ignored (decision required). */
  dismissible?: boolean;
  /** Hides the header close button for non-cancelable flows. */
  showClose?: boolean;
  /** Accessible name when no visible title is rendered. */
  ariaLabel?: string;
  /** Extra class hooks for per-screen sheet sizing. */
  sheetClass?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: undefined,
  description: undefined,
  dismissible: true,
  showClose: true,
  ariaLabel: undefined,
  sheetClass: undefined
});

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
  (event: 'opened'): void;
  (event: 'closed'): void;
}>();

const DISMISS_DISTANCE = 96;
const DISMISS_VELOCITY = 0.5;

const sheetRef = ref<HTMLElement | null>(null);
const dragOffset = ref(0);
const isDragging = ref(false);

let dragStartY = 0;
let dragStartTime = 0;
let lastFocusedElement: HTMLElement | null = null;
let previousBodyOverflow = '';

const titleId = `sheet-title-${Math.random().toString(36).slice(2, 9)}`;
const descriptionId = `${titleId}-description`;

const title = computed(() => props.title ?? '');
const isVisible = computed(() => props.modelValue);

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

const getFocusable = (): HTMLElement[] => {
  const root = sheetRef.value;
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (element) => element.offsetParent !== null || element === document.activeElement
  );
};

const lockScroll = (): void => {
  previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
};

const unlockScroll = (): void => {
  document.body.style.overflow = previousBodyOverflow;
};

const close = (): void => {
  if (!props.dismissible) return;
  emit('update:modelValue', false);
};

const handleKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
    return;
  }

  if (event.key !== 'Tab') return;

  const focusable = getFocusable();
  if (focusable.length === 0) {
    event.preventDefault();
    sheetRef.value?.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) return;

  const active = document.activeElement;
  if (event.shiftKey && (active === first || active === sheetRef.value)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
};

/* --------------------------- swipe-to-dismiss --------------------------- */

const handleTouchStart = (event: TouchEvent): void => {
  if (!props.dismissible) return;
  const touch = event.touches[0];
  if (!touch) return;

  dragStartY = touch.clientY;
  dragStartTime = Date.now();
  isDragging.value = true;
};

const handleTouchMove = (event: TouchEvent): void => {
  if (!isDragging.value) return;
  const touch = event.touches[0];
  if (!touch) return;

  const delta = touch.clientY - dragStartY;
  dragOffset.value = delta > 0 ? delta : 0;
};

const handleTouchEnd = (): void => {
  if (!isDragging.value) return;

  const elapsed = Math.max(Date.now() - dragStartTime, 1);
  const velocity = dragOffset.value / elapsed;
  const shouldDismiss = dragOffset.value > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY;

  isDragging.value = false;

  if (shouldDismiss && props.dismissible) {
    dragOffset.value = 0;
    close();
    return;
  }

  dragOffset.value = 0;
};

const sheetStyle = computed(() => ({
  transform: dragOffset.value > 0 ? `translateY(${dragOffset.value}px)` : undefined,
  transition: isDragging.value ? 'none' : undefined
}));

/* ------------------------------- lifecycle ------------------------------ */

watch(
  () => props.modelValue,
  async (open) => {
    if (open) {
      lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      lockScroll();
      window.addEventListener('keydown', handleKeydown);

      await nextTick();
      const focusable = getFocusable();
      (focusable[0] ?? sheetRef.value)?.focus();
      emit('opened');
      return;
    }

    window.removeEventListener('keydown', handleKeydown);
    unlockScroll();
    dragOffset.value = 0;
    isDragging.value = false;
    lastFocusedElement?.focus();
    lastFocusedElement = null;
    emit('closed');
  }
);

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
  if (props.modelValue) unlockScroll();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet-fade">
      <div v-if="isVisible" class="sheet-backdrop" @click.self="close" />
    </Transition>

    <Transition name="sheet-slide">
      <div
        v-if="isVisible"
        ref="sheetRef"
        class="sheet"
        :class="sheetClass"
        role="dialog"
        aria-modal="true"
        :aria-label="!title && ariaLabel ? ariaLabel : undefined"
        :aria-labelledby="title ? titleId : undefined"
        :aria-describedby="description ? descriptionId : undefined"
        tabindex="-1"
        :style="sheetStyle"
        @click.self="close"
        @touchstart.passive="handleTouchStart"
        @touchmove.passive="handleTouchMove"
        @touchend.passive="handleTouchEnd"
        @touchcancel.passive="handleTouchEnd"
      >
        <div class="sheet-grabber" aria-hidden="true">
          <span class="grabber-bar" />
        </div>

        <header v-if="title || showClose" class="sheet-header">
          <div class="sheet-heading">
            <h2 v-if="title" :id="titleId" class="sheet-title">{{ title }}</h2>
            <p v-if="description" :id="descriptionId" class="sheet-description">{{ description }}</p>
          </div>

          <button
            v-if="showClose && dismissible"
            type="button"
            class="sheet-close"
            aria-label="Close"
            @click="close"
          >
            <AppIcon name="x" :size="20" />
          </button>
        </header>

        <div class="sheet-body">
          <slot />
        </div>

        <footer v-if="$slots.footer" class="sheet-footer">
          <slot name="footer" />
        </footer>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--z-sheet);
  background-color: var(--color-backdrop);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.sheet {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: calc(var(--z-sheet) + 1);
  display: flex;
  flex-direction: column;
  max-height: 92dvh;
  margin: 0 auto;
  width: 100%;
  max-width: var(--sheet-max-width);
  background-color: var(--color-surface);
  border-top-left-radius: var(--radius-xl);
  border-top-right-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  outline: none;
  will-change: transform;
  padding-left: max(var(--safe-area-left), 0px);
  padding-right: max(var(--safe-area-right), 0px);
}

.sheet-grabber {
  display: flex;
  justify-content: center;
  padding: var(--space-2) 0 var(--space-1);
  cursor: grab;
  touch-action: none;
}

.grabber-bar {
  width: 40px;
  height: 4px;
  border-radius: var(--radius-pill);
  background-color: var(--color-border-strong);
}

.sheet-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4) var(--space-3);
}

.sheet-heading {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.sheet-title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  letter-spacing: -0.01em;
}

.sheet-description {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.sheet-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: var(--tap-target);
  height: var(--tap-target);
  margin: calc(var(--space-2) * -1) calc(var(--space-2) * -1) 0 0;
  padding: 0;
  border: none;
  border-radius: var(--radius-circle);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.sheet-close:active {
  background-color: var(--color-surface-sunken);
  transform: scale(0.92);
}

.sheet-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
  padding: 0 var(--space-4) var(--space-4);
}

.sheet-footer {
  flex-shrink: 0;
  display: flex;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4) max(var(--safe-area-bottom), var(--space-4));
  border-top: 1px solid var(--color-border);
  background-color: var(--color-surface);
}

/* ------------------------------- motion ------------------------------- */
.sheet-fade-enter-active,
.sheet-fade-leave-active {
  transition: opacity var(--duration-base) var(--ease-standard);
}

.sheet-fade-enter-from,
.sheet-fade-leave-to {
  opacity: 0;
}

.sheet-slide-enter-active,
.sheet-slide-leave-active {
  transition: transform var(--duration-base) var(--ease-decelerate);
}

.sheet-slide-enter-from,
.sheet-slide-leave-to {
  transform: translateY(100%);
}

@media (min-width: 768px) {
  .sheet {
    bottom: var(--space-6);
    border-radius: var(--radius-xl);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sheet-slide-enter-active,
  .sheet-slide-leave-active,
  .sheet-fade-enter-active,
  .sheet-fade-leave-active {
    transition-duration: 1ms;
  }
}
</style>
