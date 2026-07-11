# 5. Settings persistence via ConfigStore and the Prometheus settings pattern

Date: 2026-07-10

## Status

Accepted

## Context

ADR-0004 established that feature flags gate visibility and that a single `ConfigStore<UdsFlags>('uds-core')` holds
configuration. This ADR fixes the concrete persistence and settings-UI mechanism — the parts a user actually touches —
and the constraints they impose.

Facts about the Headlamp settings API that constrain the choice:

- `registerPluginSettings(name, component, displaySaveButton?)` registers one React component per plugin, surfaced at
  `/settings/plugins/<name>`.
- The component receives `{ data, onDataChange }`. `data` is the current settings object; `onDataChange(newData)`
  updates it. With `displaySaveButton=true`, Headlamp shows a Save button and persists on click; with `false`, the
  plugin auto-saves on every change.
- Persistence is via `ConfigStore`, stored **client-side** — browser local storage in the in-cluster/web deployment. It
  is therefore per-user, per-browser, and cluster-scopeable by keying config by cluster name.
- The built-in Prometheus plugin is the reference implementation of this pattern. Its settings panel exposes an Enable
  toggle, an Auto-detect toggle, a validated service-address text input (`namespace/service-name:port`, with an inline
  error on bad format), a service-subpath input, default timespan/resolution selects, and a Test Connection button — all
  cluster-scoped. It shares its config hook across components with the `use-between` library to avoid prop drilling.

We want the same shape so operators get a familiar experience, and we want a single source of defaults so a fresh
browser behaves sensibly.

## Decision

We persist all plugin configuration through the single `ConfigStore<UdsFlags>('uds-core')` from ADR-0004, and we mirror
the Prometheus settings pattern for the UI.

Persistence rules:

1. **One store, cluster-keyed.** All settings live under the `uds-core` config object; per-cluster values are nested
   under `clusters[<name>]` so each cluster carries its own feature toggles and endpoints.
1. **Explicit Save.** Register with `displaySaveButton=true`. Structural settings (which features are on) take effect on
   the next reload per ADR-0004, so an explicit Save matches the mental model better than silent auto-save.
1. **Defaults live in code, not storage.** Reads always fall back to a feature's `defaultEnabled` / documented default
   (`autoDetect=true`) when a key is absent. Empty storage must yield a working, sensible configuration; we never depend
   on a value having been written.

Settings UI (mirroring Prometheus):

1. An **Auto-detect UDS Core** toggle.
1. A **cluster selector**; edits apply to the selected cluster's sub-object.
1. A **per-feature enable toggle** generated from the `FEATURES` manifest, so the settings page never drifts from the
   registered feature set.
1. Feature-specific inputs (e.g. a UDS operator namespace field, the namespace scoper's verb/resource probe) and a
   **Test / Detect UDS Core** button intended to run the detection routine and report which `uds.dev` CRDs and the Pepr
   webhook were found. (Current state: the button is a scaffold no-op; the panel instead reports detection reactively
   from the `useUdsDetect()` hook. Wiring the button to an explicit probe + CRD/webhook report is pending.)

Cross-component config access uses the `useUdsConfig` hook from the store. If prop drilling becomes a problem we may
adopt `use-between` (as Prometheus does) to share the hook; we do not add it pre-emptively.

## Consequences

- **Familiar UX.** Operators who know the Prometheus settings page find the same controls (Enable, Auto-detect, cluster
  scope, Test), lowering the learning curve.
- **Per-user, per-browser reality.** Because `ConfigStore` persists to local storage, settings do **not** propagate
  across users, browsers, or devices. There is no cluster-sourced plugin config upstream yet. For fleet-wide behavior we
  rely on in-code defaults and, where needed, a pre-seeded config shipped with the deployment. This is a known Headlamp
  limitation, not a plugin bug.
- **Manifest-driven settings.** Generating per-feature toggles from `FEATURES` keeps the settings page and the
  registered features in lockstep; adding a feature (ADR-0003) surfaces its toggle automatically.
- **Save semantics.** Explicit Save means a user can edit and discard by navigating away; it also means "why didn't my
  toggle apply" is answered by "click Save, then reload," consistent with ADR-0004.
- **Unverified specifics carried forward.** The `ConfigStore` / `registerPluginSettings` contract and the settings-field
  inventory are confirmed; the Prometheus plugin's exact internal config key names and the release that introduced its
  subpath field were not verifiable from source, so our key names are our own design.
