# Designing a Feature-Flag-Driven Monolithic Headlamp Plugin for UDS Core

## TL;DR
- Build one monolithic plugin (`uds-core`) whose `src/index.tsx` reads a per-cluster `ConfigStore` of feature flags at load time and conditionally calls Headlamp's `register*` functions; mirror the built-in Prometheus plugin's settings pattern (Enable toggle, Auto-detect toggle, cluster selector, text/select inputs, Test Connection button) via `registerPluginSettings('uds-core', Settings, true)`.
- Headlamp registration is a one-time synchronous event at page load, so feature flags gate whether a feature is *rendered/visible* (via `registerSidebarEntryFilter`, route filters, and in-component guards reading `ConfigStore.useConfig()`); changing a flag takes effect on the next reload, exactly as the Prometheus plugin behaves.
- All plugin K8s calls flow through Headlamp's backend proxy, so they automatically inherit OpenUnison's injected impersonation headers — meaning your existing `SelfSubjectAccessReview → allowedNamespaces` scoper works unchanged and generalizes cleanly to `SelfSubjectRulesReview` for permission-aware UI.

## Key Findings

### The Headlamp plugin model
Headlamp plugins are JavaScript/TypeScript + React modules that import registration functions from `@kinvolk/headlamp-plugin/lib`. React, MUI (`@mui/material`/`@material-ui`), react-redux, lodash, notistack, recharts and iconify are **shared modules** provided by Headlamp at runtime — plugins must not bundle them and must match versions. The registry functions available include `registerSidebarEntry`, `registerSidebarEntryFilter`, `registerRoute`, `registerRouteFilter`, `registerDetailsViewSection`, `registerDetailsViewSectionsProcessor`, `registerResourceTableColumnsProcessor`, `registerAppBarAction`, `registerDetailsViewHeaderAction`, `registerKindIcon`, `registerPluginSettings`, and more.

### Plugin settings API (the Prometheus pattern)
`registerPluginSettings(name: string, component: PluginSettingsComponentType, displaySaveButton?: boolean)` registers a React component that appears at `/settings/plugins/<name>`. The component receives `{ data, onDataChange }` props; `data` is the current settings object and `onDataChange(newData)` updates it. With `displaySaveButton=true`, Headlamp shows a Save button and persists on click; with `false`, the plugin auto-saves.

Persistence and runtime reads use the `ConfigStore` class from `@kinvolk/headlamp-plugin/lib`:
```ts
import { ConfigStore } from '@kinvolk/headlamp-plugin/lib';
const store = new ConfigStore<{ logoURL: string }>('change-logo');
const useConf = store.useConfig();
const config = useConf();   // reactive hook usable in any component
```
Settings are stored client-side (browser local storage in the in-cluster/web deployment). The Prometheus plugin additionally uses the `use-between` library (its only production dependency, `use-between@^1.3.5`) to share the config hook across its Settings and Chart components without prop drilling.

