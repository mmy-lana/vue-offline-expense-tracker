import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { useSettingsStore } from '@/stores/settingsStore';
import { usePwaManager } from '@/composables/usePwaManager';
import '@/assets/styles/main.css';

/**
 * Boot sequence: install plugins, arm the service worker lifecycle, seed and
 * open the local database, then mount. A storage failure is rendered by
 * `App.vue` as a retryable error screen instead of failing silently.
 */
const bootstrap = async (): Promise<void> => {
  const app = createApp(App);
  const pinia = createPinia();

  app.use(pinia);
  app.use(router);

  // Registered before the first paint so a waiting service worker update is
  // never missed.
  usePwaManager();

  await useSettingsStore(pinia).initialize();

  app.mount('#app');
};

void bootstrap().catch((error: unknown) => {
  console.error('[bootstrap] fatal error', error);

  const mountPoint = document.getElementById('app');
  if (mountPoint) {
    mountPoint.textContent = 'The application failed to start. Please reload the page.';
  }
});
