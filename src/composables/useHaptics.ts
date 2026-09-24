/**
 * Haptic feedback engine.
 *
 * Uses the Vibration API where available and is a no-op everywhere else, so
 * callers never need capability checks. Every trigger respects the
 * `hapticEnabled` preference persisted in the settings store.
 */

import { useSettingsStore } from '@/stores/settingsStore';

export type HapticType = 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error';

const PATTERNS: Record<HapticType, number | number[]> = {
  selection: 10,
  light: 20,
  medium: 40,
  heavy: 60,
  success: [15, 30, 20],
  warning: [30, 50, 30],
  error: [50, 50, 50, 50, 50]
};

export interface HapticsApi {
  trigger: (type?: HapticType) => void;
  /** `true` when the runtime exposes the Vibration API at all. */
  isSupported: boolean;
}

export function useHaptics(): HapticsApi {
  const settingsStore = useSettingsStore();

  const isSupported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

  const trigger = (type: HapticType = 'light'): void => {
    if (!settingsStore.settings.hapticEnabled) return;
    if (!isSupported) return;

    const pattern = PATTERNS[type];
    try {
      navigator.vibrate(pattern);
    } catch {
      // Vibration can be blocked by permissions policy; haptics are decorative.
    }
  };

  return { trigger, isSupported };
}
