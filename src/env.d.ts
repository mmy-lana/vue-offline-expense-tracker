/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vue" />

// This file must remain a module so the block below is treated as *augmentation*
// of the real vue-router types rather than an ambient module override, which
// would strip every router export.
import 'vue-router';

declare module 'vue-router' {
  interface RouteMeta {
    /** Human-readable title rendered by the native app header. */
    title?: string;
  }
}
