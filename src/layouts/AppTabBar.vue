<script setup lang="ts">
/**
 * Bottom tab bar with an elevated quick-add action.
 *
 * Four destinations flank a raised centre button; the active tab is exposed to
 * assistive technology with `aria-current`, and the whole bar sits on top of the
 * bottom safe-area inset so the iOS home indicator never covers a target.
 */

import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useHaptics } from '@/composables/useHaptics';
import AppIcon from '@/components/ui/AppIcon.vue';
import type { IconName } from '@/components/ui/icons';

interface NavTab {
  name: string;
  path: string;
  icon: IconName;
  label: string;
}

const emit = defineEmits<{ (event: 'quick-add'): void }>();

const route = useRoute();
const router = useRouter();
const haptics = useHaptics();

const navTabs: NavTab[] = [
  { name: 'dashboard', path: '/', icon: 'wallet', label: 'Home' },
  { name: 'transactions', path: '/transactions', icon: 'list', label: 'Ledger' },
  { name: 'analytics', path: '/analytics', icon: 'pie-chart', label: 'Analytics' },
  { name: 'budgets', path: '/budgets', icon: 'target', label: 'Budgets' }
];

const leftTabs = computed(() => navTabs.slice(0, 2));
const rightTabs = computed(() => navTabs.slice(2));

const isActive = (path: string): boolean => route.path === path;

const navigateTo = (path: string): void => {
  if (route.path === path) return;

  haptics.trigger('selection');
  void router.push(path);
};

const handleQuickAdd = (): void => {
  haptics.trigger('medium');
  emit('quick-add');
};
</script>

<template>
  <nav class="app-tab-bar" aria-label="Main navigation">
    <div class="tab-bar-inner">
      <button
        v-for="tab in leftTabs"
        :key="tab.path"
        type="button"
        class="tab-button"
        :class="{ 'is-active': isActive(tab.path) }"
        :aria-current="isActive(tab.path) ? 'page' : undefined"
        @click="navigateTo(tab.path)"
      >
        <AppIcon :name="tab.icon" :size="22" />
        <span class="tab-label">{{ tab.label }}</span>
      </button>

      <div class="fab-slot">
        <button type="button" class="fab" aria-label="Add transaction" @click="handleQuickAdd">
          <AppIcon name="plus" :size="26" color="#FFFFFF" />
        </button>
      </div>

      <button
        v-for="tab in rightTabs"
        :key="tab.path"
        type="button"
        class="tab-button"
        :class="{ 'is-active': isActive(tab.path) }"
        :aria-current="isActive(tab.path) ? 'page' : undefined"
        @click="navigateTo(tab.path)"
      >
        <AppIcon :name="tab.icon" :size="22" />
        <span class="tab-label">{{ tab.label }}</span>
      </button>
    </div>
  </nav>
</template>

<style scoped>
.app-tab-bar {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: var(--z-tab-bar);
  background-color: var(--color-surface);
  border-top: 1px solid var(--color-border);
  padding-bottom: max(var(--safe-area-bottom), var(--space-2));
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.tab-bar-inner {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-around;
  height: var(--tab-bar-height);
  padding-top: 0;
  padding-bottom: 0;
  padding-left: max(var(--safe-area-left), var(--space-1));
  padding-right: max(var(--safe-area-right), var(--space-1));
}

.tab-button {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  flex: 1;
  height: 100%;
  min-width: var(--tap-target);
  min-height: var(--tap-target);
  padding: 0;
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  font-family: inherit;
  cursor: pointer;
  transition:
    color var(--duration-fast) var(--ease-standard),
    transform var(--duration-fast) var(--ease-standard);
}

.tab-button:active {
  transform: scale(0.94);
}

.tab-button.is-active {
  color: var(--color-primary);
}

.tab-label {
  font-size: var(--font-size-2xs);
  font-weight: var(--font-weight-semibold);
  line-height: 1;
}

.fab-slot {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-width: var(--tap-target);
}

.fab {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--fab-size);
  height: var(--fab-size);
  border-radius: var(--radius-circle);
  background: linear-gradient(135deg, var(--color-primary-strong), var(--color-primary));
  border: 3px solid var(--color-surface);
  box-shadow: var(--shadow-fab);
  cursor: pointer;
  transform: translateY(-14px);
  transition: transform var(--duration-fast) var(--ease-spring);
}

.fab:active {
  transform: translateY(-11px) scale(0.93);
}

@media (prefers-reduced-motion: reduce) {
  .tab-button:active,
  .fab:active {
    transform: none;
  }

  .fab {
    transform: translateY(-14px);
  }
}
</style>
