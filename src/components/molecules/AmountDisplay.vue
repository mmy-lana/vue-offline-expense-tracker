<script setup lang="ts">
/**
 * Money typography.
 *
 * Splits an integer minor-unit amount into currency symbol, whole units and the
 * decimal tail so the cents can be de-emphasised without any floating-point
 * conversion. Colour encodes direction: income, expense, transfer or neutral.
 */

import { computed } from 'vue';
import { useCurrency } from '@/composables/useCurrency';
import type { TransactionType } from '@/types/models';

type AmountTone = TransactionType | 'neutral';
type AmountSize = 'sm' | 'md' | 'lg' | 'hero';

interface Props {
  /** Amount in minor units; always rendered as an absolute value. */
  amount: number;
  /** Defaults to the persisted base currency. */
  currency?: string;
  tone?: AmountTone;
  size?: AmountSize;
  /** Prefixes `+` / `−` according to the tone. */
  showSign?: boolean;
  /** Overrides the tone colour (for example a category swatch). */
  color?: string;
  /** Accessible text; defaults to the fully formatted currency string. */
  label?: string;
}

const props = withDefaults(defineProps<Props>(), {
  currency: undefined,
  tone: 'neutral',
  size: 'md',
  showSign: false,
  color: undefined,
  label: undefined
});

const { splitForDisplay, formatCurrency } = useCurrency();

const parts = computed(() => splitForDisplay(Math.abs(props.amount), props.currency));

const sign = computed(() => {
  if (!props.showSign) return '';
  if (props.tone === 'income') return '+';
  if (props.tone === 'expense') return '−';
  return '';
});

const accessibleLabel = computed(
  () => props.label ?? `${sign.value}${formatCurrency(Math.abs(props.amount), props.currency)}`
);

const toneStyle = computed(() => (props.color ? { color: props.color } : undefined));
</script>

<template>
  <span
    class="amount"
    :class="[`tone-${tone}`, `size-${size}`]"
    :style="toneStyle"
    :aria-label="accessibleLabel"
    role="text"
  >
    <span class="amount-symbol" aria-hidden="true">{{ parts.symbol }}</span>
    <span class="amount-value" aria-hidden="true">{{ sign }}{{ parts.major }}</span>
    <span v-if="parts.minor.length > 0" class="amount-fraction" aria-hidden="true">.{{ parts.minor }}</span>
  </span>
</template>

<style scoped>
.amount {
  display: inline-flex;
  align-items: baseline;
  gap: 1px;
  font-family: var(--font-family-numeric);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
  white-space: nowrap;
}

.amount-symbol {
  font-weight: var(--font-weight-semibold);
  opacity: 0.85;
}

.amount-value {
  font-weight: var(--font-weight-bold);
}

.amount-fraction {
  font-weight: var(--font-weight-semibold);
  opacity: 0.75;
}

/* ---------- Sizes ---------- */
.size-sm {
  font-size: var(--font-size-sm);
}

.size-sm .amount-symbol {
  font-size: 0.9em;
}

.size-sm .amount-fraction {
  font-size: 0.8em;
}

.size-md {
  font-size: var(--font-size-md);
}

.size-md .amount-symbol {
  font-size: 0.85em;
}

.size-md .amount-fraction {
  font-size: 0.78em;
}

.size-lg {
  font-size: var(--font-size-xl);
}

.size-lg .amount-symbol {
  font-size: 0.8em;
}

.size-lg .amount-fraction {
  font-size: 0.72em;
}

.size-hero {
  font-size: var(--font-size-hero);
  letter-spacing: -0.03em;
}

.size-hero .amount-symbol {
  font-size: 0.7em;
}

.size-hero .amount-fraction {
  font-size: 0.62em;
}

/* ---------- Tones ---------- */
.tone-income {
  color: var(--color-income);
}

.tone-expense {
  color: var(--color-expense);
}

.tone-transfer {
  color: var(--color-transfer);
}

.tone-neutral {
  color: var(--color-text-primary);
}
</style>
