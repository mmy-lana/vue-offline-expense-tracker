<script setup lang="ts">
/**
 * Native-style app header.
 *
 * Renders the route title from `RouteMeta`, an optional back affordance, and a
 * named `actions` slot for screen-specific controls. The bar is sticky with a
 * translucent blur so scrolling content passes under it, and it owns the top
 * safe-area inset so no screen has to think about the notch.
 */

import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useHaptics } from '@/composables/useHaptics';
import AppIcon from '@/components/ui/AppIcon.vue';

interface Props {
  /** Overrides the route title. */
  title?: string;
  /** Shows a back button; defaults to true for non-root routes. */
  showBack?: boolean;
  /** Extra label rendered next to the title (for example the active month). */
  subtitle?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: undefined,
  showBack: undefined,
  subtitle: undefined
});

const route = useRoute();
const router = useRouter();
const haptics = useHaptics();

const resolvedTitle = computed(() => props.title ?? route.meta.title ?? 'Expense Tracker');

const canGoBack = computed(() => {
  if (props.showBack !== undefined) return props.showBack;
  return route.path !== '/';
});

const goBack = (): void => {
  haptics.trigger('light');
  router.back();
};
</script>

<template>
  <header class="app-header">
    <div class="header-content">
      <div class="header-left">
        <button
          v-if="canGoBack"
          type="button"
          class="header-icon-button"
          aria-label="Go back"
          @click="goBack"
        >
          <AppIcon name="chevron-left" :size="24" />
        </button>
      </div>

      <div class="header-title-group">
        <h1 class="header-title">{{ resolvedTitle }}</h1>
        <span v-if="subtitle" class="header-subtitle">{{ subtitle }}</span>
      </div>

      <div class="header-right">
        <slot name="actions" />
      </div>
    </div>

    <slot name="banners" />
  </header>
</template>

<style scoped>
.app-header {
  position: relative;
  z-index: var(--z-header);
  flex-shrink: 0;
  padding-top: var(--header-safe-top);
  background-color: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

/**
 * iPhone Dynamic Island / notch clearance.
 *
 * An installed iOS web app reports `safe-area-inset-top` for the sensor housing,
 * but the value can lag during the first paint, so in portrait the bar takes the
 * larger of the inset and the 54px sensor band. Landscape is deliberately left
 * out: the sensor housing sits beside the viewport there, so the lateral safe
 * area insets already clear it and an unconditional 54px band would only inflate
 * a notchless device. iOS is detected with `-webkit-touch-callout` (Safari-only)
 * and combined with the display mode through nesting, because `@supports` cannot
 * test media features.
 *
 * The band is additionally gated on `min-height: 800px`, which every sensor-housing
 * iPhone satisfies. Notchless iPhones in standalone mode (SE, 8, 667/736px tall)
 * would otherwise reserve 54px of empty header for hardware they do not have.
 */
@supports (-webkit-touch-callout: none) {
  @media (display-mode: standalone) and (orientation: portrait) and (min-height: 800px) {
    .app-header {
      padding-top: max(var(--safe-area-top), 54px);
    }
  }
}

.header-content {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--header-height);
  padding-top: 2px;
  padding-bottom: 2px;
  padding-left: max(var(--safe-area-left), var(--space-2));
  padding-right: max(var(--safe-area-right), var(--space-2));
}

.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  min-width: var(--tap-target);
}

.header-right {
  justify-content: flex-end;
}

.header-title-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-width: 0;
  text-align: center;
}

.header-title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  letter-spacing: -0.01em;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.header-subtitle {
  font-size: var(--font-size-2xs);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.header-icon-button {
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
  transition: transform var(--duration-fast) var(--ease-standard);
}

.header-icon-button:active {
  transform: scale(0.92);
  background-color: var(--color-surface-sunken);
}

@media (prefers-reduced-motion: reduce) {
  .header-icon-button {
    transition: none;
  }
}
</style>
