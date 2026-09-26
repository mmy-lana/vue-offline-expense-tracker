# vue-offline-expense-tracker

A local-first, offline-native Progressive Web App (PWA) personal finance ledger built with Vue 3, Vite, and IndexedDB (Dexie.js).

Live Demo: https://vue-offline-expense-tracker.vercel.app

---

## Architectural Highlights

- **Local-First Data Engine**: Zero cloud dependence. Every read, write, aggregation, and export executes locally inside IndexedDB using atomic Dexie transactions.
- **Financial Invariant Arithmetic**: All currency values are strictly stored and computed as safe 64-bit integer minor units (cents) to eliminate IEEE 754 binary floating-point rounding errors.
- **Hardware-Adaptive App Shell**: Native mobile ergonomics adhering to Apple Human Interface Guidelines and WCAG 2.5.5 standards:
  - 44px by 44px minimum tap boundaries across all interactive elements.
  - Safe-area inset encapsulation (`env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`, `env(safe-area-inset-left)`, `env(safe-area-inset-right)`).
  - Hardware-aware sensor clearance for iPhone Dynamic Island and notches in standalone portrait orientation, with adaptive collapsing in landscape.
  - Custom docked numeric keypad with tactile haptic feedback (Vibration API).
  - WebKit virtual keyboard layout-shift mitigation on text focus.
- **Data Sovereignty & Portability**:
  - Lossless backup/restore engine packaging structured records and binary receipt attachments (Base64) into schema-validated JSON archives.
  - Ingestion limits: 50MB payload cap, 500 attachment maximum, 5MB individual attachment ceiling, and strict MIME type whitelisting.
  - CSV spreadsheet export with RFC 4180 escaping, UTF-8 BOM, and OWASP formula injection neutralization (`=`, `+`, `-`, `@`, `\t`, `\r`).
- **PWA Lifecycle Management**: Prompt-driven service worker update cycle, background cache preheating, and install-prompt mediation.

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| Framework | Vue 3 (Composition API, `<script setup lang="ts">`) |
| Build Tool | Vite |
| Language | TypeScript (Strict mode enabled) |
| Local Storage | IndexedDB via Dexie.js |
| State Management | Pinia |
| Routing | Vue Router (HTML5 History Mode) |
| PWA Engine | `vite-plugin-pwa`, `workbox-window`, `@vite-pwa/assets-generator` |
| Styling | CSS Custom Properties (Tokens), Modern Resets, Scoped CSS |

---

## Core Feature Overview

### 1. Ledger & Transactions
- Record Expenses, Income, and Account Transfers with atomic two-leg accounting.
- Swipeable ledger rows with action reveal rails (`touch-action: pan-y`).
- Infinite scroll pagination managed through IntersectionObserver.
- Multi-dimensional filtering by text, transaction type, account, category, and date range.

### 2. Category Envelopes & Budgets
- Monthly category envelopes with unique compound indexes (`&[categoryId+yearMonth]`).
- Three-tier visual pacing status indicators (On Track, Nearing Limit, Over Budget).
- Real-time remaining daily allowance projection algorithm floored for closed past periods.
- Atomic batch envelope replication between months.

### 3. Analytics & Visualization
- Pure SVG Spending Donut Chart with trigonometry-based arc path generation (`M... A...`).
- Pure SVG Cash Flow Bar Chart displaying trailing multi-month surplus/deficit comparisons.
- Screen-reader-accessible tabular trend view.

### 4. Accounts & Currencies
- Single base currency ledger model locking currency changes once transactions or budgets exist.
- Dynamic minor-unit exponent resolution via `Intl.NumberFormat` ICU data.
- Account balance reconciliation with support for credit liability opening balances.
- Referential integrity protections preventing mutations or deletions of active entities.

---

## Project Topology

```
public/
  icon.svg                 # Vector source asset for PWA generation
src/
  assets/
    styles/
      main.css             # Base resets and typography
      theme.css            # Brand and semantic color scales
      tokens.css           # Hardware safe areas, spacing, elevation, z-index
  components/
    features/
      analytics/           # Donut and Cash Flow SVG chart components
      budgets/             # Budget list, gauges, and creation modals
      settings/            # Backup/restore, currency, and PWA status cards
      transactions/        # Ledger table, filter bar, receipt viewer
    molecules/             # Composite UI controls (DateNavigator, AmountDisplay, etc.)
    ui/                    # Atomic primitives (AppButton, AppInput, AppKeypad, AppModalSheet)
  composables/             # useCurrency, useHaptics, useLedgerCalculations, usePwaManager
  layouts/                 # AppShell, AppHeader, AppTabBar
  router/                  # Route configurations and navigation guards
  services/                # Dexie DB layer, ledger service, backup/restore transfer engine
  stores/                  # Pinia stores (ledgerStore, settingsStore)
  types/                   # Pure TypeScript models, DTOs, and filter contracts
  utils/                   # Date, UUID, monetary formatting, and schema validation
  views/                   # Top-level screen views
```

---

## Development Setup

### Prerequisites

- Node.js (Active LTS)
- pnpm (Strictly enforced package manager)

### Installation

```bash
# Clone repository
git clone https://github.com/<your-username>/vue-offline-expense-tracker.git
cd vue-offline-expense-tracker

# Install dependencies
pnpm install
```

### Development Server

```bash
pnpm run dev
```

### Production Build & Type Verification

```bash
# Type check and build bundle
pnpm run build

# Preview production build locally
pnpm run preview
```

### PWA Asset Generation

```bash
pnpm exec pwa-assets-generator
```

---

## Security & Verification Standards

- **OWASP Top 10 Compliance**: Pre-read file size verification (`file.size <= MAX_BACKUP_BYTES`), strict MIME whitelisting, directory traversal scrubbing on file names, and CSV formula injection neutralization across all data columns.
- **ACID Transaction Isolation**: Multi-table operations wrapped in read-write transactions with automatic rollback upon failure.
- **Accessibility**: Tap target boundaries >= 44px, full WAI-ARIA radiogroup compliance with roving tabindex on category selectors, and `aria-live` status regions for background resets.

---

## License

MIT
