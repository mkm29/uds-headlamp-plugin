# 3. Project directory structure and feature-module layout

Date: 2026-07-10

## Status

Accepted

## Context

ADR-0002 commits us to a single `uds-core` plugin containing multiple features. Without a disciplined internal layout, a
monolith degrades into a tangle where `index.tsx` imports feature internals directly, features run side effects at
import time, and shared code has no obvious home. We want a structure where:

- Each feature is self-contained and discoverable in one folder.
- The plugin entry point (`index.tsx`) has no knowledge of feature internals — it only iterates a manifest.
- Nothing registers with Headlamp as an import side effect; registration happens only inside an explicit `register()`
  call the entry point drives (this keeps the one-shot registration event in ADR-0002 predictable and testable).
- Cross-cutting helpers (UDS detection, cluster resolution, the shared UDS Core sidebar owner) have a single home so
  features don't duplicate them. Custom Resource classes, by contrast, live per feature (ADR-0007).

Headlamp-specific facts that shape the layout:

- The entry module is `src/index.tsx`; the build emits `dist/main.js` + `package.json`.
- Custom resources use `makeCustomResourceClass` from `@kinvolk/headlamp-plugin/lib/Crd` (a top-level re-export; deep
  submodule paths crash the plugin — see ADR-0007). Although `Packages`, `Exemptions`, and `ClusterConfig` share the
  `uds.dev` group, each feature owns its own `resource.ts` (ADR-0007) rather than a shared CR-class module.
- Settings are one component registered via `registerPluginSettings`, backed by a `ConfigStore` wrapper (see ADR-0004).

## Decision

We adopt the following layout, with a central feature manifest as the single source of truth:

```
uds-core-headlamp-plugin/
├── package.json                 # name: uds-core; version pinned to a Headlamp release line
├── tsconfig.json
├── src/
│   ├── index.tsx                # entry: reads flags, iterates manifest, calls feature.register()
│   ├── settings/
│   │   ├── Settings.tsx         # registerPluginSettings component
│   │   ├── flags.ts             # UdsFlags/ClusterFlags types, defaults, pure helpers (no Headlamp deps)
│   │   └── config.ts            # the ConfigStore instance + useUdsConfig hook
│   ├── features/
│   │   ├── manifest.ts          # FEATURES: Feature[] — the single source of truth
│   │   ├── types.ts             # Feature interface
│   │   ├── namespaceScoper/     # (1) RBAC namespace scoping (SSAR/SSRR)
│   │   ├── packages/            # (2) UDS Packages CR
│   │   ├── exemptions/          # (3) Exemptions CR
│   │   ├── clusterConfig/       # (4) ClusterConfig CR
│   │   └── policyEngine/        # (5) Pepr policy status
│   ├── common/
│   │   ├── cluster.ts           # current-cluster resolution (URL-parsed)
│   │   ├── udsDetect.ts         # UDS Core CRD detection hook
│   │   └── udsSidebar.ts        # shared UDS Core sidebar owner (ADR-0008)
│   └── i18n/
└── README.md
```

The governing principles are:

1. **Each feature is a folder** exporting a `register(ctx)` function and a settings descriptor; it owns its
   `resource.ts`, `List.tsx`, `Detail.tsx`, etc.
1. **`index.tsx` only knows the manifest.** It imports `FEATURES` and the settings component, and nothing else from
   inside `features/`.
1. **Each feature owns its CR class** in its own `resource.ts` (ADR-0007). Only *cross-cutting* helpers — UDS detection,
   cluster resolution, and the shared sidebar owner — live in `common/`, not duplicated per feature.
1. **No import-time side effects.** Registration runs only inside `register()`.

## Consequences

- Adding a feature is a bounded operation: create a folder that exports the `Feature` contract and add one line to
  `manifest.ts`. Reviewers see the whole feature in one place.
- The entry point stays thin and stable; changes to a feature rarely touch `index.tsx`, reducing merge conflicts on the
  hot file.
- The `common/` boundary must be actively maintained — cross-cutting helpers (detection, cluster resolution, the shared
  sidebar owner) belong there, while CR classes stay per-feature (ADR-0007). Code review enforces this; there is no
  compiler-level guard.
- The layout assumes the `Feature` interface and the ConfigStore-backed flag model from ADR-0004. This ADR fixes *where*
  code lives; ADR-0004 fixes *how* features are gated.
- The directory names above are illustrative of intent, not a frozen contract; the principles (self-contained features,
  thin entry, shared `common/`, no import side effects) are what this ADR commits us to.
