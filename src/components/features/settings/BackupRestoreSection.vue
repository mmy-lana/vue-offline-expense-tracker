<script setup lang="ts">
/**
 * Data sovereignty controls.
 *
 * Export writes a versioned JSON archive (or a formula-safe CSV) straight to the
 * device; restore validates the whole payload, replaces the database atomically
 * and reloads. A stale-backup reminder appears once the last export is older than
 * 30 days, because a backup nobody took is not a backup.
 */

import { computed, onBeforeUnmount, ref } from 'vue';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  generateBackupJSON,
  generateTransactionsCSV,
  restoreBackupJSON
} from '@/services/dataTransfer';
import { db } from '@/services/db';
import AppButton from '@/components/ui/AppButton.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import AppModalSheet from '@/components/ui/AppModalSheet.vue';
import { formatDateLabel, getCurrentLocalDateString, toLocalDateString } from '@/utils/date';

const STALE_AFTER_DAYS = 30;

const settingsStore = useSettingsStore();

const isExportingJson = ref(false);
const isExportingCsv = ref(false);
const isRestoring = ref(false);
const isConfirmRestoreOpen = ref(false);
const pendingFileName = ref('');
const pendingFileText = ref('');
const status = ref<{ tone: 'success' | 'error'; message: string } | null>(null);

const fileInputRef = ref<HTMLInputElement | null>(null);

const lastExportLabel = computed(() => {
  const timestamp = settingsStore.lastExportTimestamp;
  if (!timestamp) return 'Never exported';
  return formatDateLabel(toLocalDateString(new Date(timestamp)));
});

const daysSinceExport = computed(() => settingsStore.daysSinceLastExport);

const isBackupStale = computed(
  () => daysSinceExport.value === null || daysSinceExport.value > STALE_AFTER_DAYS
);

const staleMessage = computed(() => {
  if (daysSinceExport.value === null) {
    return 'No backup has been exported from this device yet. Export one now so your data survives a cleared browser.';
  }
  return `The last backup is ${daysSinceExport.value} days old. Export a fresh copy to stay covered.`;
});

const counts = ref({ transactions: 0, accounts: 0, categories: 0, budgets: 0, receipts: 0 });

const refreshCounts = async (): Promise<void> => {
  const [transactions, accounts, categories, budgets, receipts] = await Promise.all([
    db.transactions.count(),
    db.accounts.count(),
    db.categories.count(),
    db.budgets.count(),
    db.receipts.count()
  ]);
  counts.value = { transactions, accounts, categories, budgets, receipts };
};

refreshCounts().catch(() => {
  // A blocked or closed IndexedDB connection must not surface as an unhandled
  // rejection during boot; the panel simply reports zeros until data is readable.
  counts.value = { transactions: 0, accounts: 0, categories: 0, budgets: 0, receipts: 0 };
});

/** Saves generated text as a file on the device (no network involved). */
const triggerDownload = (content: string, fileName: string, mimeType: string): void => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

const timestampSuffix = (): string => getCurrentLocalDateString().replace(/-/g, '');

const exportJson = async (): Promise<void> => {
  isExportingJson.value = true;
  status.value = null;

  try {
    const json = await generateBackupJSON();
    triggerDownload(json, `expense-tracker-backup-${timestampSuffix()}.json`, 'application/json');
    await settingsStore.markExported();
    await refreshCounts();
    status.value = { tone: 'success', message: 'Backup exported and stamped successfully.' };
  } catch (error: unknown) {
    status.value = { tone: 'error', message: error instanceof Error ? error.message : 'Export failed' };
  } finally {
    isExportingJson.value = false;
  }
};

const exportCsv = async (): Promise<void> => {
  isExportingCsv.value = true;
  status.value = null;

  try {
    const csv = await generateTransactionsCSV();
    triggerDownload(csv, `expense-tracker-transactions-${timestampSuffix()}.csv`, 'text/csv;charset=utf-8');
    status.value = { tone: 'success', message: 'Spreadsheet exported with a UTF-8 BOM.' };
  } catch (error: unknown) {
    status.value = { tone: 'error', message: error instanceof Error ? error.message : 'Export failed' };
  } finally {
    isExportingCsv.value = false;
  }
};

const openFilePicker = (): void => {
  fileInputRef.value?.click();
};

const handleFileSelected = async (event: Event): Promise<void> => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  status.value = null;

  try {
    pendingFileText.value = await file.text();
    pendingFileName.value = file.name;
    isConfirmRestoreOpen.value = true;
  } catch {
    status.value = { tone: 'error', message: 'Unable to read the selected file' };
  } finally {
    input.value = '';
  }
};

