<script setup lang="ts">
/**
 * Pure-SVG donut chart for category distribution.
 *
 * Geometry is generated with trigonometry on a 100x100 viewBox (so it scales to
 * any pixel size without distortion), producing filled ring segments
 * (`M … A …`) rather than stroked arcs. A full-circle slice is split into two
 * halves because a 360° arc path is degenerate.
 */

import { computed, ref } from 'vue';
import { useCurrency } from '@/composables/useCurrency';
import type { CategorySpendBreakdown } from '@/types/models';

interface Props {
  segments: readonly CategorySpendBreakdown[];
  currency?: string;
  /** Rendered square size in px. */
  size?: number;
  /** Ring thickness in viewBox units (100 = full diameter). */
  thickness?: number;
  centerLabel?: string;
  /** Preformatted total; falls back to the summed minor units. */
  centerValue?: string;
  interactive?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  currency: undefined,
  size: 220,
  thickness: 26,
  centerLabel: 'Total spent',
  centerValue: undefined,
  interactive: true
});

const emit = defineEmits<{ (event: 'select', segment: CategorySpendBreakdown): void }>();

const { formatCurrency } = useCurrency();

const VIEWBOX = 100;
const CENTER = VIEWBOX / 2;
const RADIUS = 46;
const SEGMENT_GAP_DEGREES = 1.6;

const activeId = ref<string | null>(null);

const totalSpent = computed(() =>
  props.segments.reduce((total, segment) => total + Math.max(0, segment.totalSpent), 0)
);

const centerDisplay = computed(() => props.centerValue ?? formatCurrency(totalSpent.value, props.currency));

const isEmpty = computed(() => totalSpent.value === 0 || props.segments.length === 0);

interface RingSlice {
  segment: CategorySpendBreakdown;
  start: number;
  end: number;
}

const slices = computed<RingSlice[]>(() => {
  const positive = props.segments.filter((segment) => segment.totalSpent > 0);
  if (positive.length === 0) return [];

  const total = positive.reduce((sum, segment) => sum + segment.totalSpent, 0);
  const gap = positive.length > 1 ? SEGMENT_GAP_DEGREES : 0;

  let cursor = 0;
  return positive.map((segment) => {
    const sweep = (segment.totalSpent / total) * 360;
    const start = cursor + gap / 2;
    // Keep hairline categories visible without letting them overflow the sweep.
    const end = Math.max(cursor + sweep - gap / 2, start + 0.6);
    cursor += sweep;
    return { segment, start, end: Math.min(end, cursor) };
  });
});

const polarPoint = (radius: number, degrees: number): { x: number; y: number } => {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return {
    x: Number((CENTER + radius * Math.cos(radians)).toFixed(3)),
    y: Number((CENTER + radius * Math.sin(radians)).toFixed(3))
  };
};

const describeRingSegment = (start: number, end: number): string => {
  const innerRadius = RADIUS - props.thickness;
  const sweep = end - start;
  const largeArcFlag = sweep > 180 ? 1 : 0;

  const outerStart = polarPoint(RADIUS, start);
  const outerEnd = polarPoint(RADIUS, end);
  const innerEnd = polarPoint(innerRadius, end);
  const innerStart = polarPoint(innerRadius, start);

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${RADIUS} ${RADIUS} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
    'Z'
  ].join(' ');
};

interface RenderedSlice extends RingSlice {
  path: string;
  isActive: boolean;
}

const renderedSlices = computed<RenderedSlice[]>(() =>
  slices.value.flatMap((slice) => {
    const sweep = slice.end - slice.start;
    const isActive = activeId.value === slice.segment.categoryId;

    // A single dominant slice must be drawn as two 180° halves.
    if (sweep >= 359.5) {
      return [
        { ...slice, end: slice.start + 180, path: describeRingSegment(slice.start, slice.start + 180), isActive },
        { ...slice, start: slice.start + 180, path: describeRingSegment(slice.start + 180, slice.start + 360), isActive }
      ];
    }

    return [{ ...slice, path: describeRingSegment(slice.start, slice.end), isActive }];
  })
);

const chartLabel = computed(() => {
  if (isEmpty.value) return 'Spending distribution: no expenses recorded in this period';
  const leaders = props.segments
    .slice(0, 3)
    .map((segment) => `${segment.categoryName} ${segment.percentageOfTotal}%`)
    .join(', ');
  return `Spending distribution: ${centerDisplay.value} across ${props.segments.length} categories. Top: ${leaders}`;
});

