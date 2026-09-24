<script setup lang="ts">
import { useSettingsStore } from '@/stores/settingsStore';
import AppShell from '@/layouts/AppShell.vue';

const settingsStore = useSettingsStore();
</script>

<template>
  <AppShell v-if="settingsStore.isReady" />

  <div v-else-if="settingsStore.hasFailed" class="boot-screen boot-screen--error" role="alert">
    <h1 class="boot-heading">Local storage unavailable</h1>
    <p class="boot-message">{{ settingsStore.error }}</p>
    <p class="boot-hint">
      Every record stays on this device inside IndexedDB. Private browsing windows and storage-blocked
      profiles prevent the tracker from opening.
    </p>
    <button type="button" class="boot-action" @click="settingsStore.retryInitialization()">Retry</button>
  </div>

  <div v-else class="boot-screen" role="status" aria-live="polite">
    <span class="boot-spinner" aria-hidden="true"></span>
    <p class="boot-message">Preparing your offline ledger…</p>
  </div>
</template>

<style>
#app {
  min-height: 100vh;
  min-height: 100dvh;
}

.boot-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 100vh;
  min-height: 100dvh;
  padding: 24px;
  text-align: center;
  background-color: var(--color-bg-primary);
  color: var(--color-text-primary);
}

.boot-heading {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 700;
}

.boot-message {
  margin: 0;
  font-size: 0.9375rem;
  color: var(--color-text-muted);
  max-width: 32ch;
}

.boot-hint {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--color-text-muted);
  max-width: 40ch;
}

.boot-action {
  min-height: 44px;
  min-width: 44px;
  padding: 0 20px;
  border: none;
  border-radius: 12px;
  background-color: #0284c7;
  color: #ffffff;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  touch-action: manipulation;
}

.boot-action:active {
  transform: scale(0.96);
}

.boot-spinner {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid var(--color-border);
  border-top-color: #0284c7;
  animation: boot-spin 0.8s linear infinite;
}

@keyframes boot-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .boot-spinner {
    animation-duration: 2.4s;
  }
}
</style>