const confirmRestore = async (): Promise<void> => {
  isRestoring.value = true;

  try {
    const result = await restoreBackupJSON(pendingFileText.value);
    status.value = { tone: result.success ? 'success' : 'error', message: result.message };

    if (result.success) {
      isConfirmRestoreOpen.value = false;
      // A reload re-runs every live query and re-applies the restored settings.
      window.setTimeout(() => window.location.reload(), 700);
      return;
    }
  } catch (error: unknown) {
    status.value = { tone: 'error', message: error instanceof Error ? error.message : 'Restore failed' };
  } finally {
    isRestoring.value = false;
    pendingFileText.value = '';
  }
};

onBeforeUnmount(() => {
  pendingFileText.value = '';
});
</script>

<template>
  <section class="settings-section" aria-labelledby="data-sovereignty-heading">
    <header class="section-head">
      <h2 id="data-sovereignty-heading" class="section-title">Data sovereignty</h2>
      <p class="section-subtitle">Everything stays on this device. Export whenever you want a copy.</p>
    </header>

    <div v-if="isBackupStale" class="stale-banner" role="status">
      <AppIcon name="alert-circle" :size="18" />
      <div class="stale-body">
        <span class="stale-title">Backup recommended</span>
        <span class="stale-text">{{ staleMessage }}</span>
      </div>
    </div>

    <dl class="counts-grid">
      <div class="count-cell">
        <dt>Transactions</dt>
        <dd>{{ counts.transactions }}</dd>
      </div>
      <div class="count-cell">
        <dt>Accounts</dt>
        <dd>{{ counts.accounts }}</dd>
      </div>
      <div class="count-cell">
        <dt>Categories</dt>
        <dd>{{ counts.categories }}</dd>
      </div>
      <div class="count-cell">
        <dt>Budgets</dt>
        <dd>{{ counts.budgets }}</dd>
      </div>
      <div class="count-cell">
        <dt>Receipts</dt>
        <dd>{{ counts.receipts }}</dd>
      </div>
    </dl>

    <p class="last-export">Last export: <strong>{{ lastExportLabel }}</strong></p>

    <div v-if="status" class="status-banner" :class="`tone-${status.tone}`" role="status">
      <AppIcon :name="status.tone === 'success' ? 'check' : 'alert-circle'" :size="16" />
      <span>{{ status.message }}</span>
    </div>

    <div class="action-stack">
      <AppButton variant="primary" block icon="download" :loading="isExportingJson" @click="exportJson">
        Export backup (JSON)
      </AppButton>

      <AppButton variant="secondary" block icon="list" :loading="isExportingCsv" @click="exportCsv">
        Export spreadsheet (CSV)
      </AppButton>

      <AppButton variant="ghost" block icon="upload" @click="openFilePicker">
        Restore from backup
      </AppButton>

      <input
        ref="fileInputRef"
        class="file-input"
        type="file"
        accept="application/json,.json"
        aria-label="Select a backup file"
        @change="handleFileSelected"
      />
    </div>

    <AppModalSheet
      v-model="isConfirmRestoreOpen"
      title="Replace local data?"
      description="Restoring overwrites every account, category, budget and transaction on this device."
    >
      <div class="confirm-body">
        <p class="confirm-file">
          <AppIcon name="database" :size="18" />
          <span>{{ pendingFileName }}</span>
        </p>
        <ul class="confirm-list">
          <li>Current records are deleted before the archive is written.</li>
          <li>The file is fully validated first — an invalid backup changes nothing.</li>
          <li>The app reloads automatically once the restore completes.</li>
        </ul>
      </div>

      <template #footer>
        <AppButton variant="secondary" block :disabled="isRestoring" @click="isConfirmRestoreOpen = false">
          Cancel
        </AppButton>
        <AppButton variant="danger" block :loading="isRestoring" @click="confirmRestore">
          Restore &amp; reload
        </AppButton>
      </template>
    </AppModalSheet>
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

.stale-banner {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-3);
  background-color: var(--color-warning-soft);
  border: 1px solid var(--color-warning);
  border-radius: var(--radius-md);
  color: var(--color-warning);
}

.stale-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stale-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
}

.stale-text {
  font-size: var(--font-size-xs);
  line-height: var(--line-height-snug);
}

.counts-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
  margin: 0;
}

.count-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-2) var(--space-3);
  background-color: var(--color-surface-sunken);
  border-radius: var(--radius-md);
}

.count-cell dt {
  font-size: var(--font-size-2xs);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.count-cell dd {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
}

.last-export {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.status-banner {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
}

.tone-success {
  background-color: var(--color-success-soft);
  color: var(--color-success);
}

.tone-error {
  background-color: var(--color-danger-soft);
  color: var(--color-danger);
}

.action-stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  border: 0;
}

.confirm-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.confirm-file {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-2) var(--space-3);
  background-color: var(--color-surface-sunken);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  word-break: break-all;
}

.confirm-list {
  margin: 0;
  padding-left: var(--space-5);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-base);
  color: var(--color-text-muted);
}
</style>
