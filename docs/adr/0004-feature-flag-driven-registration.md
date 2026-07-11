# 4. Feature-flag-driven conditional registration

Date: 2026-07-10

## Status

Accepted

## Context

ADR-0002 chose a monolith and ADR-0003 fixed its layout around a central feature manifest. This ADR resolves the
mechanism that makes a monolith with independently toggleable features actually work, given a hard constraint of the
Headlamp plugin model:

> Headlamp calls each plugin's registration code **once, synchronously**, during frontend initialization. There is **no
> dynamic re-registration** when a user changes a setting.

This means we cannot "unregister" a feature by toggling a flag at runtime. The built-in Prometheus plugin faces the same
constraint and handles it by gating *visibility* rather than *registration*: its consumer components read the
`ConfigStore` reactively so charts appear/disappear live, while structural changes take effect on the next reload.

We also need per-cluster configuration (a different set of enabled features, and different service endpoints, per
cluster), mirroring how Prometheus scopes its settings per cluster.

## Decision

Features are gated by flags stored in a `ConfigStore`, and gating controls **visibility and rendering**, never the
one-shot registration event.

**Configuration store.** A single typed store, keyed per cluster:

```ts
import { ConfigStore } from '@kinvolk/headlamp-plugin/lib';

export interface UdsFlags {
  autoDetect: boolean;
  clusters: {
    [cluster: string]: {
      features: { [featureId: string]: boolean };
      serviceAddress?: string;
    };
  };
}
export const store = new ConfigStore<UdsFlags>('uds-core');
export const useUdsConfig = store.useConfig();
export function isFeatureEnabled(cfg, cluster, id, dflt) {
  return cfg?.clusters?.[cluster]?.features?.[id] ?? dflt;
}
```

The implementation factors the per-cluster object into a `ClusterFlags` interface (which also carries an optional
`scoper` probe config) and puts these types, `DEFAULT_FLAGS`, and the pure helpers in `settings/flags.ts` — no Headlamp
imports, so they are unit-tested in isolation. `settings/config.ts` holds only the `ConfigStore` instance and the
`useUdsConfig` hook.

**Feature contract.** Each feature declares its identity and default, and exposes a `register()`:

```ts
export interface Feature {
  id: string;
  title: string;
  defaultEnabled: boolean;
  requiresUds?: boolean;              // gate on UDS Core detection
  register: (ctx: { enabled: boolean }) => void;
}
```

**Entry point.** `index.tsx` reads a synchronous snapshot once and registers every feature; each feature decides what to
register:

```ts
registerPluginSettings('uds-core', Settings, true);
const cfg = store.get();
for (const f of FEATURES) {
  const enabled = isFeatureEnabled(cfg, currentCluster(), f.id, f.defaultEnabled);
  f.register({ enabled });
}
```

**Gating mechanism (the important part).** Because registration is one-shot, each feature registers its sidebar entries
and routes **unconditionally** but pairs them with live filters and in-component guards that read the current config:

- `registerSidebarEntryFilter` runs on every render and returns `null` to hide a sidebar entry when its flag is off, and
  `registerRouteFilter` does the same for the feature's routes (matched by `route.sidebar`) so a disabled feature's page
  is not reachable by direct URL. The shared `udsSidebar.ts` owner installs both filters for the UDS Core tree
  (ADR-0008; issue #26).
- Live per-flag content gating via `useUdsConfig()` is the intended mechanism for hiding content without a reload; today
  the list components gate on `useUdsDetect()` (CRD presence) instead, and `useUdsConfig` is exported but not yet
  consumed.

Toggling a flag therefore hides content instantly where a live filter/guard covers it, and takes full structural effect
on the next page reload — matching upstream Prometheus behavior.

## Consequences

- **Live where it can be, reload where it must be.** Sidebar/route filters and component guards give instant hide/show;
  brand-new structural sidebar trees may only appear after a reload. We set this expectation explicitly rather than
  fighting the platform.
- **Per-cluster config out of the box.** Operators can enable different features and endpoints per cluster; defaults
  come from each feature's `defaultEnabled`.
- **Graceful degradation under RBAC.** Detection reads are impersonated (via the OpenUnison proxy), so a user lacking
  permissions gets "unknown," which we treat as "hide," with the manual toggle able to override.
- **Client-side persistence caveat.** `ConfigStore` persists to browser local storage in web mode — settings are
  per-user, per-browser, not fleet-wide. For shared defaults we bake them into feature `defaultEnabled` and/or ship a
  pre-seeded config; this limitation is inherited from Headlamp and tracked upstream.
- **Discipline required.** Every feature must register unconditionally *and* add a matching live filter/guard. A feature
  that registers conditionally on the snapshot would become permanently invisible until reload after a toggle — the
  anti-pattern this ADR exists to prevent.
- **`requiresUds` is declared but not yet consumed.** The `Feature.requiresUds` flag is set on the CR features but no
  registration/filtering code reads it yet; detection-based hiding currently happens only via `useUdsDetect()` inside
  list components. Wiring `requiresUds` into the sidebar/route gating is a documented gap.
- **Unverified specifics.** The `ConfigStore` / `registerPluginSettings` API contract is normative here; exact
  Prometheus-plugin config key names were not verifiable from source and are treated as our own design, not copied
  identifiers.
