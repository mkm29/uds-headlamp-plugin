# Phase 2: UDS Packages Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface `packages.uds.dev/v1alpha1` (Package CRs) in Headlamp as a dedicated "UDS Core → Packages" sidebar
section with a status-aware list view and a read-only detail view, plus real UDS Core auto-detection that gates the
feature.

**Architecture:** Follows the Phase 1 pattern (ADR-0002/0003/0004): each pure, decision-bearing function lives in a
testable module with no Headlamp runtime dependency; the React components and one-shot `register()` stay thin. The
feature registers unconditionally at load and gates visibility with a live sidebar filter (reads the enable flag) plus
in-component detection guards. Custom resource access uses `makeCustomResourceClass`; list/detail render with Headlamp's
`ResourceListView` / `DetailsGrid` common components so we inherit RBAC-graceful empty states for free.

**Tech Stack:** TypeScript (strict), React 18, MUI, `@kinvolk/headlamp-plugin` `^0.14.0`, bun (lint/tsc/test/build),
jest (via `headlamp-plugin test`).

## Global Constraints

Every task's requirements implicitly include this section.

- **Import only from the main barrel.** Import from `@kinvolk/headlamp-plugin/lib` (and the top-level re-export
  `@kinvolk/headlamp-plugin/lib/Crd`). Deep submodule paths such as `@kinvolk/headlamp-plugin/lib/lib/k8s/...` are **not
  in the plugin externals map and resolve to undefined globals in the deployed Headlamp app, crashing the whole plugin
  on load** — this is a confirmed landmine documented in `src/common/cluster.ts:17-25`.
- **Registration is one-shot** (ADR-0004). `register()` runs once at load. Register sidebar entries and routes
  unconditionally; gate visibility with `registerSidebarEntryFilter` + in-component guards. Never skip registration
  based on the load-time snapshot.
- **Per-cluster config via the single ConfigStore** (ADR-0005). Reads always fall back to in-code defaults; an empty
  store must yield a working config. Do not add a second store.
- **Fail-open / RBAC-graceful.** All K8s reads are impersonated (OpenUnison). A user lacking `list` permission must
  degrade to an empty/"unknown" UI, never a crash or error dialog. Treat "unknown" as "not detected / empty".
- **No bundled shared modules** (ADR-0006). Do not add React/MUI/lodash/recharts as dependencies. Use the versions
  Headlamp provides.
- **Apache-2.0 license header** on every new `.ts`/`.tsx` file — copy the 15-line header verbatim from any existing
  source file (e.g. `src/features/packages/index.ts`).
- **Pure logic is unit-tested; React/registration is thin.** Extract every branch/decision into a pure function with a
  `*.test.ts`. Do not write tests that assert nothing.
- **Gates.** `bun run tsc`, `bun run lint`, and `bun run test` must pass at the end of every task. `bun run build` must
  succeed (it is the only check that surfaces the deep-import landmine).
- **Commits.** Style `<area>: <verb> <description> (#<issue>)`, ASCII only, authored with `git commit -F <file>` (never
  a `cat` heredoc — it embeds ANSI). End each commit body with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## Scope

**In scope (Phase 2):** UDS Core detection; the `Package` CR class + status types; the Packages list view + sidebar; the
Package detail view.

**Explicitly out of scope (deferred):**

- The workload exemption-annotation cross-link (Pod/Service detail section reading
  `uds-core.pepr.dev/uds-core-policies.<POLICY>: exempted`) — moves to Phase 3 with the Exemptions feature, where the
  annotation logic lives.
- Hiding the sidebar *entry* when UDS Core is undetected. A sidebar filter is a plain function and cannot call the
  `useUdsDetect()` hook, so Phase 2 gates the sidebar on the **enable flag** only and shows a "UDS Core not detected"
  **empty state inside the list/detail components**. A non-hook detection cache that also hides the entry is a Phase 3
  refinement (YAGNI now).

______________________________________________________________________

## Package CRD reference (verified against UDS `main`, `v1alpha1`, group `uds.dev`, namespaced)

`Package` (`kind: Package`, `pluralName: packages`, `singularName: package`). Fields the UI consumes:

