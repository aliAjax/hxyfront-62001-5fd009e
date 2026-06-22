# Local Quality Verification Guide

This document describes the quality gate process for daily development, including type checking, testing, build verification, and manual verification steps for core functionalities.

## Quick Start

Run the full quality gate before committing code:

```bash
npm run quality
```

Or with coverage report:

```bash
npm run quality:coverage
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run typecheck` | Run TypeScript type checking only |
| `npm run test` | Run all unit tests once |
| `npm run test:watch` | Run tests in watch mode during development |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run build:check` | Type check + production build |
| `npm run quality` | **Full quality gate**: typecheck → test → build |
| `npm run quality:coverage` | Full quality gate with coverage |
| `npm run dev` | Start development server |
| `npm run build` | Production build only |
| `npm run preview` | Preview production build |

## Test Coverage

Tests are located in `src/shifts/*.test.ts` and cover:

### 1. Multi-Vessel Data Isolation (`vessel-isolation.test.ts`)
- Adding new vessels with independent data spaces
- Switching between vessels without data leakage
- Vessel and shift double isolation
- Deleting vessels cleans up all associated data
- Per-vessel current shift memory

### 2. Import/Export Functionality (`import-export.test.ts`)
- Empty data export format validation
- Export includes all data types (watch records, engine room, anomalies, bilge water, handover summaries)
- Multi-vessel export with `vesselScopedData`
- Single vessel export
- Import with `merge` strategy (preserves existing data)
- Import with `overwrite` strategy (replaces existing data)
- Import/export round-trip data consistency
- Multi-vessel data import

### 3. Data Migration (`data-migration.test.ts`)
- Legacy single-vessel format migration to vessel-scoped format
- Field completion for anomaly records
- Risk assessment data migration
- Mixed format (both vessel-scoped and shift-scoped) detection and migration
- Schema version auto-update
- Post-migration data accessibility
- Multi-vessel operations after migration

### 4. LocalStorage Isolation Guarantee (`src/test/setup.ts`)

**Important**: All tests use a mocked localStorage implementation that:
- ✅ Completely isolates test data from real browser localStorage
- ✅ Clears all watch-related storage keys before each test
- ✅ Snapshots and restores any non-test localStorage entries
- ✅ Resets the repository singleton instance between tests
- ✅ Uses Vitest mocks that are restored after each test

This ensures test data **never** pollutes your actual browser localStorage.

## Manual Verification Checklist

After automated checks pass, verify these key user scenarios:

### 1. Multi-Vessel Management
- [ ] Default vessel exists on first load
- [ ] Can add new vessels (name, IMO, MMSI, fleet ID)
- [ ] Can edit vessel information
- [ ] Can delete non-default vessels
- [ ] Cannot delete the default vessel
- [ ] Switching vessels shows different data
- [ ] Per-vessel current shift is remembered

### 2. Data Migration (if upgrading from old version)
- [ ] Old data appears under default vessel after migration
- [ ] All records have correct `vesselId` field
- [ ] Anomaly records have complete fields (`originShiftId`, `handoverPath`, `statusHistory`)
- [ ] Risk assessments have `schemaVersion` field
- [ ] No data loss after migration

### 3. Data Import/Export
- [ ] Can export all data as JSON file
- [ ] Can export single vessel data
- [ ] Exported file contains all records types
- [ ] Can import data with `merge` strategy
- [ ] Can import data with `overwrite` strategy
- [ ] Import shows conflict warnings when appropriate
- [ ] Imported multi-vessel data is correctly isolated

### 4. Key Page Functionality
- [ ] **Watch Records Page**: Add, edit, delete records
- [ ] **Engine Room Page**: Add engine parameters, view latest
- [ ] **Anomaly Timeline Page**: Create anomalies, update status, carry over between shifts
- [ ] **Bilge Water Panel**: Add bilge water records, warning levels display correctly
- [ ] **Risk Assessment Page**: Auto-calculate risk, view risk triggers
- [ ] **Shift Handover Page**: Generate handover summary, save drafts
- [ ] **Data Manager Page**: Import/export works, shows statistics
- [ ] **Device History Page**: View historical records per device

### 5. Shift Functionality
- [ ] 6 shifts available (00-04, 04-08, 08-12, 12-16, 16-20, 20-24)
- [ ] Current shift auto-detected based on time
- [ ] Manual shift switch works
- [ ] Anomalies can be carried over to next shift
- [ ] Handover path displays correctly for carried-over anomalies

## Continuous Integration Workflow

```
Pull Request / Commit
        ↓
npm run typecheck   (Type errors?)
        ↓
npm run test        (All tests pass?)
        ↓
npm run build       (Production build succeeds?)
        ↓
Manual Verification (Optional, for critical changes)
        ↓
✓ Ready to merge
```

## Troubleshooting

### Type checking fails
- Run `npm run typecheck` to see detailed errors
- Check for missing or incorrect type annotations
- Ensure all imported types are correctly defined

### Tests fail
- Run `npm run test:watch` to debug specific tests
- Check test isolation: each test should create a fresh repository
- Verify mock localStorage is working correctly

### Build fails
- Ensure no TypeScript errors (`npm run typecheck`)
- Check for missing dependencies: `npm install`
- Clear vite cache: delete `node_modules/.vite`

### localStorage pollution concerns
- Tests use mocked localStorage, so real browser data is safe
- To manually clear app data from your browser:
  1. Open DevTools → Application → Local Storage
  2. Find keys starting with `watch-`
  3. Delete them or use "Clear all"

## Test Data Safety

All test operations are completely isolated from your real browser data:

1. **Mocked Storage**: Tests use an in-memory mock of localStorage
2. **Snapshot/Restore**: Non-test localStorage entries are preserved
3. **Per-Test Reset**: Each test starts with a clean state
4. **No Real Writes**: Test data never touches actual browser storage

You can safely run the full test suite without worrying about affecting any saved data in your browser.
