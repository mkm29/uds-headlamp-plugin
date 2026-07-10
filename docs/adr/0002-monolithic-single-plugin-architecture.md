# 2. Monolithic single-plugin architecture

Date: 2026-07-10

## Status

Accepted

## Context

UDS Core exposes several distinct surfaces we want to represent in Headlamp:
namespace RBAC scoping, the `Packages` CR, the `Exemptions` CR, the
`ClusterConfig` singleton, and the Pepr policy engine status. There are two broad
ways to structure this:

1. **Multiple independent plugins** — one Headlamp plugin per feature
   (`uds-packages`, `uds-exemptions`, …), each packaged, versioned, and deployed
   separately.
1. **One monolithic plugin** (`uds-core`) that contains all features and toggles
   them internally.

Relevant facts about the Headlamp plugin model that constrain the choice:

- Headlamp calls each plugin's registration code **once, synchronously** at
  frontend load. There is no dynamic re-registration when settings change.
- Plugin settings are registered per-plugin via
  `registerPluginSettings(name, Component, displaySaveButton)` and surface at
  `/settings/plugins/<name>`. Each plugin gets one settings page.
- Persistence uses the `ConfigStore` class keyed by plugin name; config is stored
  client-side (browser local storage in the in-cluster/web deployment).
- Deployment into UDS clusters is via an initContainer that copies `dist/` +
  `package.json` into Headlamp's plugins dir, and the image is mirrored through a
  Zarf/UDS Bundle. Every additional plugin multiplies packaging, versioning, and
  mirroring work.

We also want a single, coherent "UDS Core" settings experience (a cluster
selector plus per-feature enable toggles and an Auto-detect switch), mirroring the
built-in Prometheus plugin's settings pattern. Multiple plugins would fragment
this into N disconnected settings pages.

## Decision

We will build **one monolithic npm package named `uds-core`**. All UDS Core
features live inside it and are gated internally by feature flags rather than by
installing/uninstalling separate plugins.

- A single `registerPluginSettings('uds-core', Settings, true)` provides one
  unified settings page with a cluster selector and per-feature toggles.
- A single `ConfigStore<UdsFlags>('uds-core')` holds all configuration, including
  per-cluster, per-feature enablement.
- A single container image and initContainer deploy the whole plugin; there is one
  version to pin, mirror, and sign per release.

The "feature flag" semantics and directory layout that make this tractable are
specified in ADR-0004 and ADR-0003 respectively.

## Consequences

- **Simpler operations:** one build artifact, one image, one Zarf entry, one
  version to pin per Headlamp release line — a meaningful win in air-gapped
  delivery.
- **Unified UX:** a single settings page and consistent "UDS Core" sidebar tree;
  cross-feature concerns (e.g. the namespace scoper feeding "show only namespaces
  I can access" into the Packages list) can share code without cross-plugin
  coupling.
- **Coupled release cadence:** a change to any one feature ships a new version of
  the whole plugin. Features cannot be independently versioned or rolled back.
  This is acceptable given the features share a domain (UDS Core) and a lifecycle.
- **All-or-nothing footprint:** operators who want only one feature still deploy
  the whole bundle. We mitigate this with feature flags (ADR-0004) so unused
  features are hidden, not removed. Because registration is one-shot, a disabled
  feature still executes its `register()` call — the flag gates *visibility*, not
  the registration event.
- **Bundle size:** all features are in one JS bundle. This is acceptable for the
  current feature count; if the bundle grows large enough to matter, code-splitting
  within the single plugin is the escape hatch, not splitting into multiple plugins.