- `status.phase`: enum `Pending | Ready | Failed | Retrying | Removing | RemovalFailed`.
- `status.ssoClients[]` (string[]).
- `status.authserviceClients[]` (`{ clientId, selector }[]`).
- `status.endpoints[]` (string[]).
- `status.monitors[]`, `status.probes[]` (arrays; render counts).
- `status.networkPolicyCount` (integer), `status.authorizationPolicyCount` (integer).
- `status.retryAttempt` (nullable integer), `status.observedGeneration`, `status.meshMode` (`ambient | sidecar`).
- `status.conditions[]` (Kubernetes-style: `type`/`status`/`lastTransitionTime`/`reason`/`message`).
- `spec.network.expose[]`, `spec.sso[]`, `spec.monitor[]`, `spec.caBundle`.

Printer columns (match `kubectl`): Status, SSO Clients, Endpoints, Monitors, Probes, Network Policies, Authorization
Policies, Age.

**Status → StatusLabel color** (`StatusLabel.status` accepts `'success' | 'warning' | 'error' | ''`): `Ready → success`;
`Pending | Retrying | Removing → warning`; `Failed | RemovalFailed → error`; anything else `→ ''`.

## File Structure

```
src/common/
  udsDetect.ts        # MODIFY: real useUdsDetect + pure udsGroupsFromCrds + UDS_GROUP const
  udsDetect.test.ts   # NEW: pure detection tests

src/features/packages/
  resource.ts         # NEW: Package CR class + status types + phaseToStatus (pure)
  resource.test.ts    # NEW: phaseToStatus tests
  List.tsx            # NEW: PackagesList (ResourceListView + status columns)
  Detail.tsx          # NEW: PackageDetail (DetailsGrid + status sections)
  index.ts            # MODIFY: register() -> sidebar + list route (Issue 3) + detail route (Issue 4) + filter
```

Interfaces flow one direction: Issue 1 (detection) and Issue 2 (resource) are independent; Issue 3 (list) consumes both;
Issue 4 (detail) consumes Issue 2 and appends one route to the `register()` written in Issue 3.

______________________________________________________________________

## Issue 1: UDS Core auto-detection (`useUdsDetect`)

Replace the `src/common/udsDetect.ts` scaffold placeholder with a real detection hook backed by
`CustomResourceDefinition.useList()`, plus a pure helper that is unit-tested. Unblocks the `requiresUds` semantics used
by every UDS feature and the Settings "Test / Detect" button.

**Files:**

- Modify: `src/common/udsDetect.ts`
- Test: `src/common/udsDetect.test.ts` (create)

**Interfaces:**

- Produces:

  - `export const UDS_GROUP = 'uds.dev'`
  - `export function udsGroupsFromCrds(crds: Array<{ spec?: { group?: string } }> | null): Set<string>`
  - `export function useUdsDetect(): UdsDetectResult` (existing signature; `UdsDetectResult = { hasUds, groups }`)

- [ ] **Step 1: Write the failing test for the pure helper**

Create `src/common/udsDetect.test.ts` (with the Apache header):

```ts
import { udsGroupsFromCrds, UDS_GROUP } from './udsDetect';

describe('udsGroupsFromCrds', () => {
  it('collects distinct spec.group values', () => {
    const crds = [
      { spec: { group: 'uds.dev' } },
      { spec: { group: 'uds.dev' } },
      { spec: { group: 'cert-manager.io' } },
    ];
    expect(udsGroupsFromCrds(crds)).toEqual(new Set(['uds.dev', 'cert-manager.io']));
  });

  it('is empty and never throws for null (RBAC-denied list)', () => {
    expect(udsGroupsFromCrds(null)).toEqual(new Set());
  });

  it('skips entries missing spec.group', () => {
    const crds = [{ spec: {} }, {}, { spec: { group: 'uds.dev' } }] as any;
    expect(udsGroupsFromCrds(crds)).toEqual(new Set([UDS_GROUP]));
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `bun run test -- udsDetect` Expected: FAIL — `udsGroupsFromCrds` is not exported yet.

- [ ] **Step 3: Implement the real detection module**

Rewrite the body of `src/common/udsDetect.ts` (keep the Apache header and the `UdsDetectResult` interface):

```ts
import { K8s } from '@kinvolk/headlamp-plugin/lib';

/** Result of UDS Core detection. */
export interface UdsDetectResult {
  hasUds: boolean;
  groups: Set<string>;
}

/** The CRD API group shared by Packages, Exemptions, and ClusterConfig. */
export const UDS_GROUP = 'uds.dev';

/** Pure: reduce a CRD list to the set of API groups present. Null-safe (RBAC-denied). */
export function udsGroupsFromCrds(crds: Array<{ spec?: { group?: string } }> | null): Set<string> {
  const groups = new Set<string>();
  for (const c of crds ?? []) {
    const g = c?.spec?.group;
    if (g) {
      groups.add(g);
    }
  }
  return groups;
}

