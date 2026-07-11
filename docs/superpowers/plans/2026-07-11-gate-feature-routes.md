# Gate feature routes on the enable flag (#26) — Implementation Plan

**Goal:** When a UDS Core feature is disabled for the current cluster, its route (list + detail) must not render — not
just its sidebar entry. Today routes are registered unconditionally, so a hidden feature's page is still reachable by
direct URL (`/uds-core/<feature>` / `.../:namespace/:name`).

**Architecture:** Extend the shared sidebar owner (`src/common/udsSidebar.ts`, ADR-0008) — the module that already owns
all sidebar filtering — to also install a `registerRouteFilter`. Route filtering stays centralized; features keep
calling only `registerUdsCoreChild(...)` and `registerRoute(...)`.

## Key facts (verified)

- `registerRouteFilter(filterFunc: (entry: Route) => Route | null)` — exported from the main barrel; returning `null`
  hides the route (`node_modules/@kinvolk/headlamp-plugin/lib/plugin/registry.d.ts:163`).
- Every feature registers its routes with `sidebar: '<child-name>'` (e.g. `'uds-packages'`), so `route.sidebar` (a
  `string` for our routes; `Route.sidebar` is `string | null | {…}`) identifies which feature a route belongs to — no
  need to enumerate route names.

## Task

**File:** `src/common/udsSidebar.ts` (modify); `docs/adr/0004-feature-flag-driven-registration.md` (update the "known
gap" note now that route gating is wired).

- [ ] **Step 1 — add the route filter** in `registerUdsCoreChild`, alongside the existing per-child sidebar filter:

```ts
import { registerRoute... , registerRouteFilter, ... } from '@kinvolk/headlamp-plugin/lib';
// ...
  // Gate this feature's routes on its enable flag too, so a disabled feature's
  // page is not reachable by direct URL (matches the hidden sidebar entry).
  registerRouteFilter(route =>
    route.sidebar === opts.name &&
    !isFeatureEnabled(store.get() ?? DEFAULT_FLAGS, liveCluster(), opts.featureId, true)
      ? null
      : route
  );
```

Same predicate as the per-child sidebar filter (`isFeatureEnabled` + `liveCluster`), matched by `route.sidebar`.

- [ ] **Step 2 — gates:** `bun run tsc && bun run lint && bun run test && bun run build` all pass. `build` proves the
  new barrel import + filter registration load.

- [ ] **Step 3 — ADR-0004:** update the "Route-level filtering (`registerRouteFilter`) is not currently wired … a known
  gap" bullet to state routes are now gated by the shared owner via `route.sidebar`.

- [ ] **Step 4 — commit** (`common/udsSidebar: gate feature routes on the enable flag (#26)`).

## Notes

- Scope is the **enable flag** only (the bug in #26). Detection-based route gating (`requiresUds`) is #27, separate.
- No new unit test: this reuses the tested `isFeatureEnabled`; `udsSidebar.ts` is thin glue over the barrel (broader
  coverage of it is tracked in #33). The `build` gate is the verification that the route filter registers.