The Prometheus Settings panel (visible at Settings > Plugins > Prometheus) exposes: an **Enable metrics** toggle, an **Auto-detect** toggle, a **Prometheus Service Address** text input validated against the format `namespace/service-name:port` — entering an unsupported value (such as a sub-path address) "displays an error below the field: Invalid format. Use: namespace/service-name:port" (headlamp-k8s/plugins Issue #120; kubernetes-sigs/headlamp Issue #2607) — a **Prometheus service subpath** input for sub-path query services (VictoriaMetrics' official guide notes "only for the cluster version, you must fill in the following path in Prometheus service subpath, where 0 is the default Tenant ID"), default timespan/resolution selects, and a **Test Connection** button. Settings are cluster-scoped, allowing a different Prometheus endpoint per cluster.

> Verification note: I confirmed the settings UI fields and the ConfigStore/use-between mechanism from the Headlamp docs, the VictoriaMetrics guide, and the plugins DeepWiki, but I could not retrieve the Prometheus plugin's exact TypeScript config property names (e.g. whether the enable flag is literally `isMetricsEnabled`) from source because GitHub blob/raw fetches were blocked. The code sketches below use self-descriptive key names you control in your own plugin; only the ConfigStore/registerPluginSettings API contract is normative.

### Registration timing and feature flags
Headlamp calls each plugin's registration code once, synchronously, during frontend initialization. There is **no dynamic re-registration** when a user changes a setting — the Prometheus plugin handles this by having its consumer components read the ConfigStore reactively (so charts appear/disappear live) and by gating *visibility* rather than *registration*. Sidebar entries and routes that should be hidden when a feature is off are best controlled with `registerSidebarEntryFilter` and `registerRouteFilter`, which run on every render and can return `null` to hide an entry. Structural changes (adding a brand-new sidebar tree) generally require a page reload to appear — this is acceptable and matches upstream behavior.

### CRD access
Custom resources are queried with `makeCustomResourceClass` from `@kinvolk/headlamp-plugin/lib/K8s/crd` (used by the Longhorn, Flux, and Karpenter plugins), or by extending `KubeObject`. Example from the Flux/Longhorn plugins:
```ts
import { makeCustomResourceClass } from '@kinvolk/headlamp-plugin/lib/K8s/crd';
```
CRD presence detection uses `CustomResourceDefinition.useList()` (or `useApiList`) and filtering on the group — Flux's `useFluxCheck()` checks for CRDs containing `fluxcd.`; Karpenter detects specific CRD names; Knative uses `registerSidebarEntryFilter` polling for its CRDs to hide the sidebar when absent.

### OpenUnison impersonation compatibility
All plugin Kubernetes calls (`K8s.ResourceClasses.*.useList()`, `ApiProxy.request()`, `clusterRequest()`) go through Headlamp's Go backend, which proxies to the kube-apiserver. In the user's architecture, OpenUnison is a reverse proxy in front of Headlamp: it authenticates the user and forwards every request to Headlamp with either the user's `id_token` or Kubernetes **Impersonate-User/Impersonate-Group** headers, and Headlamp forwards to the API server. OpenUnison has native Headlamp support (introduced in the OpenUnison 1.0.44 release per Tremolo Security's release post) and runs Headlamp without privileges of its own — the OpenUnison docs state: "OpenUnison provides secure access to Headlamp without creating service accounts. Your identity is used by Headlamp to interact with the API server, which means Headlamp runs without privileges of its own." Therefore plugin API requests are executed **as the impersonated user**, and RBAC is enforced identically to `kubectl`. `SelfSubjectAccessReview` and `SelfSubjectRulesReview` are "self" reviews that always evaluate against the calling (impersonated) identity, so they are the correct primitives for permission-aware UI.

### UDS Core CRDs (v1alpha1, group `uds.dev`)
- **Packages** (`packages.uds.dev`, namespaced): `spec.network` (expose[], allow[], serviceMesh mode ambient/sidecar), `spec.monitor[]` (ServiceMonitor/PodMonitor), `spec.sso[]` (Keycloak client config: clientId, protocol, redirectUris, groups.anyOf, enableAuthserviceSelector), `spec.caBundle`. Status fields (verified from `src/pepr/operator/crd/sources/package/v1alpha1.ts` on `main`): `phase` (enum `Pending`, `Ready`, `Failed`, `Retrying`, `Removing`, `RemovalFailed`), `observedGeneration`, `conditions[]` (Kubernetes-style: type/status[True/False/Unknown]/lastTransitionTime/reason/message), `ssoClients[]` (strings), `authserviceClients[]` ({clientId, selector}), `meshMode` (ambient/sidecar), `endpoints[]`, `monitors[]`, `probes[]`, `networkPolicyCount` (integer), `authorizationPolicyCount` (integer), `retryAttempt` (nullable integer). Printer columns: Status, SSO Clients, Endpoints, Monitors, Probes, Network Policies, Authorization Policies, Age. (UDS watcher logs confirm the runtime shape: "Processing Package authservice-test-app/mouse, status.phase: Pending, observedGeneration: undefined, retryAttempt: undefined" → later "status.phase: Ready, observedGeneration: 1, retryAttempt: 0".)
- **Exemptions** (`exemptions.uds.dev`, namespaced; CRs are restricted to the `uds-policy-exemptions` namespace by default, overridable at deploy time with `--set ALLOW_ALL_NS_EXEMPTIONS=true`): `spec.exemptions[]` with `title`, `description`, `policies[]` (enum of 18 policy names such as `DisallowHostNamespaces`, `DisallowNodePortServices`, `DisallowPrivileged`, `DropAllCapabilities`, `RequireNonRootUser`, `RestrictCapabilities`, `RestrictHostPathWrite`, `RestrictVolumeTypes`, plus Istio ones like `RestrictIstioUser`, `RestrictIstioSidecarOverrides`, `RestrictIstioTrafficOverrides`, `RestrictIstioAmbientOverrides`), and `matcher` (namespace, name [regex allowed, e.g. `^my-privileged-pod.*`], kind [pod|service]).
- **ClusterConfig** (`clusterconfig.uds.dev`, singleton named `uds-cluster-config`): `spec.attributes` (clusterName, tags[]), `spec.networking` (kubeApiCIDR, kubeNodeCIDRs[]), `spec.caBundle` (certs, includeDoDCerts, includePublicCerts), `spec.expose` (domain, adminDomain), `spec.policy` (allowAllNsExemptions).
- **Policy engine (Pepr)**: UDS Core enforces Pod Security Standards + Istio controls via Pepr admission webhooks (deployment `pepr-uds-core`, watcher `pepr-uds-core-watcher` in `pepr-system`, metrics at `https://pepr-uds-core-watcher/metrics`). Exempted resources are annotated `uds-core.pepr.dev/uds-core-policies.<POLICY>: exempted`. Policies split into Mutations (DisallowPrivilegeEscalation, RequireNonRootUser, DropAllCapabilities) and ~18 Validations, each with severity (high/medium) and a subject (Pod/Service).

