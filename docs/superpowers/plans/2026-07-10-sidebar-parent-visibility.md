# UDS Core sidebar parent visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the shared `uds-core` sidebar parent's visibility feature-agnostic so disabling one feature (e.g.
Packages) no longer hides the whole UDS Core tree (issue #18), implementing the rule already recorded in ADR-0008.

**Architecture:** A single shared owner module, `src/common/udsSidebar.ts`, registers the `uds-core` parent once
(idempotent), installs one filter that hides the parent only when **no** UDS-Core child feature is enabled, and — per
child — registers the child entry plus a filter gating that child on its own feature flag. Features stop registering the
parent or any sidebar filter; they call `registerUdsCoreChild(...)` and register their routes. The pure "is any of these
features enabled" predicate lives in the dependency-free `flags.ts` so it is unit-tested in isolation.

**Tech Stack:** TypeScript (strict), React, `@kinvolk/headlamp-plugin`, bun, Vitest.

## Global Constraints

- Import only from the main barrel `@kinvolk/headlamp-plugin/lib`; no deep `/lib/lib/...` paths.
- Registration is one-shot (ADR-0004): register entries/filters unconditionally at load; filters are plain functions (no
  hooks) reading `store.get()` synchronously.
- A feature must never gate the shared `uds-core` parent (ADR-0008). Only the shared owner gates the parent, and only on
  the aggregate "no child enabled" condition.
- `flags.ts` stays free of any Headlamp import (it is the barrel-free, unit-tested core).
- Apache-2.0 header on new files. `bun run tsc|lint|test|build` all pass. Commits: `<area>: <verb> ... (#18)`, ASCII,
  `git commit -F`, `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## File Structure

```
src/settings/flags.ts          # MODIFY: add pure anyFeatureEnabled()
src/settings/flags.test.ts     # MODIFY: tests for anyFeatureEnabled
src/common/udsSidebar.ts       # NEW: registerUdsCoreChild() shared owner
src/features/packages/index.tsx    # MODIFY: use registerUdsCoreChild; drop parent+filter
src/features/exemptions/index.tsx  # MODIFY: use registerUdsCoreChild; drop parent+filter
```

______________________________________________________________________

## Task 1: Shared sidebar owner + pure predicate

**Files:**

- Modify: `src/settings/flags.ts`, `src/settings/flags.test.ts`
- Create: `src/common/udsSidebar.ts`

**Interfaces:**

- Produces (flags.ts):
  `anyFeatureEnabled(cfg: UdsFlags | undefined, cluster: string, ids: Iterable<string>, dflt: boolean): boolean`

- Produces (udsSidebar.ts):
  `registerUdsCoreChild(opts: { featureId: string; name: string; label: string; url: string; icon?: string }): void`

- [ ] **Step 1: Failing test for `anyFeatureEnabled`** — append to `src/settings/flags.test.ts`:

```ts
import { anyFeatureEnabled } from './flags';

describe('anyFeatureEnabled', () => {
  const cfg = { autoDetect: true, clusters: { c1: { features: { a: false, b: true } } } };
  it('is true when any id is enabled', () => {
    expect(anyFeatureEnabled(cfg, 'c1', ['a', 'b'], true)).toBe(true);
  });
  it('is false when every id is explicitly disabled', () => {
    expect(anyFeatureEnabled(cfg, 'c1', ['a'], true)).toBe(false);
  });
  it('falls back to the default for absent ids', () => {
    expect(anyFeatureEnabled(cfg, 'c1', ['missing'], true)).toBe(true);
    expect(anyFeatureEnabled(cfg, 'c1', ['missing'], false)).toBe(false);
  });
  it('is false for an empty id list', () => {
    expect(anyFeatureEnabled(cfg, 'c1', [], true)).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify fail** — `bun run test` → FAIL (`anyFeatureEnabled` not exported).

- [ ] **Step 3: Implement `anyFeatureEnabled`** in `src/settings/flags.ts` (after `isFeatureEnabled`):

```ts
/** True when at least one of `ids` is enabled for the cluster (default `dflt`). */
export function anyFeatureEnabled(
  cfg: UdsFlags | undefined,
  cluster: string,
  ids: Iterable<string>,
  dflt: boolean
): boolean {
  for (const id of ids) {
    if (isFeatureEnabled(cfg, cluster, id, dflt)) {
      return true;
    }
  }
  return false;
}
```

- [ ] **Step 4: Run, verify pass** — `bun run test` → PASS.

- [ ] **Step 5: Create `src/common/udsSidebar.ts`** (Apache header):

```ts
import { registerSidebarEntry, registerSidebarEntryFilter } from '@kinvolk/headlamp-plugin/lib';
import { store } from '../settings/config';
import { anyFeatureEnabled, DEFAULT_FLAGS, isFeatureEnabled } from '../settings/flags';
import { currentCluster } from './cluster';

const UDS_CORE = 'uds-core';

/** Feature ids that contribute a child under the UDS Core parent. Populated as
 *  features call registerUdsCoreChild() at load, before any filter runs. */
const childFeatureIds = new Set<string>();
let parentRegistered = false;

function liveCluster(): string {
  return currentCluster() ?? '';
}

/** Register a feature's child under the shared "UDS Core" sidebar parent.
 *  Registers the parent once (idempotent) with a filter that hides it only when
 *  no child feature is enabled, then registers this child and a filter gating it
 *  on its own feature flag. Features must NOT register the parent themselves. */
export function registerUdsCoreChild(opts: {
  featureId: string;
  name: string;
  label: string;
  url: string;
  icon?: string;
}): void {
  childFeatureIds.add(opts.featureId);

  if (!parentRegistered) {
    parentRegistered = true;
    // Parent url points at the first-registered child's url (manifest order).
    registerSidebarEntry({
      parent: null,
      name: UDS_CORE,
      label: 'UDS Core',
      url: opts.url,
      icon: 'mdi:hexagon-multiple',
    });
    // Hide the shared parent only when NO child feature is enabled.
    registerSidebarEntryFilter(entry =>
      entry.name === UDS_CORE &&
      !anyFeatureEnabled(store.get() ?? DEFAULT_FLAGS, liveCluster(), childFeatureIds, true)
        ? null
        : entry
    );
  }

  registerSidebarEntry({
    parent: UDS_CORE,
    name: opts.name,
    label: opts.label,
    url: opts.url,
    icon: opts.icon,
  });
  // Gate this child on its own feature flag (live).
  registerSidebarEntryFilter(entry =>
    entry.name === opts.name &&
    !isFeatureEnabled(store.get() ?? DEFAULT_FLAGS, liveCluster(), opts.featureId, true)
      ? null
      : entry
  );
}
```

**VERIFY:** `registerSidebarEntry`/`registerSidebarEntryFilter` signatures are already used in the feature files;
confirm `SidebarEntryProps` accepts `icon?`. No unit test for udsSidebar.ts (thin; imports the runtime barrel) — the
pure logic is `anyFeatureEnabled` in flags.ts.

- [ ] **Step 6: Gates** — `bun run tsc && bun run lint && bun run test && bun run build` all pass.

- [ ] **Step 7: Commit** — `common/udsSidebar: shared UDS Core sidebar owner with aggregate parent gating (#18)`.

______________________________________________________________________

## Task 2: Adopt the shared owner in both features

**Files:**

- Modify: `src/features/packages/index.tsx`, `src/features/exemptions/index.tsx`

**Interfaces:**

- Consumes: `registerUdsCoreChild` (Task 1).

- [ ] **Step 1: Refactor `src/features/packages/index.tsx`** — replace the two `registerSidebarEntry` calls **and** the
  `registerSidebarEntryFilter` with one `registerUdsCoreChild`; drop the now-unused `packagesEnabled` helper and imports
  (`registerSidebarEntry`, `registerSidebarEntryFilter`, `store`, `DEFAULT_FLAGS`, `isFeatureEnabled`,
  `currentCluster`). Keep `registerRoute` (list and — if present after a merge with #11 — detail). The `register()`
  becomes:

```tsx
import { registerRoute } from '@kinvolk/headlamp-plugin/lib';
import { registerUdsCoreChild } from '../../common/udsSidebar';
import { Feature } from '../types';
import { PackagesList } from './List';

const FEATURE_ID = 'packages';

export const packagesFeature: Feature = {
  id: FEATURE_ID,
  title: 'UDS Packages',
  defaultEnabled: true,
  requiresUds: true,
  register() {
    registerUdsCoreChild({
      featureId: FEATURE_ID,
      name: 'uds-packages',
      label: 'Packages',
      url: '/uds-core/packages',
      icon: 'mdi:package-variant-closed',
    });
    registerRoute({
      path: '/uds-core/packages',
      sidebar: 'uds-packages',
      name: 'uds-packages',
      exact: true,
      component: () => <PackagesList />,
    });
  },
};
```

(If this branch has been rebased onto a merged #11, keep the existing `uds-package-detail` `registerRoute` too.)

- [ ] **Step 2: Refactor `src/features/exemptions/index.tsx`** identically — one `registerUdsCoreChild` (featureId
  `exemptions`, child `uds-exemptions`, label `Exemptions`, url `/uds-core/exemptions`), keep both `registerRoute`s
  (list + detail), drop the parent registration, the own-child filter, `exemptionsEnabled`, and the now-unused imports.

- [ ] **Step 3: Gates** — `bun run tsc && bun run lint && bun run test && bun run build` all pass. `build` proves the
  sidebar still loads; no `registerSidebarEntry`/`registerSidebarEntryFilter`/`store` imports remain in either feature.

- [ ] **Step 4: Commit** — `features: register UDS Core children via the shared sidebar owner (#18)`.

## Self-Review

- Coverage: parent registered once + aggregate-gated (Task 1); both features stop gating the parent (Task 2) → #18 AC
  met (disabling one feature keeps the other's entry).
- Type consistency: `registerUdsCoreChild` opts match both call sites; `anyFeatureEnabled` signature matches its use.
- No placeholders.

## Execution Handoff

Subagent-Driven Development. **Note:** touches `packages/index.tsx`, which PR #21 (#11) also edits — expect a small
rebase/conflict when whichever merges second; keep both the `registerUdsCoreChild` call and #11's detail route.