const setActive = (categoryId: string | null): void => {
  activeId.value = categoryId;
};

const handleSliceClick = (segment: CategorySpendBreakdown): void => {
  if (!props.interactive) return;
  activeId.value = activeId.value === segment.categoryId ? null : segment.categoryId;
  emit('select', segment);
};

const legendItems = computed(() =>
  props.segments.map((segment) => ({
    ...segment,
    amountLabel: formatCurrency(segment.totalSpent, props.currency),
    isActive: activeId.value === segment.categoryId
  }))
);
</script>

<template>
  <div class="donut" :class="{ interactive }">
    <div class="donut-chart" :style="{ width: `${size}px`, height: `${size}px` }">
      <svg
        class="donut-svg"
        :viewBox="`0 0 ${VIEWBOX} ${VIEWBOX}`"
        role="img"
        :aria-label="chartLabel"
        preserveAspectRatio="xMidYMid meet"
      >
        <circle
          v-if="isEmpty"
          class="donut-placeholder"
          :cx="CENTER"
          :cy="CENTER"
          :r="RADIUS - thickness / 2"
          :stroke-width="thickness"
        />

        <path
          v-for="(slice, index) in renderedSlices"
          :key="`${slice.segment.categoryId}-${index}`"
          class="donut-slice"
          :class="{ 'is-dimmed': activeId !== null && !slice.isActive, 'is-active': slice.isActive }"
          :d="slice.path"
          :fill="slice.segment.colorHex"
          @pointerenter="setActive(slice.segment.categoryId)"
          @pointerleave="setActive(null)"
          @click="handleSliceClick(slice.segment)"
        />
      </svg>

      <div class="donut-center" aria-hidden="true">
        <span class="donut-center-value">{{ centerDisplay }}</span>
        <span class="donut-center-label">{{ centerLabel }}</span>
      </div>
    </div>

    <p v-if="isEmpty" class="donut-empty">
      No expenses recorded for this period yet. Add a transaction to see the distribution.
    </p>

    <ul v-else class="donut-legend">
      <li
        v-for="item in legendItems"
        :key="item.categoryId"
        class="legend-item"
        :class="{ 'is-active': item.isActive }"
        @pointerenter="setActive(item.categoryId)"
        @pointerleave="setActive(null)"
      >
        <span class="legend-swatch" :style="{ backgroundColor: item.colorHex }" aria-hidden="true" />
        <span class="legend-body">
          <span class="legend-name">{{ item.categoryName }}</span>
          <span class="legend-meta">
            {{ item.transactionCount }} {{ item.transactionCount === 1 ? 'entry' : 'entries' }}
          </span>
        </span>
        <span class="legend-figures">
          <span class="legend-amount">{{ item.amountLabel }}</span>
          <span class="legend-percentage">{{ item.percentageOfTotal.toFixed(1) }}%</span>
        </span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.donut {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  width: 100%;
}

.donut-chart {
  position: relative;
  max-width: 100%;
  aspect-ratio: 1 / 1;
}

.donut-svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.donut-placeholder {
  fill: none;
  stroke: var(--color-surface-sunken);
}

.donut-slice {
  transition:
    opacity var(--duration-fast) var(--ease-standard),
    transform var(--duration-fast) var(--ease-standard);
  transform-origin: 50% 50%;
}

.interactive .donut-slice {
  cursor: pointer;
}

.donut-slice.is-dimmed {
  opacity: 0.35;
}

.donut-slice.is-active {
  transform: scale(1.03);
}

.donut-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  pointer-events: none;
  text-align: center;
  padding: 0 18%;
}

.donut-center-value {
  font-family: var(--font-family-numeric);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
}

.donut-center-label {
  font-size: var(--font-size-2xs);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.donut-legend {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: var(--tap-target);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-md);
  transition: background-color var(--duration-fast) var(--ease-standard);
}

.legend-item.is-active {
  background-color: var(--color-surface-sunken);
}

.legend-swatch {
  width: 12px;
  height: 12px;
  border-radius: var(--radius-xs);
  flex-shrink: 0;
}

.legend-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.legend-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.legend-meta {
  font-size: var(--font-size-2xs);
  color: var(--color-text-muted);
}

.legend-figures {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  flex-shrink: 0;
}

.legend-amount {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
}

.legend-percentage {
  font-size: var(--font-size-2xs);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.donut-empty {
  margin: 0;
  padding: var(--space-4);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  text-align: center;
}

@media (prefers-reduced-motion: reduce) {
  .donut-slice,
  .legend-item {
    transition: none;
  }
}
</style>