### Build, packaging, deployment
Scaffold with `npx @kinvolk/headlamp-plugin create`; scripts wrap the `headlamp-plugin` CLI (`start`, `build`, `tsc`, `lint`, `test`, `package`). `npm run build` produces `dist/main.js` + `package.json`; `npm run package` produces a `.tar.gz` with a sha256 checksum. In-cluster deployment mounts plugins into `-plugins-dir` (default `/headlamp/plugins`) — best practice is to bake plugin files into a small container image used as an **initContainer** that copies `dist/` + `package.json` into a shared volume the Headlamp container mounts. The plugin manager sidecar (desktop-oriented / ArtifactHub-based) actively removes plugins not in its config, so for a controlled/air-gapped deployment prefer the initContainer + `pluginsDir` approach and pin versions.

## Details

### A. Recommended architecture and directory structure
A single npm package, each feature fully self-contained in its own folder, a central feature manifest, and a thin `index.tsx` that iterates the manifest:

```
uds-core-headlamp-plugin/
├── package.json                 # name: uds-core; version pinned to a Headlamp release line
├── tsconfig.json
├── src/
│   ├── index.tsx                # entry: reads flags, iterates manifest, calls feature.register()
│   ├── settings/
│   │   ├── Settings.tsx         # registerPluginSettings component (toggles/selectors/inputs/test)
│   │   └── config.ts            # ConfigStore wrapper + types + defaults + per-cluster helpers
│   ├── features/
│   │   ├── manifest.ts          # FEATURES: Feature[] — the single source of truth
│   │   ├── types.ts             # Feature interface
│   │   ├── namespaceScoper/     # (1) RBAC namespace scoping (generalized SSAR)
│   │   │   ├── index.ts         # register(): app-bar action / background scoper
│   │   │   └── ssar.ts          # SelfSubjectAccessReview / SelfSubjectRulesReview helpers
│   │   ├── packages/            # (2) UDS Packages CR
│   │   │   ├── index.ts         # register(): sidebar + routes + detail sections + columns
│   │   │   ├── resource.ts      # makeCustomResourceClass(packages.uds.dev)
│   │   │   ├── List.tsx  Detail.tsx
│   │   ├── exemptions/          # (3) Exemptions CR
│   │   ├── clusterConfig/       # (4) ClusterConfig CR
│   │   └── policyEngine/        # (5) Pepr policy status
│   ├── common/
│   │   ├── udsDetect.ts         # CRD/Pepr detection hooks
│   │   ├── Resources.ts         # shared CR classes (group uds.dev)
│   │   └── components/          # StatusLabel wrappers, condition tables, etc.
│   └── i18n/
└── README.md
```

Principles: (1) each feature exports a `register(cfg)` function and a settings descriptor; (2) `index.tsx` never imports feature internals directly beyond the manifest; (3) shared CR classes and detection hooks live in `common/`; (4) no feature runs side effects at import time — only inside `register()`.

### B/C. Feature-flag manifest and conditional registration

`features/types.ts`:
```ts
export interface Feature {
  id: string;                 // 'packages', 'exemptions', ...
  title: string;
  defaultEnabled: boolean;
  requiresUds?: boolean;      // gate on UDS detection
  register: (ctx: { enabled: boolean }) => void;
}
```

