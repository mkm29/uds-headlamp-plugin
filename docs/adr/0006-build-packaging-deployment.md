# 6. Build, packaging, and air-gapped deployment

Date: 2026-07-10

## Status

Accepted

## Context

The `uds-core` plugin (ADR-0002) must be built as a Headlamp plugin and delivered into UDS Core clusters, which are
frequently air-gapped, regulated, and sometimes FIPS-constrained. This ADR fixes the toolchain and the delivery
mechanism.

Relevant facts:

- Headlamp plugins are scaffolded and built with the `@kinvolk/headlamp-plugin` CLI, driven by **bun** in this repo:
  `bun run build` emits `dist/main.js` + `package.json`; `bun run package` emits a `.tar.gz` with a sha256 checksum. CI
  uses `oven-sh/setup-bun` and the Dockerfile builds on an `oven/bun` image.
- React, MUI, react-redux, lodash, notistack, recharts, and iconify are **shared modules** provided by Headlamp at
  runtime. Plugins must **not** bundle them and must match Headlamp's versions.
- In-cluster, Headlamp loads plugins from its `-plugins-dir` (default `/headlamp/plugins`). Two delivery styles exist:
  the ArtifactHub-based plugin manager sidecar (needs egress; actively *removes* plugins not in its config), and an
  initContainer that copies `dist/` + `package.json` into a shared volume.
- UDS Core ships as a Zarf package / UDS Bundle. The Zarf agent mutating webhook rewrites image references to the
  in-cluster registry; images must be declared in the bundle's `images:` list to be mirrored into the air-gapped
  registry.
- The plugin bundle is static JS served to the browser. FIPS/hardening concerns apply to the **build and serving
  containers**, not to the JS bundle itself.

## Decision

**Toolchain.**

1. Scaffold and build with `@kinvolk/headlamp-plugin`; keep TypeScript strict.
1. Do **not** add shared modules (React/MUI/lodash/recharts/etc.) as bundled dependencies. Match Headlamp's versions.
1. **Pin the plugin to a specific Headlamp release line** and test against it. Headlamp ships roughly monthly; the
   plugin API is stable but grows.

**Deployment (recommended for UDS).**

1. Build a small plugin-files container image: a Node build stage produces `dist/`, then the final image contains
   `dist/` + `package.json` under `/plugins/uds-core/`.
1. In the Headlamp Helm values, add an **initContainer** that copies those files into a shared volume mounted at
   Headlamp's `pluginsDir`.
1. **Do not use the ArtifactHub plugin manager** in disconnected clusters: it requires egress and removes unmanaged
   plugins. The initContainer approach is declarative, GitOps-friendly, and version-pinnable.

**Air-gap / FIPS.**

1. Add the plugin image to the UDS Bundle / Zarf package `images:` list so it is mirrored into the air-gapped registry,
   and reference it by its registry-relative path (letting the Zarf agent rewrite it).
1. Where the build/serving container itself must be hardened, base it on a `registry1` (Iron Bank) or `unicorn` (FIPS)
   flavor image.
1. **Sign the plugin image with Sigstore-backed, keyless GitHub artifact attestations** —
   `actions/attest-build-provenance` for SLSA build provenance and `actions/attest-sbom` for an `anchore/sbom-action`
   CycloneDX SBOM, both via the workflow OIDC token and pushed to the registry (verify with `gh attestation verify`);
   see `.github/workflows/docker.yaml`. This replaced an earlier cosign step. Zarf may additionally generate an SBOM at
   bundle time.
1. Pin chart and image versions on every upgrade.

## Consequences

- **Declarative, disconnected-friendly delivery.** The initContainer + Zarf-mirror path needs no cluster egress,
  survives GitOps reconciliation, and pins exactly what runs — the right fit for UDS environments.
- **Version coupling to Headlamp.** Pinning to a Headlamp release line means a Headlamp upgrade is a deliberate, tested
  step (rebuild against the new line, re-verify shared-module versions), not an automatic one. This is intended.
- **Supply-chain posture.** Keyless GitHub artifact attestations (build-provenance + SBOM, pushed to the registry and
  verifiable with `gh attestation verify`) give the provenance and bill-of-materials that regulated UDS deployments
  require; these become part of the release checklist. The build/push + signing workflow runs only on a version tag
  (`v*`).
- **No bundled shared modules.** Keeping React/MUI/etc. external avoids duplicate- React and version-skew bugs, at the
  cost of a build that will fail loudly if a shared module is imported as a dependency — an acceptable guardrail.
- **Operational cost.** Every release produces an image to build, sign, mirror, and pin. This is heavier than "drop a
  tarball," but is the price of auditable air-gapped delivery and is amortized by the single-plugin choice in ADR-0002
  (one image, not N).
- **FIPS scope clarified.** Because the bundle is browser-served static JS, we do not chase FIPS compliance in the
  plugin code itself — only in the containers that build and serve it — preventing wasted effort.
