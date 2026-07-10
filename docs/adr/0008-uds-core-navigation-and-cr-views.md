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

1. **One shared "UDS Core" parent, collectively owned.** A single parent sidebar entry (`name: 'uds-core'`) is
   registered by whichever feature loads; because entries are keyed by `name`, every feature may register it and the
   result is idempotent. Each feature registers its own child under `parent: 'uds-core'` (e.g. `uds-packages`,
   `uds-exemptions`).

1. **Each feature owns a list route and a detail route.** `/uds-core/<feature>` renders a `ResourceListView` bound to
   the feature's CR class; `/uds-core/<feature>/:namespace/:name` renders a `DetailsGrid` whose `extraInfo`/
   `extraSections` present the resource. List columns and detail sections read the typed accessors from ADR-0007.

1. **A feature's sidebar filter gates ONLY its own child** — `entry.name === '<own-child>' && !enabled ? null : entry`.
   A feature must never gate the shared `uds-core` parent: filters accumulate, so gating the shared parent from one
   feature would hide the entire tree (and every other feature under it) whenever that one feature is disabled.

1. **Detection gates content, the enable flag gates the sidebar.** Because a sidebar filter cannot call `useUdsDetect`,
   the sidebar entry is gated on the per-cluster enable flag only (read synchronously via `store.get()`), while the
   list/detail **components** call `useUdsDetect()` and render an empty "UDS Core not detected" state. Structural
   sidebar changes still take effect on reload (ADR-0004).

## Consequences

- **Cohesive, composable UDS Core section.** Adding a feature is: register its child, its two routes, and an
  own-child-only filter. The list/detail UX and RBAC-graceful empties come from Headlamp's shared components.
- **Parent visibility must be feature-agnostic.** This ADR sets the rule (no feature gates the shared parent), but the
  first implementation (Packages) initially gated `uds-core` in its own filter, which would hide the whole tree when
  Packages is disabled. Issue #18 tracks aligning the code — moving the parent's registration and its "hide only when no
  UDS feature is enabled" filter into a shared owner (`src/common/udsSidebar.ts`).
- **Parent `url`/`icon`/`label` are last-write-wins** across features (keyed by name). Keep them identical across
  features, or centralize the parent registration (again, #18), so the parent is deterministic regardless of feature
  load order.
- **Sidebar-hide on *undetected* UDS Core is deferred.** A filter cannot read the detection hook, so an enabled feature
  whose CRDs are absent still shows its sidebar entry; the content-level empty state covers the UX. A non-hook detection
  cache that also hides the entry is a later refinement.
- **Consistency across features is enforced by convention, not the type system.** The pattern (child + list route +
  detail route + own-child filter) is documented here and mirrored between Packages and Exemptions; reviewers check new
  features against it.

## References

- ADR-0004 (one-shot registration; gate visibility with filters/guards).
- ADR-0007 (the typed CR accessors consumed by these list/detail views).
- Issue #18 (make the shared parent's visibility feature-agnostic).