/**
 * Detect whether UDS Core is installed in the current cluster. Reads are
 * impersonated, so a user lacking `list customresourcedefinitions` gets an
 * empty list -> hasUds:false ("unknown" treated as "not detected", ADR-0004).
 */
export function useUdsDetect(): UdsDetectResult {
  const [crds] = K8s.ResourceClasses.CustomResourceDefinition.useList();
  const groups = udsGroupsFromCrds(crds as Array<{ spec?: { group?: string } }> | null);
  return { hasUds: groups.has(UDS_GROUP), groups };
}
```

**VERIFY during implementation:** confirm `CustomResourceDefinition.useList()` returns a `[items, error]` tuple in the
installed version — check `node_modules/@kinvolk/headlamp-plugin/lib/lib/k8s/KubeObject.d.ts` (or the
`CustomResourceDefinition` class' `useList` signature). If it instead returns an object (`{ items }` / `{ data }`),
adapt the destructuring. The pure `udsGroupsFromCrds` contract does not change.

- [ ] **Step 4: Run the test, verify it passes**

Run: `bun run test -- udsDetect` Expected: PASS (3/3).

- [ ] **Step 5: Gates**

Run: `bun run tsc && bun run lint && bun run build` Expected: all succeed. `build` proves the `K8s` barrel import did
not trip the deep-import landmine.

- [ ] **Step 6: Commit**

```bash
git add src/common/udsDetect.ts src/common/udsDetect.test.ts
git commit -F <commit-msg-file>
# subject: "common/udsDetect: implement CRD-based UDS Core detection (#<issue>)"
```

______________________________________________________________________

## Issue 2: Package CR class + status types (`resource.ts`)

Define the `Package` custom-resource class and the pure `phaseToStatus` color mapping that both the list and detail
views consume. This is the smallest independently-reviewable unit and unblocks Issues 3 and 4.

**Files:**

- Create: `src/features/packages/resource.ts`
- Test: `src/features/packages/resource.test.ts`

**Interfaces:**

- Produces:

  - `export const Package` — a `KubeObjectClass` for `packages.uds.dev/v1alpha1` (namespaced).
  - `export type PackagePhase = 'Pending' | 'Ready' | 'Failed' | 'Retrying' | 'Removing' | 'RemovalFailed'`
  - `export type StatusKind = 'success' | 'warning' | 'error' | ''`
  - `export function phaseToStatus(phase: string | undefined): StatusKind`

- [ ] **Step 1: Write the failing test for `phaseToStatus`**

Create `src/features/packages/resource.test.ts` (Apache header):

```ts
import { phaseToStatus } from './resource';

