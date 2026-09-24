<script setup lang="ts">
/**
 * Master app shell.
 *
 * Owns the native viewport contract:
 *  - a fixed header off the top safe area,
 *  - one scrollable canvas with isolated overscroll (`overscroll-behavior-y`),
 *  - a persistent bottom tab bar over the bottom safe area,
 *  - desktop containment: a 480px device frame centred on wide viewports.
 *
 * The `/entry` route renders as an absolute overlay against `.app-frame`
 * (`z-index: var(--z-overlay)`), which is why `.app-frame` is the only positioned
 * ancestor and `.app-viewport` deliberately stays `position: static` so the
 * overlay escapes the scroll container instead of being clipped by it.
 */

import { computed } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import { usePwaManager } from '@/composables/usePwaManager';
import { useSettingsStore } from '@/stores/settingsStore';
import { useLedgerStore } from '@/stores/ledgerStore';
import AppHeader from '@/layouts/AppHeader.vue';
import AppTabBar from '@/layouts/AppTabBar.vue';
import AppIcon from '@/components/ui/AppIcon.vue';

const route = useRoute();
const router = useRouter();

const { isOffline, needRefresh, updateServiceWorker, dismissUpdate } = usePwaManager();
const settingsStore = useSettingsStore();
const ledgerStore = useLedgerStore();

/** Routes that take over the whole frame with their own chrome. */
const isOverlayRoute = computed(() => route.name === 'entry');

/** Tab roots are reached from the tab bar, so they never show a back button. */
const TAB_ROOT_PATHS = ['/', '/transactions', '/analytics', '/budgets'];
const showBackButton = computed(() => !TAB_ROOT_PATHS.includes(route.path) && !isOverlayRoute.value);

const headerSubtitle = computed(() =>
  route.name === 'dashboard' ? settingsStore.baseCurrency : undefined
);

const openQuickAdd = (): void => {
  void router.push({ name: 'entry' });
};

const handleUpdate = async (): Promise<void> => {
  await updateServiceWorker(true);
};
</script>

<template>
  <div class="shell-root">
    <div class="app-frame">
      <AppHeader :show-back="showBackButton" :subtitle="headerSubtitle">
        <template #actions>
          <slot name="header-actions">
            <button
              type="button"
              class="header-action"
              aria-label="Open settings"
              @click="router.push('/settings')"
            >
              <AppIcon name="settings" :size="20" />
            </button>
          </slot>
        </template>

        <template #banners>
          <div v-if="needRefresh && !isOverlayRoute" class="shell-banner shell-banner--update" role="status">
            <AppIcon name="refresh" :size="16" />
            <span class="banner-text">New version available</span>
            <div class="banner-actions">
              <button type="button" class="banner-button banner-button--primary" @click="handleUpdate">
                Reload
              </button>
              <button type="button" class="banner-button" @click="dismissUpdate">Later</button>
            </div>
          </div>

          <div v-if="isOffline" class="shell-banner shell-banner--offline" role="status">
            <AppIcon name="wifi-off" :size="14" />
            <span class="banner-text">Offline mode · changes stored locally</span>
          </div>

          <div v-if="ledgerStore.error" class="shell-banner shell-banner--error" role="alert">
            <AppIcon name="alert-circle" :size="16" />
            <span class="banner-text">{{ ledgerStore.error }}</span>
            <button type="button" class="banner-button" @click="ledgerStore.clearError()">Dismiss</button>
          </div>
        </template>
      </AppHeader>

      <main class="app-viewport" :class="{ 'is-overlay-route': isOverlayRoute }">
        <RouterView v-slot="{ Component }">
          <component :is="Component" />
        </RouterView>
      </main>

      <AppTabBar v-if="!isOverlayRoute" @quick-add="openQuickAdd" />
    </div>
  </div>
</template>

<style scoped>
.shell-root {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
  background-color: var(--color-bg-secondary);
}

.app-frame {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: var(--shell-max-width);
  height: 100vh;
  height: 100dvh;
  background-color: var(--color-bg-primary);
  color: var(--color-text-primary);
  overflow: hidden;
}

/* Deliberately static: absolutely positioned overlays must escape this
   scroll container and anchor to `.app-frame` instead. */
.app-viewport {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
  padding: var(--space-4);
  padding-bottom: calc(max(var(--safe-area-bottom), var(--space-4)) + var(--content-bottom-gutter));
  padding-left: max(var(--safe-area-left), var(--space-4));
  padding-right: max(var(--safe-area-right), var(--space-4));
}

.header-action {
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
}

.header-action:active {
  background-color: var(--color-surface-sunken);
  transform: scale(0.92);
}

/* ------------------------------- banners ------------------------------- */
.shell-banner {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
}

.shell-banner .banner-text {
  flex: 1;
  min-width: 0;
}

.shell-banner--update {
  background-color: var(--color-primary-soft);
  color: var(--color-primary-strong);
}

.shell-banner--offline {
  background-color: var(--color-warning-soft);
  color: var(--color-warning);
}

.shell-banner--error {
  background-color: var(--color-danger-soft);
  color: var(--color-danger);
}

.banner-actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex-shrink: 0;
}

.banner-button {
  min-height: var(--tap-target);
  min-width: var(--tap-target);
  padding: 0 var(--space-3);
  background: transparent;
  border: 1px solid currentColor;
  border-radius: var(--radius-sm);
  color: inherit;
  font-family: inherit;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  cursor: pointer;
}

.banner-button--primary {
  background-color: var(--color-primary-strong);
  border-color: transparent;
  color: #ffffff;
}

@media (min-width: 430px) {
  .app-viewport {
    padding: var(--space-5);
    padding-bottom: calc(max(var(--safe-area-bottom), var(--space-4)) + var(--content-bottom-gutter));
  }
}

/* ------------------------------ responsive ----------------------------- */
@media (min-width: 768px) {
  .app-frame {
    height: min(92dvh, 960px);
    border: 1px solid var(--color-border);
    border-radius: var(--shell-radius);
    box-shadow: var(--shadow-device);
  }
}
</style>
