<script setup lang="ts">
/**
 * PWA status and install guidance.
 *
 * Surfaces the four states a user actually cares about: whether the app is
 * installed, whether an update is waiting, whether storage is persistent, and
 * whether the device is offline (in which case everything still works, but the
 * user deserves to know why nothing leaves the device).
 */

import { computed, ref } from 'vue';
import { usePwaManager } from '@/composables/usePwaManager';
import { useSettingsStore } from '@/stores/settingsStore';
import AppBadge from '@/components/ui/AppBadge.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppIcon from '@/components/ui/AppIcon.vue';

const {
  isInstallable,
  isOffline,
  isIosStandalonePromptRequired,
  isStandalone,
  registrationError,
  needRefresh,
  offlineReady,
  updateServiceWorker,
  dismissUpdate,
  dismissOfflineReady,
  promptInstall
} = usePwaManager();

const settingsStore = useSettingsStore();

const isInstalling = ref(false);
const installMessage = ref<string | null>(null);

const installState = computed(() => {
  if (isStandalone.value) return 'installed';
  if (isInstallable.value) return 'installable';
  if (isIosStandalonePromptRequired.value) return 'ios-manual';
  return 'browser-only';
});

const installHeadline = computed(() => {
  switch (installState.value) {
    case 'installed':
      return 'Installed on this device';
    case 'installable':
      return 'Ready to install';
    case 'ios-manual':
      return 'Add to Home Screen manually';
    default:
      return 'Running in the browser';
  }
});

const installHint = computed(() => {
  switch (installState.value) {
    case 'installed':
      return 'Launched in standalone mode with full offline access to your ledger.';
    case 'installable':
      return 'Install for a native app shell, home-screen icon and offline launch.';
    case 'ios-manual':
      return 'On iOS: tap Share, then “Add to Home Screen” to get the standalone app shell.';
    default:
      return 'This browser does not offer an install prompt. Everything still works offline once loaded.';
  }
});

const cacheLabel = computed(() => (offlineReady.value ? 'Cached for offline use' : 'Cache warming up'));

const handleInstall = async (): Promise<void> => {
  isInstalling.value = true;
  installMessage.value = null;

  try {
    const accepted = await promptInstall();
    installMessage.value = accepted
      ? 'Installation accepted — the app will appear on your home screen.'
      : 'Installation dismissed. You can try again any time.';
  } finally {
    isInstalling.value = false;
  }
};

const handleUpdate = async (): Promise<void> => {
  await updateServiceWorker(true);
};
</script>

<template>
  <section class="settings-section" aria-labelledby="pwa-heading">
    <header class="section-head">
      <h2 id="pwa-heading" class="section-title">App &amp; offline status</h2>
      <p class="section-subtitle">Install state, cache and update availability for this device.</p>
    </header>

    <div v-if="needRefresh" class="pwa-banner pwa-banner--update" role="status">
      <AppIcon name="refresh" :size="18" />
      <div class="banner-body">
        <span class="banner-title">New version available</span>
        <span class="banner-text">Reload to apply the latest build. Your data stays on this device.</span>
      </div>
      <div class="banner-actions">
        <AppButton variant="primary" size="sm" @click="handleUpdate">Reload</AppButton>
        <AppButton variant="ghost" size="sm" @click="dismissUpdate">Later</AppButton>
      </div>
    </div>

    <div v-if="registrationError" class="pwa-banner pwa-banner--error" role="alert">
      <AppIcon name="alert-circle" :size="18" />
      <div class="banner-body">
        <span class="banner-title">Service worker unavailable</span>
        <span class="banner-text">{{ registrationError }}</span>
      </div>
    </div>

    <div class="status-card">
      <div class="status-row">
        <span class="status-label">
          <AppIcon name="smartphone" :size="16" />
          Installation
        </span>
        <AppBadge :variant="installState === 'installed' ? 'success' : 'neutral'" size="sm">
          {{ installHeadline }}
        </AppBadge>
      </div>
      <p class="status-hint">{{ installHint }}</p>

      <div class="status-row">
        <span class="status-label">
          <AppIcon name="wifi-off" :size="16" />
          Connection
        </span>
        <AppBadge :variant="isOffline ? 'warning' : 'success'" size="sm">
          {{ isOffline ? 'Offline' : 'Online' }}
        </AppBadge>
      </div>
      <p class="status-hint">
        {{ isOffline ? 'Offline mode — every change is stored locally and nothing is queued for upload.' : 'No data leaves this device: there is no sync server to reach.' }}
      </p>

      <div class="status-row">
        <span class="status-label">
          <AppIcon name="database" :size="16" />
          Storage
        </span>
        <AppBadge :variant="settingsStore.isStoragePersisted ? 'success' : 'neutral'" size="sm">
          {{ settingsStore.isStoragePersisted ? 'Persistent' : 'Best effort' }}
        </AppBadge>
      </div>
      <p class="status-hint">
        {{ settingsStore.isStoragePersisted ? 'The browser will not evict your ledger under storage pressure.' : 'The browser may evict local data under storage pressure — export backups regularly.' }}
      </p>

      <div class="status-row">
        <span class="status-label">
          <AppIcon name="check" :size="16" />
          Offline cache
        </span>
        <AppBadge :variant="offlineReady ? 'success' : 'neutral'" size="sm">{{ cacheLabel }}</AppBadge>
      </div>
      <AppButton
        v-if="offlineReady"
        class="dismiss-cache"
        variant="ghost"
        size="sm"
        @click="dismissOfflineReady"
      >
        Dismiss cache notice
      </AppButton>
    </div>

    <AppButton
      v-if="installState === 'installable'"
      variant="primary"
      block
      icon="smartphone"
      :loading="isInstalling"
      @click="handleInstall"
    >
      Install app
    </AppButton>

    <p v-if="installMessage" class="install-message" role="status">{{ installMessage }}</p>
  </section>
</template>

<style scoped>
.settings-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.section-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.section-title {
  margin: 0;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
}

.section-subtitle {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.pwa-banner {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
  border-radius: var(--radius-md);
}

.pwa-banner--update {
  background-color: var(--color-primary-soft);
  color: var(--color-primary-strong);
}

.pwa-banner--error {
  background-color: var(--color-danger-soft);
  color: var(--color-danger);
}

.banner-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.banner-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
}

.banner-text {
  font-size: var(--font-size-xs);
  line-height: var(--line-height-snug);
}

.banner-actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex-shrink: 0;
}

.status-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.status-label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.status-hint {
  margin: 0 0 var(--space-1);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-snug);
  color: var(--color-text-muted);
}

.dismiss-cache {
  align-self: flex-start;
}

.install-message {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}
</style>