`settings/config.ts` — the ConfigStore wrapper (per-cluster keys):
```ts
import { ConfigStore } from '@kinvolk/headlamp-plugin/lib';

export interface UdsFlags {
  autoDetect: boolean;
  clusters: {                       // per-cluster overrides, keyed by cluster name
    [cluster: string]: {
      features: { [featureId: string]: boolean };
      serviceAddress?: string;      // e.g. text input like Prometheus' address
      // ...select values, etc.
    };
  };
}
export const store = new ConfigStore<UdsFlags>('uds-core');
export const useUdsConfig = store.useConfig();
export function isFeatureEnabled(cfg: UdsFlags | undefined, cluster: string, id: string, dflt: boolean) {
  return cfg?.clusters?.[cluster]?.features?.[id] ?? dflt;
}
```

`features/manifest.ts`:
```ts
import { packagesFeature } from './packages';
import { exemptionsFeature } from './exemptions';
// ...
export const FEATURES: Feature[] = [
  namespaceScoperFeature, packagesFeature, exemptionsFeature,
  clusterConfigFeature, policyEngineFeature,
];
```

`index.tsx` — read flags once and register:
```ts
import { registerPluginSettings, registerSidebarEntryFilter } from '@kinvolk/headlamp-plugin/lib';
import { Settings } from './settings/Settings';
import { store, isFeatureEnabled } from './settings/config';
import { FEATURES } from './features/manifest';

registerPluginSettings('uds-core', Settings, true);

const cfg = store.get();                       // synchronous snapshot at load
const cluster = /* current cluster */ '';
for (const f of FEATURES) {
  const enabled = isFeatureEnabled(cfg, cluster, f.id, f.defaultEnabled);
  f.register({ enabled });                     // feature decides what to register
}
```

Because registration is one-shot, each feature registers its sidebar/route unconditionally but pairs it with a filter that reads the live config, so toggles take effect on reload and hide instantly when detection fails:
```ts
registerSidebarEntryFilter(entry =>
  entry.name?.startsWith('uds-packages') && !liveEnabled('packages') ? null : entry);
```
Consumer components (detail sections, columns) additionally short-circuit with `useUdsConfig()` so live toggles hide their content without a reload. This is exactly how the Prometheus plugin makes its charts appear/disappear when settings change.

### Settings component (mirroring Prometheus)
```tsx
export function Settings({ data, onDataChange }: PluginSettingsDetailsProps) {
  const clusters = /* useClustersConf() */;
  const [cluster, setCluster] = useState(currentCluster());
  const flags = data?.clusters?.[cluster]?.features ?? {};
  return (
    <Box>
      <FormControlLabel control={<Switch checked={data?.autoDetect ?? true}
        onChange={e => onDataChange({ ...data, autoDetect: e.target.checked })} />}
        label="Auto-detect UDS Core" />
      <Select value={cluster} onChange={e => setCluster(e.target.value)}>
        {clusters.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
      </Select>
      {FEATURES.map(f => (
        <FormControlLabel key={f.id} label={f.title}
          control={<Switch checked={flags[f.id] ?? f.defaultEnabled}
            onChange={e => onDataChange(setFeature(data, cluster, f.id, e.target.checked))} />} />
      ))}
      <TextField label="UDS operator namespace" value={/* ... */} />
      <Button onClick={runDetect}>Test / Detect UDS Core</Button>
    </Box>
  );
}
```
`displaySaveButton=true` gives the Save button; the Test/Detect button runs the detection routine and reports which `uds.dev` CRDs and the Pepr webhook were found.

### D. UDS Core auto-detection
Mirror the Prometheus "Auto-detect" toggle and Karpenter/Flux CRD-detection approach. When `autoDetect` is on, run a detection hook and gray out (or auto-enable) features accordingly:
```ts
export function useUdsDetect() {
  const [crds] = CustomResourceDefinition.useList();
  const groups = new Set((crds ?? []).map(c => c.spec.group));
  const hasPackages = groups.has('uds.dev'); // packages/exemptions/clusterconfig share uds.dev
  // Pepr presence: look up Deployment pepr-uds-core in pepr-system, or the
  // module's admission webhook configuration.
  return { hasUds: hasPackages, groups };
}
```
Detection reads are themselves impersonated, so a user lacking `list customresourcedefinitions` degrades gracefully — treat "unknown" as "hide" and let the manual toggle override. Use `registerSidebarEntryFilter`/in-component guards so that when a `requiresUds` feature is enabled but detection fails, the entry is hidden or shown disabled with a tooltip.

### E. Per-feature design

