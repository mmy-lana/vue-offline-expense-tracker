/**
 * Progressive Web App lifecycle manager (singleton).
 *
 * Owns install-prompt capture, online/offline detection and service worker
 * update negotiation. The update policy is `prompt`: a new build is downloaded
 * in the background and applied only when the user accepts it, so an in-flight
 * transaction entry is never discarded by a surprise reload.
 */

import { computed, ref } from 'vue';
import { useRegisterSW } from 'virtual:pwa-register/vue';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const isInstallable = ref<boolean>(false);
const isOffline = ref<boolean>(typeof navigator !== 'undefined' ? !navigator.onLine : false);
const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null);
const registrationError = ref<string | null>(null);

const isIos = ref<boolean>(
  typeof navigator !== 'undefined' &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) &&
    !(window as unknown as { MSStream?: unknown }).MSStream
);

const isStandalone = ref<boolean>(
  typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true)
);

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event: Event) => {
    event.preventDefault();
    deferredPrompt.value = event as BeforeInstallPromptEvent;
    isInstallable.value = true;
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt.value = null;
    isInstallable.value = false;
  });

  window.addEventListener('online', () => {
    isOffline.value = false;
  });

  window.addEventListener('offline', () => {
    isOffline.value = true;
  });
}

const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    registrationError.value = null;
    if (!registration) return;
    // Poll for a new deployment once an hour while the app stays open.
    window.setInterval(() => {
      void registration.update();
    }, 60 * 60 * 1000);
  },
  onRegisterError(error: unknown) {
    registrationError.value = error instanceof Error ? error.message : 'Service worker registration failed';
  }
});

export function usePwaManager() {
  const promptInstall = async (): Promise<boolean> => {
    const promptEvent = deferredPrompt.value;
    if (!promptEvent) return false;

    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;

    deferredPrompt.value = null;
    isInstallable.value = false;
    return outcome === 'accepted';
  };

  return {
    isInstallable: computed(() => isInstallable.value),
    isOffline: computed(() => isOffline.value),
    isIosStandalonePromptRequired: computed(() => isIos.value && !isStandalone.value),
    isStandalone: computed(() => isStandalone.value),
    registrationError: computed(() => registrationError.value),
    needRefresh,
    offlineReady,
    updateServiceWorker,
    dismissUpdate: (): void => {
      needRefresh.value = false;
    },
    dismissOfflineReady: (): void => {
      offlineReady.value = false;
    },
    promptInstall
  };
}
