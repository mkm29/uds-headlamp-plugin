# 8. UDS Core navigation and per-feature CR views

Date: 2026-07-10

## Status

Accepted

## Context

Multiple UDS CR features (Packages, Exemptions, and later ClusterConfig and the Pepr policy catalog) each need a place
in Headlamp's sidebar and a list/detail screen. They share one top-level "UDS Core" section. ADR-0004 fixed *when*
registration happens (one-shot at load, gate visibility with filters/guards) but not the *navigation structure* or the
list/detail rendering convention. This ADR fixes those so features compose without stepping on each other.

Facts about the Headlamp APIs that constrain the choice:

- `registerSidebarEntry({ parent, name, label, url, icon })` stores entries in a Redux map **keyed by `name`**
  (`state.entries[name] = payload`). Re-registering the same `name` is therefore **idempotent** — last write wins, no
  duplicate.
- `registerSidebarEntryFilter(fn)` **accumulates** filters in an array; an entry is dropped if **any** filter returns
  `null`. A filter is a plain function and **cannot call React hooks**.
- `registerRoute({ path, sidebar, name, exact, component })` mounts a route; `ResourceListView` (bound to a resource
  class) and `DetailsGrid` (with `extraInfo`/`extraSections`) give RBAC-graceful list/detail views for free.
- UDS detection (`useUdsDetect`) is a hook, so it can gate *component content* but not a sidebar *filter*.

## Decision

1. **One shared "UDS Core" parent, owned by a single module.** The parent sidebar entry (`name: 'uds-core'`) and all
   sidebar filters are registered centrally by `src/common/udsSidebar.ts`. Each feature calls its
   `registerUdsCoreChild({ featureId, name, label, url, icon })`, which registers the parent exactly once (guarded by a
   `parentRegistered` flag, so the first caller wins — deterministic, not last-write-wins) and registers the feature's
   own child under `parent: 'uds-core'` (e.g. `uds-packages`, `uds-exemptions`). Features no longer call
   `registerSidebarEntry` themselves.

1. **Each feature owns a list route and a detail route.** `/uds-core/<feature>` renders a `ResourceListView` bound to
   the feature's CR class; `/uds-core/<feature>/:namespace/:name` renders a `DetailsGrid` whose `extraInfo`/
   `extraSections` present the resource. List columns and detail sections read the typed accessors from ADR-0007.

1. **The shared owner registers all sidebar filters; no feature gates the shared parent.** `registerUdsCoreChild`
   installs a per-child filter that hides only that child when its feature is disabled, plus one aggregate parent filter
   that hides `uds-core` **only when no child feature is enabled** (`anyFeatureEnabled` over the registered child ids —
   a pure helper in `settings/flags.ts`). Filters accumulate, so a per-feature filter gating the shared parent would
   hide the entire tree whenever that one feature is disabled — which is exactly why parent gating lives in the shared
   owner rather than in any feature.

1. **Detection gates content, the enable flag gates the sidebar.** Because a sidebar filter cannot call `useUdsDetect`,
   the sidebar entry is gated on the per-cluster enable flag only (read synchronously via `store.get()`), while the
   **list** components call `useUdsDetect()` and render an empty "UDS Core not detected" state. (The detail components
   currently render `DetailsGrid` unconditionally — a directly-addressed detail URL does not yet show the not-detected
   state; a documented gap.) Structural sidebar changes still take effect on reload (ADR-0004).

## Consequences

- **Cohesive, composable UDS Core section.** Adding a feature is: call `registerUdsCoreChild(...)` and register its two
  routes. The shared owner handles the parent and all sidebar filtering; the list/detail UX and RBAC-graceful empties
  come from Headlamp's shared components.
- **Parent visibility is feature-agnostic.** No feature gates the shared parent. An early Packages implementation
  initially gated `uds-core` in its own filter (which hid the whole tree when Packages was disabled); this was fixed in
  issue #18 by moving parent registration and the aggregate "hide only when no UDS feature is enabled" filter into the
  shared owner (`src/common/udsSidebar.ts`).
- **Parent `url`/`icon`/`label` are deterministic.** The shared owner registers the parent once (first caller wins via
  the `parentRegistered` guard), with a fixed label/icon and the first-registered child's url — so the parent no longer
  depends on feature load order (previously last-write-wins across all features).
- **Sidebar-hide on *undetected* UDS Core is deferred.** A filter cannot read the detection hook, so an enabled feature
  whose CRDs are absent still shows its sidebar entry; the content-level empty state covers the UX. A non-hook detection
  cache that also hides the entry is a later refinement.
- **Consistency across features is enforced by convention, not the type system.** The pattern (`registerUdsCoreChild`
  - list route + detail route) is documented here and mirrored between Packages and Exemptions; reviewers check new
    features against it.

## References

- ADR-0004 (one-shot registration; gate visibility with filters/guards).
- ADR-0007 (the typed CR accessors consumed by these list/detail views).
- Issue #18 (make the shared parent's visibility feature-agnostic) — **implemented** in `src/common/udsSidebar.ts`.