**(1) Namespace scoper — generalize the existing SSAR pattern.** Keep the current logic (enumerate namespaces, run `SelfSubjectAccessReview` per namespace, set `allowedNamespaces` in Headlamp settings) but generalize: (a) prefer a single `SelfSubjectRulesReview` per candidate namespace to discover verbs/resources in one call rather than many SSARs; (b) drive it from settings — a text/number input for "namespace probe strategy" and which verb/resource to test (default `get pods`); (c) expose a toggle "RBAC namespace scoping". Registration surface: an app-bar action or a background effect (via a small `registerAppBarAction` component that runs the scan and writes `allowedNamespaces`). Because calls are impersonated, results reflect the real user. Settings exposed: enable toggle, verb/resource to test, "all namespaces vs. label-filtered" mode.

**(2) UDS Packages CR.** Surface `packages.uds.dev/v1alpha1` (namespaced). Registration: `registerSidebarEntry` (parent "UDS Core" → child "Packages"), `registerRoute` for list + detail, `makeCustomResourceClass` for the CR. List columns via `registerResourceTableColumnsProcessor` or a custom `ResourceListView`: Name, Namespace, `status.phase` (StatusLabel: Ready=success, Pending/Retrying=warning, Failed/RemovalFailed=error), SSO Clients count, Endpoints, Monitors, Probes, Network Policies (`networkPolicyCount`), Authorization Policies (`authorizationPolicyCount`), Age. Detail view (`registerDetailsViewSection` or dedicated route): tabs/sections for Exposed Endpoints (from `status.endpoints` + `spec.network.expose`), SSO clients (`status.ssoClients`, `status.authserviceClients`), Monitors, NetworkPolicy summary, `status.conditions` table, and a link to generated resources. Settings: enable toggle; optional "show only namespaces I can access" (reuses scoper).

**(3) Exemptions CR.** `exemptions.uds.dev/v1alpha1` (namespaced; default namespace `uds-policy-exemptions` unless `ALLOW_ALL_NS_EXEMPTIONS` was set). Registration like Packages. List columns: Name, Namespace, count of exemptions, distinct policies exempted. Detail: a table of each exemption's `title`, `description`, `policies[]` (rendered as chips), and `matcher` (namespace/name-regex/kind). Cross-link: on a Pod/Service detail view, add a `registerDetailsViewSection` that inspects the `uds-core.pepr.dev/uds-core-policies.<POLICY>: exempted` annotations and shows which policies are exempted for that object. Settings: enable toggle; "show exemption annotations on workloads" sub-toggle.

**(4) ClusterConfig CR.** `clusterconfig.uds.dev/v1alpha1`, singleton `uds-cluster-config`. Registration: single route + sidebar entry (no list needed). Read-only detail rendering `spec.attributes` (clusterName, tags), `spec.expose` (domain/adminDomain), `spec.networking` (kubeApiCIDR, kubeNodeCIDRs), `spec.caBundle` (includeDoDCerts/includePublicCerts flags — do not render cert bodies), `spec.policy.allowAllNsExemptions`. Settings: enable toggle only.

**(5) Pepr policy engine / status.** No dedicated policy CRD — surface the enforcement model. Registration: a "Policies" route listing the 3 mutations + ~18 validations (static manifest keyed to the UDS version) with subject and severity; a live section that queries `pepr-uds-core`/`pepr-uds-core-watcher` health in `pepr-system` and (optionally) the watcher `/metrics`; and workload cross-links showing per-object exemption annotations. Settings: enable toggle; "policy catalog UDS version" select; optional "show Pepr webhook health" toggle.

### F. OpenUnison impersonation — implications
- **It just works through the proxy.** Plugins never hold credentials; every `K8s`/`ApiProxy` call is forwarded by Headlamp's backend, and OpenUnison injects the impersonation headers, so calls run as the user. No plugin change is needed for auth.
- **Self reviews are the right tool.** `SelfSubjectAccessReview` (can-i for a specific verb/resource/namespace) and `SelfSubjectRulesReview` (all rules in a namespace) always evaluate the impersonated identity and are explicitly meant "for UIs to show/hide actions." Use them for both the namespace scoper and to gate mutating buttons.
- **Generalization.** Replace N× SSAR calls with: enumerate candidate namespaces (or read them from an OpenUnison-provided source), run one `SelfSubjectRulesReview` each, cache results in ConfigStore, and write `allowedNamespaces`. Fall back to per-verb SSAR only when rules review is denied. Because it's impersonated, this reflects RBAC exactly and never exceeds the user's rights.
- **Gotcha (direct-service calls).** If any feature calls a cluster *service* (e.g. Pepr metrics) through the API server service proxy, Headlamp's backend overwrites the `Authorization` header with the Kubernetes token; a bearer token for the target service would need a different header (as the dot-ai plugin does with `X-Dot-AI-Authorization`). Prefer reading CRs/status over scraping services where possible.