describe('phaseToStatus', () => {
  it('maps Ready to success', () => {
    expect(phaseToStatus('Ready')).toBe('success');
  });
  it('maps in-progress phases to warning', () => {
    for (const p of ['Pending', 'Retrying', 'Removing']) {
      expect(phaseToStatus(p)).toBe('warning');
    }
  });
  it('maps failure phases to error', () => {
    for (const p of ['Failed', 'RemovalFailed']) {
      expect(phaseToStatus(p)).toBe('error');
    }
  });
  it('maps unknown/undefined to the neutral empty status', () => {
    expect(phaseToStatus(undefined)).toBe('');
    expect(phaseToStatus('Weird')).toBe('');
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `bun run test -- resource` Expected: FAIL — module `./resource` not found.

- [ ] **Step 3: Implement `resource.ts`**

Create `src/features/packages/resource.ts` (Apache header):

```ts
import { makeCustomResourceClass } from '@kinvolk/headlamp-plugin/lib/Crd';

/** Package phases from status.phase (UDS operator, v1alpha1). */
export type PackagePhase =
  | 'Pending'
  | 'Ready'
  | 'Failed'
  | 'Retrying'
  | 'Removing'
  | 'RemovalFailed';

/** Colors accepted by Headlamp's StatusLabel component. */
export type StatusKind = 'success' | 'warning' | 'error' | '';

/** Map a Package status.phase to a StatusLabel color. Pure; unknown -> ''. */
export function phaseToStatus(phase: string | undefined): StatusKind {
  switch (phase) {
    case 'Ready':
      return 'success';
    case 'Pending':
    case 'Retrying':
    case 'Removing':
      return 'warning';
    case 'Failed':
    case 'RemovalFailed':
      return 'error';
    default:
      return '';
  }
}

/**
 * The Package custom resource (packages.uds.dev/v1alpha1, namespaced).
 *
 * Imported from the top-level `/lib/Crd` re-export, NOT a deep submodule path
 * (Global Constraints: the deep-import landmine).
 */
export const Package = makeCustomResourceClass({
  apiInfo: [{ group: 'uds.dev', version: 'v1alpha1' }],
  kind: 'Package',
  pluralName: 'packages',
  singularName: 'package',
  isNamespaced: true,
});
```

**VERIFY during implementation (the one real risk in Phase 2):** `makeCustomResourceClass` is exported from
`@kinvolk/headlamp-plugin/lib/Crd` (confirmed: `node_modules/@kinvolk/headlamp-plugin/lib/Crd.d.ts` re-exports it; the
`CRClassArgs` object form is `node_modules/@kinvolk/headlamp-plugin/lib/lib/k8s/crd.d.ts:63-76`). Because this is a
deep-ish import, **the acceptance gate for this step is that `bun run build` succeeds AND the built `dist/main.js`
loads** — if `/lib/Crd` turns out not to be externalized, the fallback is to obtain the class at runtime from a
`CustomResourceDefinition` fetch (`new CustomResourceDefinition(...).makeCRClass()`), but try the direct import first as
Flux/Longhorn/Karpenter plugins do.

- [ ] **Step 4: Run the test, verify it passes**

Run: `bun run test -- resource` Expected: PASS (4/4).

- [ ] **Step 5: Gates (build is load-bearing here)**

Run: `bun run tsc && bun run lint && bun run build` Expected: all succeed. If `build` fails on the `Package` import,
apply the fallback in Step 3's verify note before proceeding.

- [ ] **Step 6: Commit**

```bash
git add src/features/packages/resource.ts src/features/packages/resource.test.ts
git commit -F <commit-msg-file>
# subject: "features/packages: add Package CR class and phase->status mapping (#<issue>)"
```

______________________________________________________________________

## Issue 3: Packages list view + sidebar (`List.tsx`, `index.ts`)

Add the "UDS Core → Packages" sidebar tree and a list route rendering all Packages with the status-aware columns. Gates
the sidebar on the live enable flag; shows a detection empty state.

**Files:**

- Create: `src/features/packages/List.tsx`
- Modify: `src/features/packages/index.ts`

**Interfaces:**

- Consumes: `Package`, `phaseToStatus`, `StatusKind` (Issue 2); `useUdsDetect` (Issue 1); `store`, `isFeatureEnabled`
  (existing); `currentCluster` (existing).

- Produces: `PackagesList` React component; `register()` that calls `registerSidebarEntry` (parent + child),
  `registerRoute` (list), and `registerSidebarEntryFilter`.

- [ ] **Step 1: Implement `PackagesList`**

Create `src/features/packages/List.tsx` (Apache header). Render Headlamp's `ResourceListView` bound to the `Package`
class with custom columns; short-circuit to an empty state when UDS Core is not detected.

```tsx
import { CommonComponents } from '@kinvolk/headlamp-plugin/lib';
import { Box, Typography } from '@mui/material';
import { useUdsDetect } from '../../common/udsDetect';
import { Package, phaseToStatus } from './resource';

const { ResourceListView, StatusLabel } = CommonComponents;

/** Count helper: length of a status array field, 0 when absent. */
function count(v: unknown): number {
  return Array.isArray(v) ? v.length : 0;
}

export function PackagesList() {
  const { hasUds } = useUdsDetect();

  if (!hasUds) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography>UDS Core not detected in this cluster.</Typography>
      </Box>
    );
  }

  return (
    <ResourceListView
      title="UDS Packages"
      resourceClass={Package}
      columns={[
        'name',
        'namespace',
        {
          id: 'status',
          label: 'Status',
          getValue: (pkg: any) => pkg.status?.phase ?? '',
          render: (pkg: any) => (
            <StatusLabel status={phaseToStatus(pkg.status?.phase)}>
              {pkg.status?.phase ?? 'Unknown'}
            </StatusLabel>
          ),
        },
        { id: 'sso', label: 'SSO Clients', getValue: (pkg: any) => count(pkg.status?.ssoClients) },
        { id: 'endpoints', label: 'Endpoints', getValue: (pkg: any) => count(pkg.status?.endpoints) },
        { id: 'monitors', label: 'Monitors', getValue: (pkg: any) => count(pkg.status?.monitors) },
        { id: 'probes', label: 'Probes', getValue: (pkg: any) => count(pkg.status?.probes) },
        { id: 'netpol', label: 'Network Policies', getValue: (pkg: any) => pkg.status?.networkPolicyCount ?? 0 },
        { id: 'authpol', label: 'Authorization Policies', getValue: (pkg: any) => pkg.status?.authorizationPolicyCount ?? 0 },
        'age',
      ]}
    />
  );
}
```

**VERIFY during implementation:** confirm the `columns` item shape against
`node_modules/@kinvolk/headlamp-plugin/lib/components/common/Resource/ResourceTable.d.ts` — Headlamp accepts built-in
string columns (`'name'`, `'namespace'`, `'age'`) mixed with custom column objects; the custom-column keys may be
`{ label, getValue, render }` without `id`, or require `id`. Match the installed type exactly. Also confirm
`CommonComponents` exposes `ResourceListView` and `StatusLabel` (barrel:
`node_modules/@kinvolk/headlamp-plugin/lib/CommonComponents.d.ts` → `./components/common`); if a name is missing there,
it is still reachable but adjust the import.

- [ ] **Step 2: Wire `register()` in `index.ts`**

Rewrite `src/features/packages/index.ts` register body (keep the Apache header and the `packagesFeature` shape):

```ts
import {
  registerRoute,
  registerSidebarEntry,
  registerSidebarEntryFilter,
} from '@kinvolk/headlamp-plugin/lib';
import { currentCluster } from '../../common/cluster';
import { store } from '../../settings/config';
import { DEFAULT_FLAGS, isFeatureEnabled } from '../../settings/flags';
import { Feature } from '../types';
import { PackagesList } from './List';

const FEATURE_ID = 'packages';

/** Live read of the enable flag from the current store snapshot (no hooks). */
function packagesEnabled(): boolean {
  const flags = store.get() ?? DEFAULT_FLAGS;
  return isFeatureEnabled(flags, currentCluster() ?? '', FEATURE_ID, true);
}

export const packagesFeature: Feature = {
  id: FEATURE_ID,
  title: 'UDS Packages',
  defaultEnabled: true,
  requiresUds: true,
  register() {
    // One-shot registration (ADR-0004): register unconditionally, gate with a filter.
    registerSidebarEntry({
      parent: null,
      name: 'uds-core',
      label: 'UDS Core',
      url: '/uds-core/packages',
      icon: 'mdi:package-variant-closed',
    });
    registerSidebarEntry({
      parent: 'uds-core',
      name: 'uds-packages',
      label: 'Packages',
      url: '/uds-core/packages',
    });

    registerRoute({
      path: '/uds-core/packages',
      sidebar: 'uds-packages',
      name: 'uds-packages',
      exact: true,
      component: () => <PackagesList />,
    });

    // Hide the UDS Core sidebar tree when the feature is toggled off (live).
    registerSidebarEntryFilter(entry =>
      (entry.name === 'uds-core' || entry.name === 'uds-packages') && !packagesEnabled()
        ? null
        : entry
    );
  },
};
```

**VERIFY during implementation:** `registerSidebarEntry({ parent, name, label, url, icon })` and
`registerSidebarEntryFilter((entry) => entry | null)` are confirmed
(`node_modules/@kinvolk/headlamp-plugin/lib/plugin/registry.d.ts:98,149`). Confirm the `registerRoute` `Route` shape
(`path`, `sidebar`, `name`, `exact`, `component`) against the same file's `Route` type; adjust field names if the
installed version differs. `index.ts` renders JSX — if the file must stay `.ts`, either rename to `index.tsx` (and
update the manifest import, which is extension-less so it resolves either way) or wrap the component reference without
inline JSX. Prefer renaming to `index.tsx`.

- [ ] **Step 3: Gates**

Run: `bun run tsc && bun run lint && bun run test && bun run build` Expected: all pass; no new test failures (this
task's logic is exercised by Issue 1/2 unit tests plus the build).

- [ ] **Step 4: Commit**

```bash
git add src/features/packages/List.tsx src/features/packages/index.ts*
git commit -F <commit-msg-file>
# subject: "features/packages: add Packages list view and UDS Core sidebar (#<issue>)"
```

______________________________________________________________________

## Issue 4: Package detail view (`Detail.tsx`, route)

Add a read-only detail route for a single Package rendering the **full** CR (per the enriched `resource.ts` model): a
status summary, a conditions table, every status array (endpoints, SSO/authservice clients, monitors, probes), and the
key spec sections (exposed services, network allow rules, SSO client configs, Prometheus monitors, CA bundle). Read
through the typed accessors so nothing is `any`.

**Files:**

- Create: `src/features/packages/Detail.tsx`
- Modify: `src/features/packages/index.tsx` (append one detail route + link the list name column to it)

**Interfaces:**

- Consumes from `./resource`: `Package`, `PackageObject`, `packageStatus`, `packageSpec`, `phaseToStatus`, and the
  `PackageStatus`/`PackageSpec` (+ nested `ExposeEntry`, `AllowRule`, `MonitorEntry`, `SsoClient`, `AuthserviceClient`,
  `PackageCondition`) types; the `register()` from Issue 3.
- Produces: `PackageDetail` React component; a `registerRoute` for `/uds-core/packages/:namespace/:name` named
  `uds-package-detail`.

**Data note:** `status.ssoClients`, `status.endpoints`, `status.monitors`, `status.probes` are **string[]** (names);
`status.authserviceClients` is `{clientId, selector}[]`; the rich client config lives in **`spec.sso[]`**. So render the
status arrays as simple name lists and the SSO/network detail from `spec`. All fields are optional — every accessor must
default to `[]`/`'-'` and never throw (RBAC-graceful).

- [ ] **Step 1: Implement `PackageDetail`**

Create `src/features/packages/Detail.tsx` (Apache header). Use `DetailsGrid` for metadata + events, `extraInfo` for the
status summary, and `extraSections` for the arrays/spec. Use `SimpleTable` for object arrays and a name list for the
string arrays. Read via `packageStatus(pkg)` / `packageSpec(pkg)`.

```tsx
import { CommonComponents, Router } from '@kinvolk/headlamp-plugin/lib';
import { Box, Typography } from '@mui/material';
import {
  AllowRule,
  ExposeEntry,
  MonitorEntry,
  Package,
  PackageObject,
  packageSpec,
  packageStatus,
  phaseToStatus,
  SsoClient,
} from './resource';

const { DetailsGrid, StatusLabel, ConditionsTable, SectionBox, SimpleTable } = CommonComponents;

/** Render a string[] as a simple bulleted list, or a muted dash when empty. */
function NameList({ items }: { items?: string[] }) {
  if (!items || items.length === 0) {
    return <Typography color="textSecondary">-</Typography>;
  }
  return (
    <Box component="ul" sx={{ m: 0, pl: 2 }}>
      {items.map(i => (
        <li key={i}>{i}</li>
      ))}
    </Box>
  );
}

export function PackageDetail() {
  const { namespace, name } = Router.useParams<{ namespace: string; name: string }>();

  return (
    <DetailsGrid
      resourceType={Package}
      name={name}
      namespace={namespace}
      withEvents
      extraInfo={(pkg: PackageObject | null) => {
        const s = pkg ? packageStatus(pkg) : undefined;
        return (
          pkg && [
            {
              name: 'Status',
              value: (
                <StatusLabel status={phaseToStatus(s?.phase)}>{s?.phase ?? 'Unknown'}</StatusLabel>
              ),
            },
            { name: 'Mesh Mode', value: s?.meshMode ?? '-' },
            { name: 'Observed Generation', value: s?.observedGeneration == null ? '-' : String(s.observedGeneration) },
            { name: 'Retry Attempt', value: s?.retryAttempt == null ? '-' : String(s.retryAttempt) },
            { name: 'Network Policies', value: String(s?.networkPolicyCount ?? 0) },
            { name: 'Authorization Policies', value: String(s?.authorizationPolicyCount ?? 0) },
          ]
        );
      }}
      extraSections={(pkg: PackageObject | null) => {
        if (!pkg) {
          return [];
        }
        const s = packageStatus(pkg);
        const spec = packageSpec(pkg);
        return [
          // --- status arrays ---
          {
            id: 'uds-endpoints',
            section: (
              <SectionBox title="Endpoints">
                <NameList items={s?.endpoints} />
              </SectionBox>
            ),
          },
          {
            id: 'uds-sso-clients',
            section: (
              <SectionBox title="SSO Clients">
                <NameList items={s?.ssoClients} />
              </SectionBox>
            ),
          },
          {
            id: 'uds-authservice',
            section: (
              <SectionBox title="Authservice Clients">
                <SimpleTable
                  emptyMessage="None"
                  columns={[
                    { label: 'Client ID', getter: (c: { clientId: string }) => c.clientId },
                    {
                      label: 'Selector',
                      getter: (c: { selector?: Record<string, string> }) =>
                        Object.entries(c.selector ?? {})
                          .map(([k, v]) => `${k}=${v}`)
                          .join(', ') || '-',
                    },
                  ]}
                  data={s?.authserviceClients ?? []}
                />
              </SectionBox>
            ),
          },
          {
            id: 'uds-monitors',
            section: (
              <SectionBox title="Monitors">
                <NameList items={s?.monitors} />
              </SectionBox>
            ),
          },
          {
            id: 'uds-probes',
            section: (
              <SectionBox title="Probes">
                <NameList items={s?.probes} />
              </SectionBox>
            ),
          },
          // --- spec: exposed services ---
          {
            id: 'uds-expose',
            section: (
              <SectionBox title="Exposed Services (spec.network.expose)">
                <SimpleTable
                  emptyMessage="None"
                  columns={[
                    { label: 'Host', getter: (e: ExposeEntry) => e.host },
                    { label: 'Gateway', getter: (e: ExposeEntry) => e.gateway ?? 'tenant' },
                    { label: 'Service', getter: (e: ExposeEntry) => e.service ?? '-' },
                    { label: 'Port', getter: (e: ExposeEntry) => (e.port == null ? '-' : String(e.port)) },
                    {
                      label: 'Target Port',
                      getter: (e: ExposeEntry) => (e.targetPort == null ? '-' : String(e.targetPort)),
                    },
                  ]}
                  data={spec?.network?.expose ?? []}
                />
              </SectionBox>
            ),
          },
          // --- spec: network allow rules ---
          {
            id: 'uds-allow',
            section: (
              <SectionBox title="Network Allow Rules (spec.network.allow)">
                <SimpleTable
                  emptyMessage="None"
                  columns={[
                    { label: 'Direction', getter: (a: AllowRule) => a.direction },
                    {
                      label: 'Remote',
                      getter: (a: AllowRule) =>
                        a.remoteGenerated ?? a.remoteNamespace ?? a.remoteCidr ?? a.remoteHost ?? '-',
                    },
                    {
                      label: 'Ports',
                      getter: (a: AllowRule) =>
                        (a.ports ?? (a.port != null ? [a.port] : [])).join(', ') || '-',
                    },
                    { label: 'Description', getter: (a: AllowRule) => a.description ?? '-' },
                  ]}
                  data={spec?.network?.allow ?? []}
                />
              </SectionBox>
            ),
          },
          // --- spec: SSO client configs ---
          {
            id: 'uds-sso-config',
            section: (
              <SectionBox title="SSO Client Configuration (spec.sso)">
                <SimpleTable
                  emptyMessage="None"
                  columns={[
                    { label: 'Client ID', getter: (c: SsoClient) => c.clientId },
                    { label: 'Name', getter: (c: SsoClient) => c.name },
                    { label: 'Protocol', getter: (c: SsoClient) => c.protocol ?? 'openid-connect' },
                    { label: 'Enabled', getter: (c: SsoClient) => (c.enabled === false ? 'No' : 'Yes') },
                    {
                      label: 'Redirect URIs',
                      getter: (c: SsoClient) => (c.redirectUris ?? []).join(', ') || '-',
                    },
                    {
                      label: 'Groups',
                      getter: (c: SsoClient) => (c.groups?.anyOf ?? []).join(', ') || '-',
                    },
                  ]}
                  data={spec?.sso ?? []}
                />
              </SectionBox>
            ),
          },
          // --- spec: monitors config ---
          {
            id: 'uds-monitor-config',
            section: (
              <SectionBox title="Monitor Configuration (spec.monitor)">
                <SimpleTable
                  emptyMessage="None"
                  columns={[
                    { label: 'Kind', getter: (m: MonitorEntry) => m.kind ?? 'ServiceMonitor' },
                    { label: 'Port Name', getter: (m: MonitorEntry) => m.portName },
                    { label: 'Target Port', getter: (m: MonitorEntry) => String(m.targetPort) },
                    { label: 'Path', getter: (m: MonitorEntry) => m.path ?? '/metrics' },
                  ]}
                  data={spec?.monitor ?? []}
                />
              </SectionBox>
            ),
          },
          // --- spec: CA bundle presence ---
          {
            id: 'uds-cabundle',
            section: (
              <SectionBox title="CA Bundle">
                <Typography>
                  {spec?.caBundle?.configMap?.name
                    ? `From ConfigMap ${spec.caBundle.configMap.name}` +
                      (spec.caBundle.configMap.key ? ` (key ${spec.caBundle.configMap.key})` : '')
                    : 'None'}
                </Typography>
              </SectionBox>
            ),
          },
          // --- conditions ---
          {
            id: 'uds-conditions',
            section: (
              <SectionBox title="Conditions">
                <ConditionsTable resource={pkg.jsonData} />
              </SectionBox>
            ),
          },
        ];
      }}
    />
  );
}
```

**VERIFY during implementation:**

- `DetailsGrid` props (`resourceType`, `name`, `namespace`, `withEvents`, `extraInfo`, `extraSections`) and the
  `extraSections` item shape (`{ id, section }` vs bare nodes) against
  `node_modules/@kinvolk/headlamp-plugin/lib/components/common/Resource/Resource.d.ts`. `extraInfo`/`extraSections` may
  receive the item as the raw instance or `null` while loading — the `pkg &&` / `if (!pkg)` guards cover that; confirm
  the callback param type and adjust.

- `SimpleTable` column shape: confirm `{ label, getter }` vs `{ header, accessor }` / `datum` against
  `node_modules/@kinvolk/headlamp-plugin/lib/components/common/SimpleTable.d.ts`, and the `emptyMessage`/`data` prop
  names. Adjust the column objects to the installed type (they are the same across all sections, so one fix propagates).

- `ConditionsTable`'s prop name (`resource` vs `conditions`) — pass whichever the installed type wants; `pkg.jsonData`
  carries the full `status.conditions`.

- `Router.useParams` is exported from the main barrel (`Router` is in `index.d.ts:18`); if not, use `react-router-dom`'s
  `useParams` (a shared module — do not bundle it).

- The `getter` param types above (`ExposeEntry`, `AllowRule`, etc.) are the enriched `resource.ts` types; if
  `SimpleTable` types `getter` as `(row: T) => ...` off its `data` generic, these line up — otherwise cast the `data`
  array to the element type.

- [ ] **Step 2: Append the detail route in `index.ts`**

Add to the `register()` body (after the list route), and update the list route so a row click navigates to the detail
path — Headlamp's `ResourceListView` links the name column to the resource's default detail route by convention; verify
whether the custom sidebar route needs an explicit `routeName`/`getDetailsLink`. If `ResourceListView` cannot target a
custom route, add a `render` to the `name` column in `List.tsx` using `CommonComponents.Link` with
`routeName: 'uds-package-detail'` and `params: { namespace, name }`.

```ts
    registerRoute({
      path: '/uds-core/packages/:namespace/:name',
      sidebar: 'uds-packages',
      name: 'uds-package-detail',
      exact: true,
      component: () => <PackageDetail />,
    });
```

(Import `PackageDetail` at the top of `index.tsx`.)

- [ ] **Step 3: Gates**

Run: `bun run tsc && bun run lint && bun run test && bun run build` Expected: all pass.

- [ ] **Step 4: Manual smoke (document in the PR, not automated)**

If a UDS Core cluster is reachable, load the plugin and confirm: Packages list shows `status.phase` colored + counts;
clicking a row opens the detail with endpoints/SSO/conditions; an RBAC-denied user sees empty tables, not an error.

- [ ] **Step 5: Commit**

```bash
git add src/features/packages/Detail.tsx src/features/packages/index.tsx
git commit -F <commit-msg-file>
# subject: "features/packages: add Package detail view (#<issue>)"
```

______________________________________________________________________

## Self-Review (completed against the compass spec, section E.2 + Phase 2 recommendation)

- **Spec coverage:** sidebar + routes (Issue 3/4) ✅; `makeCustomResourceClass` for `packages.uds.dev` (Issue 2) ✅;
  `status.phase` StatusLabel + all count columns (Issue 3) ✅; detail sections for endpoints/SSO/conditions (Issue 4) ✅;
  RBAC-graceful empties (empty state + null-safe helpers, Issues 1/3) ✅; auto-detection (Issue 1) ✅. Workload
  exemption-annotation section is intentionally deferred to Phase 3 (see Scope).
- **Placeholder scan:** every code step contains real code; `VERIFY` notes are bounded API confirmations against named
  installed `.d.ts` files, not "figure it out later".
- **Type consistency:** `Package` / `phaseToStatus` / `StatusKind` / `useUdsDetect` / `UDS_GROUP` names are identical
  across the tasks that produce and consume them.

## Execution Handoff

Plan saved. Each Issue is an independently reviewable/mergeable unit. Recommended execution:
subagent-driven-development, one branch per issue (or one Phase 2 branch with a commit per issue). Dependency order:
**Issue 1 and Issue 2 first (no interdependency, can run in either order or parallel branches), then Issue 3, then Issue
4.**
