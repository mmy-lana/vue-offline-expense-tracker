<script setup lang="ts">
/**
 * Receipt attachment viewer.
 *
 * Receipts live inside IndexedDB as blobs, so the preview is built from an
 * object URL that is created when the sheet opens and revoked when it closes —
 * nothing is copied to disk and nothing is uploaded. Non-image attachments fall
 * back to a metadata card with a download action.
 */

import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { db } from '@/services/db';
import AppModalSheet from '@/components/ui/AppModalSheet.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import { formatDateLabel } from '@/utils/date';
import type { ReceiptAttachment, Transaction } from '@/types/models';

interface Props {
  modelValue: boolean;
  transaction: Transaction | null;
}

const props = withDefaults(defineProps<Props>(), { transaction: null });

const emit = defineEmits<{ (event: 'update:modelValue', value: boolean): void }>();

const receipt = ref<ReceiptAttachment | null>(null);
const objectUrl = ref<string | null>(null);
const isLoading = ref(false);
const error = ref<string | null>(null);

const isImage = computed(() => receipt.value?.mimeType.startsWith('image/') ?? false);

const fileSizeLabel = computed(() => {
  const size = receipt.value?.fileSize ?? 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
});

const releaseObjectUrl = (): void => {
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value);
    objectUrl.value = null;
  }
};

const loadReceipt = async (transactionId: string): Promise<void> => {
  isLoading.value = true;
  error.value = null;
  releaseObjectUrl();

  try {
    const records = await db.receipts.where('transactionId').equals(transactionId).toArray();
    const found = records[0] ?? null;
    receipt.value = found;

    if (found && found.mimeType.startsWith('image/')) {
      objectUrl.value = URL.createObjectURL(found.dataBlob);
    }
  } catch (loadError: unknown) {
    receipt.value = null;
    error.value = loadError instanceof Error ? loadError.message : 'Unable to read the attachment';
  } finally {
    isLoading.value = false;
  }
};

watch(
  () => [props.modelValue, props.transaction?.id ?? ''] as const,
  ([isOpen, transactionId]) => {
    if (!isOpen) {
      releaseObjectUrl();
      receipt.value = null;
      error.value = null;
      return;
    }

    if (transactionId.length > 0) void loadReceipt(transactionId);
  }
);

onBeforeUnmount(releaseObjectUrl);

/** Downloads the attachment straight out of IndexedDB. */
const download = (): void => {
  const current = receipt.value;
  if (!current) return;

  const url = URL.createObjectURL(current.dataBlob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = current.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // WebKit resolves the download asynchronously; revoking in the same task can
  // cancel the transfer and yield a zero-byte file, so cleanup is deferred.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
</script>

<template>
  <AppModalSheet
    :model-value="modelValue"
    title="Receipt"
    :description="transaction ? `${formatDateLabel(transaction.date)} · ${transaction.note || 'No note'}` : undefined"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div v-if="isLoading" class="receipt-loading" role="status">
      <span class="receipt-spinner" aria-hidden="true" />
      <span>Loading attachment…</span>
    </div>

    <div v-else-if="error" class="receipt-error" role="alert">
      <AppIcon name="alert-circle" :size="18" />
      <span>{{ error }}</span>
    </div>

    <div v-else-if="!receipt" class="receipt-empty">
      <AppIcon name="receipt" :size="28" />
      <h3 class="receipt-empty-title">No receipt attached</h3>
      <p class="receipt-empty-text">
        This entry has no stored attachment. Receipts restored from a backup appear here.
      </p>
    </div>

    <div v-else class="receipt-body">
      <img
        v-if="isImage && objectUrl"
        class="receipt-image"
        :src="objectUrl"
        :alt="`Receipt attachment ${receipt.fileName}`"
      />

      <div v-else class="receipt-file">
        <AppIcon name="camera" :size="26" />
        <span class="receipt-file-name">{{ receipt.fileName }}</span>
        <span class="receipt-file-meta">{{ receipt.mimeType }} · {{ fileSizeLabel }}</span>
      </div>

      <dl class="receipt-meta">
        <div class="meta-row">
          <dt>File</dt>
          <dd>{{ receipt.fileName }}</dd>
        </div>
        <div class="meta-row">
          <dt>Type</dt>
          <dd>{{ receipt.mimeType }}</dd>
        </div>
        <div class="meta-row">
          <dt>Size</dt>
          <dd>{{ fileSizeLabel }}</dd>
        </div>
      </dl>
    </div>

    <template #footer>
      <AppButton variant="secondary" block :disabled="!receipt" icon="download" @click="download">
        Download
      </AppButton>
      <AppButton variant="primary" block @click="emit('update:modelValue', false)">Close</AppButton>
    </template>
  </AppModalSheet>
</template>

<style scoped>
.receipt-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.receipt-image {
  width: 100%;
  max-height: 46dvh;
  object-fit: contain;
  background-color: var(--color-surface-sunken);
  border-radius: var(--radius-lg);
}

.receipt-file {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-6);
  background-color: var(--color-surface-sunken);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
  color: var(--color-text-muted);
}

.receipt-file-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  word-break: break-all;
  text-align: center;
}

.receipt-file-meta {
  font-size: var(--font-size-2xs);
}

.receipt-meta {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
}

.meta-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  font-size: var(--font-size-sm);
}

.meta-row dt {
  color: var(--color-text-muted);
}

.meta-row dd {
  margin: 0;
  color: var(--color-text-primary);
  font-weight: var(--font-weight-medium);
  text-align: right;
  word-break: break-all;
}

.receipt-loading,
.receipt-error,
.receipt-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-6);
  text-align: center;
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.receipt-error {
  flex-direction: row;
  justify-content: center;
  color: var(--color-danger);
}

.receipt-empty-title {
  margin: 0;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.receipt-empty-text {
  margin: 0;
  max-width: 36ch;
}

.receipt-spinner {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-circle);
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  animation: receipt-spin 0.8s linear infinite;
}

@keyframes receipt-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .receipt-spinner {
    animation-duration: 2.4s;
  }
}
</style>
