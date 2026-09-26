<script setup lang="ts">
import { computed } from 'vue';
import { getIconDefinition, resolveIconName, type IconName } from './icons';

interface Props {
  /** Catalog name; unknown or restored values fall back to `help-circle`. */
  name: string;
  /** Rendered box size in px. */
  size?: number;
  /** Any CSS colour; defaults to the inherited text colour. */
  color?: string;
  /** Stroke thickness on the 24x24 grid. */
  strokeWidth?: number;
  /** Accessible label; when omitted the icon is decorative. */
  label?: string;
}

const props = withDefaults(defineProps<Props>(), {
  size: 24,
  color: 'currentColor',
  strokeWidth: 1.75,
  label: undefined
});

const definition = computed(() => getIconDefinition(props.name));
const resolvedName = computed<IconName>(() => resolveIconName(props.name));
const isDecorative = computed(() => !props.label);
const pixelSize = computed(() => `${props.size}px`);
</script>

<template>
  <svg
    class="app-icon"
    :width="pixelSize"
    :height="pixelSize"
    viewBox="0 0 24 24"
    fill="none"
    :stroke="color"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    :aria-hidden="isDecorative ? 'true' : undefined"
    :aria-label="label || undefined"
    :role="isDecorative ? undefined : 'img'"
    :data-icon="resolvedName"
    focusable="false"
  >
    <!-- v-text writes a text node instead of an interpolated child, so a label
         holding markup is never parsed as elements. -->
    <title v-if="label" v-text="label" />
    <rect
      v-for="(rect, index) in definition.rects ?? []"
      :key="`rect-${index}`"
      :x="rect.x"
      :y="rect.y"
      :width="rect.width"
      :height="rect.height"
      :rx="rect.rx"
    />
    <circle
      v-for="(circle, index) in definition.circles ?? []"
      :key="`circle-${index}`"
      :cx="circle.cx"
      :cy="circle.cy"
      :r="circle.r"
    />
    <path v-for="(path, index) in definition.paths" :key="`path-${index}`" :d="path" />
  </svg>
</template>

<style scoped>
.app-icon {
  display: block;
  flex-shrink: 0;
  overflow: visible;
}
</style>
