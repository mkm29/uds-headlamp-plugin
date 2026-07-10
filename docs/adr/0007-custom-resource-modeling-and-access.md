# 7. Custom resource modeling and access

Date: 2026-07-10

## Status

Accepted

## Context

Phase 2 and 3 features surface UDS Core CRDs (`packages.uds.dev`, `exemptions.uds.dev`, and later
`clusterconfig.uds.dev`) as Headlamp views. Each feature needs a consistent way to (a) obtain a Headlamp resource class
for a CRD, (b) describe its `spec`/`status` in TypeScript, and (c) read those fields safely in list/detail components.
This ADR fixes that pattern so every current and future CR feature does it the same way.

Constraints and facts that shape the decision:

- Headlamp provides `makeCustomResourceClass({ apiInfo, kind, pluralName, singularName, isNamespaced })` (used by the
  Flux, Longhorn, and Karpenter plugins). It returns a `KubeObjectClass`, which upstream is `typeof KubeObject<any>` —
  so instances are **loosely typed**: `jsonData` is `any` and the `.spec`/`.status` getters are not parameterized by our
  schema.
- **Deep-import landmine** (ADR-0002/0003; `src/common/cluster.ts:17-25`): the `@kinvolk/headlamp-plugin` build
  externalizes the main `/lib` barrel to a runtime global. Deep submodule paths such as
  `@kinvolk/headlamp-plugin/lib/lib/k8s/crd` are **not** in the externals map and resolve to `undefined` in the deployed
  app, crashing the whole plugin on load. `makeCustomResourceClass` is **not** on the main barrel; it is re-exported
  from the top-level `@kinvolk/headlamp-plugin/lib/Crd` module.
- UDS ships no generated TypeScript types for its CRDs. The authoritative schema is the deployed CRD's
  `openAPIV3Schema`, readable with `kubectl explain <crd> --recursive`.
- `@kinvolk/headlamp-plugin@0.14.0`'s `/lib/Crd` module has an upstream circular-import ordering bug that crashes the
  **Vitest** runner when imported in a test (`Class extends value undefined`). It loads fine in the real Headlamp app
  because the host externalizes the module at build time.

## Decision

1. **Obtain each CR class via `makeCustomResourceClass`, imported only from `@kinvolk/headlamp-plugin/lib/Crd`** (the
   top-level re-export) — never a deep `/lib/lib/k8s/...` path. `bun run build` is the gate that proves the specifier
   externalizes correctly (`pluginLib.Crd.makeCustomResourceClass`) rather than inlining/crashing.

1. **Model `spec`/`status` as hand-maintained TypeScript interfaces**, transcribed field-by-field from the deployed
   CRD's `openAPIV3Schema` (via `kubectl explain <crd> --recursive`). Keep enums, and required-vs-optional, faithful to
   the schema. Do not invent fields. Re-verify against the exact UDS Core version on each upgrade.

1. **Expose small typed accessors instead of subclassing.** Because instances are `KubeObject<any>`, each feature's
   `resource.ts` exports accessors — e.g. `packageStatus(pkg)` / `packageSpec(pkg)` / `exemptionSpec(ex)` — that read
   `jsonData?.status` / `jsonData?.spec` and cast to the interface. Consumers use the accessors so there is **no `any`
   at call sites**. We do not build a `KubeObject` subclass with typed getters.

1. **Colocate pure logic with the CR class and unit-test it with the `/lib/Crd` import mocked.** Pure, decision-bearing
   helpers (status→color mapping, counts, distinct-policy union) live in the same `resource.ts` and are tested with
   `vi.mock('@kinvolk/headlamp-plugin/lib/Crd', ...)` to dodge the upstream Vitest crash. The mock only satisfies the
   import; it never stubs the logic under test.

1. **One `resource.ts` per feature folder** (ADR-0003), exporting the class, the interfaces, the accessors, and the pure
   helpers.

## Consequences

- **Type safety without codegen.** List/detail code gets autocomplete and compile-time checks with no extra build
  tooling. The cost is that the interfaces are hand-maintained and can drift from the CRD across UDS versions; we
  mitigate by transcribing from the live schema and citing the source, and by re-verifying on upgrade.
- **The accessor cast is a documentation-grade guarantee, not compiler-enforced.** `jsonData` is `any` upstream, so the
  cast is unchecked at runtime. This is acceptable because reads are display-only and every accessor is null-safe
  (RBAC-limited or partially-populated resources render empty, never crash).
- **Import discipline is load-bearing.** `/lib/Crd` only; a wrong specifier crashes the deployed plugin. `bun run build`
  must pass and load, and is the required gate for any task that adds a CR class.
- **The test workaround is contained.** Colocating pure helpers with the CR class forces a `vi.mock` in that file's
  test. We accept one mock per resource test to keep a single file per resource; if the mock proliferates, split the
  pure helpers into a `/lib/Crd`-free module and revisit.
- **Alternatives considered and rejected:** a `KubeObject` subclass with typed getters (more code, brittle against the
  upstream generic types); the deprecated tuple overload of `makeCustomResourceClass`; generating types from the CRD (no
  upstream generator, adds tooling for marginal benefit over transcription).

## References

- ADR-0003 (project directory structure — the per-feature `resource.ts` home).
- ADR-0008 (how these accessors are consumed by list/detail views).