### H. Build, packaging, air-gap/FIPS
- **Toolchain:** scaffold and build with `@kinvolk/headlamp-plugin`; keep TypeScript strict; do not add shared modules (React/MUI/lodash/recharts) as bundled deps — match Headlamp's versions. Pin the plugin to a Headlamp release line and test against it (Headlamp ships roughly monthly; the plugin API surface has been stable but grows).
- **Deployment (recommended for UDS):** build a plugin-files container image (`FROM node build → copy dist/ + package.json to /plugins/uds-core/`), then in the Headlamp Helm values add an `initContainer` that copies into a shared volume mounted at `config.pluginsDir` (`/headlamp/plugins` or `/build/plugins`). This is declarative, GitOps-friendly, and avoids the ArtifactHub-based plugin manager (which requires egress and removes unmanaged plugins).
- **Air-gap / FIPS (UDS specifics):** UDS Core is delivered as a Zarf package/UDS Bundle for disconnected environments; the Zarf agent mutating webhook rewrites image references to the in-cluster registry. Package your plugin image the same way — add it to your UDS Bundle / Zarf package `images:` list so it is mirrored into the air-gapped registry, and reference it by the registry-relative path. Use the `registry1` (Iron Bank) or `unicorn` (FIPS, e.g. `rfcurated` FIPS images) flavors for the base node image if the plugin build image must itself be hardened; note the plugin bundle is static JS served to the browser, so FIPS applies to the build/serving containers, not the plugin bundle itself. Sign the plugin image (cosign) and let Zarf generate the SBOM. Pin chart and image versions on every upgrade.

## Recommendations
1. **Phase 1 (now):** Scaffold `uds-core` with the manifest + ConfigStore + Settings skeleton and migrate the existing namespace scoper in as feature (1), reading its enable flag and probe strategy from settings. Ship the Settings page with the Auto-detect toggle, cluster selector, per-feature toggles, and Test/Detect button. Benchmark: toggles persist per-cluster and the scoper still populates `allowedNamespaces` under OpenUnison impersonation.
2. **Phase 2:** Add the Packages CR feature (highest operator value) — list + detail + status columns + the workload exemption-annotation section. Benchmark: `status.phase` and counts render for real Packages; RBAC-denied users see graceful empties.
3. **Phase 3:** Add Exemptions and ClusterConfig (read-mostly, low risk), then the Pepr policy catalog/health feature.
4. **Detection policy:** default `autoDetect=true`; `requiresUds` features hidden when `uds.dev` CRDs absent, overridable by explicit toggle. Change this to default-off per feature if operators report clutter.
5. **Deployment:** ship via initContainer + Zarf-mirrored image in the UDS Bundle; do not rely on the plugin manager in disconnected clusters.
6. **Thresholds that change the plan:** if Headlamp adds dynamic re-registration (watch upstream), you can drop the filter-based visibility workaround; if UDS introduces a dedicated policy CRD, replace the static policy catalog with a live CR view; if OpenUnison stops proxying a given call type, revisit the service-proxy header gotcha.

## Caveats
- Headlamp registration is one-shot; "feature flags" gate visibility/rendering, not literal re-registration. Structural sidebar changes may need a reload — set expectations accordingly.
- Plugin settings persist in the browser (local storage) in web mode, so per-user, per-browser — there is an open upstream request for Helm/cluster-sourced plugin config; for fleet-wide defaults, bake defaults into the manifest and/or ship a pre-seeded config.
- I could not verify the Prometheus plugin's exact internal config property names from source (GitHub raw/blob fetches were blocked); the ConfigStore/registerPluginSettings API and the settings UI fields are confirmed, but treat the specific key names in the code sketches as your own design, not copied identifiers. The "subpath added in v0.30.0" version detail is likewise unverified — the field's existence and purpose are confirmed, but not the exact release.
- UDS CRD schemas are `v1alpha1` and under UDS's deprecation policy may evolve; the Package `status` fields are verified against `main` (`networkPolicyCount`/`authorizationPolicyCount` are counts, not lists; `retryAttempt` is nullable). Re-verify against the exact UDS Core version deployed.
- Pepr policy enforcement has no CRD to list directly; the policy catalog is a curated static list tied to a UDS version plus live webhook/annotation inspection.