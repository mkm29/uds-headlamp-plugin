# Namespace Scoper Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the standalone `headlamp-namespace-scoper-plugin` into the `uds-core` plugin's `namespaceScoper`
feature, driven by plugin settings and using SelfSubjectRulesReview-first probing.

**Architecture:** A background cluster watcher (started from the feature's one-shot `register()`) resolves candidate
namespaces, probes each as the impersonated user (SelfSubjectRulesReview first, SelfSubjectAccessReview fallback), and
writes the accessible set into Headlamp's per-cluster `allowedNamespaces` localStorage setting. Enable flag, probe
attributes, and strategy are read live from the plugin ConfigStore, keyed per cluster.

**Tech Stack:** TypeScript, React + MUI (shared modules), `@kinvolk/headlamp-plugin` 0.14.0 (`ApiProxy`, `ConfigStore`),
vitest.

## Global Constraints

- Package/plugin name is `uds-core`; ConfigStore key is `uds-core` (ADR-0002).
- Do NOT bundle shared modules (React/MUI/lodash/recharts); import from `@mui/material` and
  `@kinvolk/headlamp-plugin/lib` only (ADR-0006).
- Import ONLY from `@kinvolk/headlamp-plugin/lib` and `@kinvolk/headlamp-plugin/lib/Utils`-level public paths that are
  known safe. Do NOT import `getCluster`/`loadClusterSettings`/`storeClusterSettings` from deep submodules — they
  resolve to undefined globals in the deployed app and crash the whole plugin on load (documented in
  `headlamp-namespace-scoper-plugin/src/index.tsx` lines 7-16). Reimplement those three helpers directly.
- Registration is one-shot at load (ADR-0004): gate *behavior* on live config, do not conditionally skip registration.
- `allowedNamespaces` is a Headlamp cluster setting stored at `localStorage['cluster_settings.<cluster>']` — NOT the
  plugin ConfigStore. Enable/probe/strategy settings live in the plugin ConfigStore.
- Fail-open: if zero namespaces are accessible, leave Headlamp's namespace filter UNTOUCHED (never lock the user out).
- All four gates must pass before the feature is considered done: `npm run tsc`, `npm run lint`, `npm test`,
  `npm run build`.
- Every commit message ends with the trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Single-file test command (fast feedback):
  `npx vitest run -c node_modules/@kinvolk/headlamp-plugin/config/vite.config.mjs <file>`

______________________________________________________________________

## Migration Notes (read before starting)

**Source:** `headlamp-namespace-scoper-plugin/src/index.tsx` (single file, React-free, self-contained).

**What is preserved verbatim:** URL-regex `getCluster`, direct-localStorage cluster settings, `SelfSubjectAccessReview`
probe body, DNS-1123 namespace validation, config.json → build-time env → hardcoded candidate resolution, fail-open
apply, the polling cluster watcher, and the `nsScoperDebug()`/`nsScoperApply()` console helpers.

**What is adapted for issue #1:**

- Probe upgraded to **SelfSubjectRulesReview first** (one review returns all rules for a namespace), with
  **SelfSubjectAccessReview as fallback** when rules review is unavailable/errored.
- Probe attributes (`verb`/`group`/`resource`/`subresource`) and **strategy** (`candidates` vs `list-all`) are read from
  the plugin **ConfigStore**, per cluster, instead of being hardcoded.
- New `list-all` strategy lists namespaces via the API (best-effort) and **falls back to candidate resolution** when the
  user cannot list namespaces.
- The watcher lives inside `namespaceScoperFeature.register()` and gates each apply on the **live per-cluster enable
  flag**.
- Settings UI gains verb/group/resource/subresource inputs, a strategy selector, and a label selector.

## File Structure

- Create `src/features/namespaceScoper/probe.ts` — PURE helpers: review body builders, `ruleAllows`, `isValidNamespace`,
  `parseCsv`, `computeAllowedFromProbes`, shared types. No Headlamp/DOM deps.
- Create `src/features/namespaceScoper/probe.test.ts` — unit tests for the pure helpers.
- Create `src/features/namespaceScoper/scoper.ts` — IMPURE orchestration: ApiProxy probes, namespace listing, candidate
  resolution, localStorage apply, cluster watcher.
- Create `src/features/namespaceScoper/scoper.test.ts` — unit tests for `resolveCandidateNamespaces` (injected fetch)
  and `resolveNamespaces`.
- Modify `src/features/namespaceScoper/index.ts` — real `register()` wiring + console helpers.
- Modify `src/common/cluster.ts` — reimplement `currentCluster()` as URL regex (remove the unsafe Utils import).
- Create `src/common/cluster.test.ts` — unit tests for the URL parser.
- Modify `src/settings/flags.ts` — add `ScoperConfig`, `DEFAULT_SCOPER`, `getScoperConfig`, `setScoperConfig`.
- Modify `src/settings/flags.test.ts` — add scoper-config tests.
- Modify `src/settings/Settings.tsx` — add the namespace-scoping settings sub-panel.

______________________________________________________________________

### Task 1: Safe cluster resolution (URL regex)

Replace the scaffold's `currentCluster()` (which imports `getCluster` from a submodule that crashes in the deployed app)
with the proven URL-regex implementation. Same signature, so no callers change.

**Files:**

- Modify: `src/common/cluster.ts`
- Test: `src/common/cluster.test.ts`

**Interfaces:**

- Produces: `currentCluster(): string | null` (unchanged signature) and
  `getClusterFromPath(pathname: string): string | null` (new, pure, exported for testing).

- [ ] **Step 1: Write the failing test**

Create `src/common/cluster.test.ts`:

```ts
/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { getClusterFromPath } from './cluster';

describe('getClusterFromPath', () => {
  it('parses the cluster from a /c/<cluster> path', () => {
    expect(getClusterFromPath('/c/my-cluster/namespaces')).toBe('my-cluster');
  });

  it('returns the first name for a multi-cluster (+) view', () => {
    expect(getClusterFromPath('/c/a+b+c/pods')).toBe('a');
  });

  it('decodes URL-encoded cluster names', () => {
    expect(getClusterFromPath('/c/team%2Fprod/pods')).toBe('team/prod');
  });

  it('returns null when there is no cluster segment', () => {
    expect(getClusterFromPath('/settings/plugins/uds-core')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run -c node_modules/@kinvolk/headlamp-plugin/config/vite.config.mjs src/common/cluster.test.ts`
Expected: FAIL — `getClusterFromPath` is not exported.

- [ ] **Step 3: Rewrite `src/common/cluster.ts`**

Replace the ENTIRE file body below the license header with:

```ts
/**
 * Cluster name resolution.
 *
 * We parse the cluster from the URL directly instead of importing getCluster
 * from a headlamp-plugin submodule: those submodule paths are not in the
 * plugin externals map and resolve to undefined globals in the deployed
 * Headlamp app, crashing the whole plugin on load. See
 * headlamp-namespace-scoper-plugin/src/index.tsx (lines 7-16).
 */

/** Parse the cluster name from a Headlamp "/c/<cluster>" pathname. Pure. */
export function getClusterFromPath(pathname: string): string | null {
  const m = pathname.match(/\/c\/([^/?#]+)/);
  if (!m) {
    return null;
  }
  // Multi-cluster views join names with "+"; use the first for the settings key.
  return decodeURIComponent(m[1]).split('+')[0] || null;
}

/**
 * The current cluster name from the URL, or null when none is selected.
 *
 * Note: at plugin-load time the URL may not yet name a cluster, so callers
 * must treat null defensively (ADR-0004).
 */
export function currentCluster(): string | null {
  return getClusterFromPath(window.location.pathname);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run -c node_modules/@kinvolk/headlamp-plugin/config/vite.config.mjs src/common/cluster.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + lint**

Run: `npm run tsc && npm run lint` Expected: both exit 0 (no unused-import error from the removed Utils import).

- [ ] **Step 6: Commit**

```bash
git add src/common/cluster.ts src/common/cluster.test.ts
git commit -m "$(cat <<'EOF'
features/namespaceScoper: resolve cluster via URL regex (#1)

Avoids the deep-submodule getCluster import that crashes the deployed
plugin; adds a pure, tested URL parser.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

______________________________________________________________________

### Task 2: Scoper settings model in flags.ts

Add the per-cluster scoper configuration (probe attributes + strategy) to the plugin config, with pure getter/setter
helpers.

**Files:**

- Modify: `src/settings/flags.ts`
- Test: `src/settings/flags.test.ts`

**Interfaces:**

- Consumes: `UdsFlags`, `ClusterFlags`, `DEFAULT_FLAGS` (from Task's own file, existing).

- Produces:

  - `type ProbeStrategy = 'candidates' | 'list-all'`
  - `interface ScoperConfig { verb: string; group: string; resource: string; subresource: string; strategy: ProbeStrategy; labelSelector: string }`
  - `const DEFAULT_SCOPER: ScoperConfig`
  - `getScoperConfig(cfg: UdsFlags | undefined, cluster: string): ScoperConfig`
  - `setScoperConfig(cfg: UdsFlags | undefined, cluster: string, patch: Partial<ScoperConfig>): UdsFlags`

- [ ] **Step 1: Write the failing tests**

Append to `src/settings/flags.test.ts` (before the final closing brace is fine; add as a new `describe`):

```ts
import {
  DEFAULT_SCOPER,
  getScoperConfig,
  setScoperConfig,
} from './flags';

describe('scoper config', () => {
  it('returns DEFAULT_SCOPER when no override exists', () => {
    expect(getScoperConfig(undefined, 'c1')).toEqual(DEFAULT_SCOPER);
    expect(getScoperConfig(DEFAULT_FLAGS, 'c1')).toEqual(DEFAULT_SCOPER);
  });

  it('merges a partial override over the defaults', () => {
    const cfg = setScoperConfig(DEFAULT_FLAGS, 'c1', { resource: 'secrets', verb: 'list' });
    const got = getScoperConfig(cfg, 'c1');
    expect(got.resource).toBe('secrets');
    expect(got.verb).toBe('list');
    // Untouched fields keep their defaults.
    expect(got.subresource).toBe(DEFAULT_SCOPER.subresource);
    expect(got.strategy).toBe(DEFAULT_SCOPER.strategy);
  });

  it('setScoperConfig is immutable and per-cluster', () => {
    const cfg = setScoperConfig(DEFAULT_FLAGS, 'c1', { strategy: 'list-all' });
    expect(DEFAULT_FLAGS.clusters).toEqual({});
    expect(getScoperConfig(cfg, 'c2')).toEqual(DEFAULT_SCOPER);
  });

  it('coexists with feature flags on the same cluster', () => {
    const withFeature = setFeature(DEFAULT_FLAGS, 'c1', 'namespaceScoper', false);
    const withScoper = setScoperConfig(withFeature, 'c1', { verb: 'watch' });
    expect(isFeatureEnabled(withScoper, 'c1', 'namespaceScoper', true)).toBe(false);
    expect(getScoperConfig(withScoper, 'c1').verb).toBe('watch');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run -c node_modules/@kinvolk/headlamp-plugin/config/vite.config.mjs src/settings/flags.test.ts`
Expected: FAIL — `DEFAULT_SCOPER`/`getScoperConfig`/`setScoperConfig` not exported.

- [ ] **Step 3: Extend `src/settings/flags.ts`**

First extend `ClusterFlags` to carry the scoper config. Replace the existing `ClusterFlags` interface with:

```ts
/** Per-cluster configuration nested inside the single plugin config blob. */
export interface ClusterFlags {
  /** Enablement per feature id; absence means "use the feature default". */
  features: { [featureId: string]: boolean };
  /** Optional service address (e.g. UDS operator namespace/service). */
  serviceAddress?: string;
  /** Namespace-scoper probe configuration (feature 1). */
  scoper?: ScoperConfig;
}
```

Then append at the end of the file:

```ts
/** How the scoper decides which namespaces to probe. */
export type ProbeStrategy = 'candidates' | 'list-all';

/**
 * Namespace-scoper probe configuration. Defines the access check used as the
 * "can this user work here?" signal, and how the candidate namespace set is
 * chosen.
 */
export interface ScoperConfig {
  /** Verb to test, e.g. 'get'. */
  verb: string;
  /** API group of the resource ('' for the core group). */
  group: string;
  /** Resource to test, e.g. 'pods'. */
  resource: string;
  /** Optional subresource, e.g. 'log' ('' for none). */
  subresource: string;
  /** 'candidates' probes a curated list; 'list-all' lists namespaces first. */
  strategy: ProbeStrategy;
  /** Label selector applied to the 'list-all' strategy ('' = no filter). */
  labelSelector: string;
}

/** Defaults matching the migrated scoper's original probe ("get pods/log"). */
export const DEFAULT_SCOPER: ScoperConfig = {
  verb: 'get',
  group: '',
  resource: 'pods',
  subresource: 'log',
  strategy: 'candidates',
  labelSelector: '',
};

/** Resolve the scoper config for a cluster, merged over the defaults. */
export function getScoperConfig(cfg: UdsFlags | undefined, cluster: string): ScoperConfig {
  return { ...DEFAULT_SCOPER, ...(cfg?.clusters?.[cluster]?.scoper ?? {}) };
}

/** Return new UdsFlags with a partial scoper patch applied for one cluster. Immutable. */
export function setScoperConfig(
  cfg: UdsFlags | undefined,
  cluster: string,
  patch: Partial<ScoperConfig>
): UdsFlags {
  const base = cfg ?? DEFAULT_FLAGS;
  const clusterFlags = base.clusters?.[cluster] ?? { features: {} };
  const scoper = { ...DEFAULT_SCOPER, ...(clusterFlags.scoper ?? {}), ...patch };
  return {
    ...base,
    clusters: {
      ...base.clusters,
      [cluster]: { ...clusterFlags, scoper },
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run -c node_modules/@kinvolk/headlamp-plugin/config/vite.config.mjs src/settings/flags.test.ts`
Expected: PASS (original 4 + new 4 = 8 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run tsc` Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/settings/flags.ts src/settings/flags.test.ts
git commit -m "$(cat <<'EOF'
settings: add per-cluster namespace-scoper config (#1)

ScoperConfig (verb/group/resource/subresource/strategy/labelSelector)
with immutable get/set helpers and defaults matching the original probe.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

______________________________________________________________________

### Task 3: Pure probe module

The heart of the "namespace-resolution logic (pure parts)" the issue requires under test: review-body builders, the RBAC
rule matcher used to interpret a SelfSubjectRulesReview, namespace validation, and CSV parsing.

**Files:**

- Create: `src/features/namespaceScoper/probe.ts`
- Test: `src/features/namespaceScoper/probe.test.ts`

**Interfaces:**

- Produces:

  - `interface ResourceAttributes { verb: string; group: string; resource: string; subresource: string }`
  - `interface ResourceRule { verbs: string[]; apiGroups: string[]; resources: string[] }`
  - `interface ProbeResult { namespace: string; allowed: boolean; method: 'ssrr' | 'ssar'; reason?: string; evaluationError?: string; error?: string }`
  - `selfSubjectRulesReviewBody(namespace: string): object`
  - `selfSubjectAccessReviewBody(namespace: string, attrs: ResourceAttributes): object`
  - `ruleAllows(rules: ResourceRule[], attrs: ResourceAttributes): boolean`
  - `isValidNamespace(ns: string): boolean`
  - `parseCsv(csv: string): string[]`
  - `computeAllowedFromProbes(probes: ProbeResult[]): string[]`

- [ ] **Step 1: Write the failing tests**

Create `src/features/namespaceScoper/probe.test.ts`:

```ts
/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  computeAllowedFromProbes,
  isValidNamespace,
  parseCsv,
  ProbeResult,
  ResourceRule,
  ruleAllows,
  selfSubjectAccessReviewBody,
  selfSubjectRulesReviewBody,
} from './probe';

const ATTRS = { verb: 'get', group: '', resource: 'pods', subresource: 'log' };

describe('ruleAllows', () => {
  it('matches an exact verb/group/resource rule', () => {
    const rules: ResourceRule[] = [{ verbs: ['get'], apiGroups: [''], resources: ['pods'] }];
    expect(ruleAllows(rules, ATTRS)).toBe(true);
  });

  it('matches via wildcards', () => {
    const rules: ResourceRule[] = [{ verbs: ['*'], apiGroups: ['*'], resources: ['*'] }];
    expect(ruleAllows(rules, ATTRS)).toBe(true);
  });

  it('matches a subresource written as resource/subresource', () => {
    const rules: ResourceRule[] = [{ verbs: ['get'], apiGroups: [''], resources: ['pods/log'] }];
    expect(ruleAllows(rules, ATTRS)).toBe(true);
  });

  it('denies when the verb is absent', () => {
    const rules: ResourceRule[] = [{ verbs: ['list'], apiGroups: [''], resources: ['pods'] }];
    expect(ruleAllows(rules, ATTRS)).toBe(false);
  });

  it('denies when the group differs', () => {
    const rules: ResourceRule[] = [{ verbs: ['get'], apiGroups: ['apps'], resources: ['pods'] }];
    expect(ruleAllows(rules, ATTRS)).toBe(false);
  });

  it('denies on an empty rule set', () => {
    expect(ruleAllows([], ATTRS)).toBe(false);
  });
});

describe('review body builders', () => {
  it('builds a SelfSubjectRulesReview for a namespace', () => {
    expect(selfSubjectRulesReviewBody('ns1')).toEqual({
      apiVersion: 'authorization.k8s.io/v1',
      kind: 'SelfSubjectRulesReview',
      spec: { namespace: 'ns1' },
    });
  });

  it('builds a SelfSubjectAccessReview with resource attributes', () => {
    expect(selfSubjectAccessReviewBody('ns1', ATTRS)).toEqual({
      apiVersion: 'authorization.k8s.io/v1',
      kind: 'SelfSubjectAccessReview',
      spec: {
        resourceAttributes: {
          namespace: 'ns1',
          verb: 'get',
          group: '',
          resource: 'pods',
          subresource: 'log',
        },
      },
    });
  });
});

describe('isValidNamespace', () => {
  it('accepts DNS-1123 labels', () => {
    expect(isValidNamespace('kube-system')).toBe(true);
    expect(isValidNamespace('a')).toBe(true);
  });

  it('rejects invalid or over-long labels', () => {
    expect(isValidNamespace('')).toBe(false);
    expect(isValidNamespace('Bad_NS')).toBe(false);
    expect(isValidNamespace('-lead')).toBe(false);
    expect(isValidNamespace('a'.repeat(64))).toBe(false);
  });
});

describe('parseCsv', () => {
  it('splits, trims, and drops empties', () => {
    expect(parseCsv(' a, b ,,c ')).toEqual(['a', 'b', 'c']);
    expect(parseCsv('')).toEqual([]);
  });
});

describe('computeAllowedFromProbes', () => {
  it('returns only the allowed namespaces', () => {
    const probes: ProbeResult[] = [
      { namespace: 'a', allowed: true, method: 'ssrr' },
      { namespace: 'b', allowed: false, method: 'ssar' },
      { namespace: 'c', allowed: true, method: 'ssar' },
    ];
    expect(computeAllowedFromProbes(probes)).toEqual(['a', 'c']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
`npx vitest run -c node_modules/@kinvolk/headlamp-plugin/config/vite.config.mjs src/features/namespaceScoper/probe.test.ts`
Expected: FAIL — module `./probe` not found.

- [ ] **Step 3: Create `src/features/namespaceScoper/probe.ts`**

```ts
/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Pure probing helpers: authorization review request bodies, the RBAC rule
 * matcher that interprets a SelfSubjectRulesReview response, namespace
 * validation, and result reduction. No Headlamp or DOM dependencies, so this
 * is the unit-tested core of the scoper (issue #1 acceptance criteria).
 */

/** The access check used as the "can this user work here?" signal. */
export interface ResourceAttributes {
  verb: string;
  group: string;
  resource: string;
  subresource: string;
}

/** A single rule from a SelfSubjectRulesReview status.resourceRules entry. */
export interface ResourceRule {
  verbs: string[];
  apiGroups: string[];
  resources: string[];
}

/** Outcome of probing one namespace. */
export interface ProbeResult {
  namespace: string;
  allowed: boolean;
  method: 'ssrr' | 'ssar';
  reason?: string;
  evaluationError?: string;
  error?: string;
}

/** Build a SelfSubjectRulesReview body for a namespace. */
export function selfSubjectRulesReviewBody(namespace: string) {
  return {
    apiVersion: 'authorization.k8s.io/v1',
    kind: 'SelfSubjectRulesReview',
    spec: { namespace },
  };
}

/** Build a SelfSubjectAccessReview body for a namespace + resource attributes. */
export function selfSubjectAccessReviewBody(namespace: string, attrs: ResourceAttributes) {
  return {
    apiVersion: 'authorization.k8s.io/v1',
    kind: 'SelfSubjectAccessReview',
    spec: {
      resourceAttributes: {
        namespace,
        verb: attrs.verb,
        group: attrs.group,
        resource: attrs.resource,
        subresource: attrs.subresource,
      },
    },
  };
}

const inList = (list: string[], value: string): boolean =>
  list.includes('*') || list.includes(value);

/**
 * Does any resource rule permit the requested verb/group/resource(/subresource)?
 * Wildcards ('*') in a rule match anything. A subresource matches either the
 * bare resource or the "resource/subresource" form.
 */
export function ruleAllows(rules: ResourceRule[], attrs: ResourceAttributes): boolean {
  const wanted = attrs.subresource
    ? [attrs.resource, `${attrs.resource}/${attrs.subresource}`]
    : [attrs.resource];
  return rules.some(
    rule =>
      inList(rule.verbs, attrs.verb) &&
      inList(rule.apiGroups, attrs.group) &&
      wanted.some(r => inList(rule.resources, r))
  );
}

// DNS-1123 label validation (from Headlamp's isValidNamespaceFormat).
const DNS1123 = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

/** True when `ns` is a valid DNS-1123 label (<= 63 chars). */
export function isValidNamespace(ns: string): boolean {
  return ns.length > 0 && ns.length <= 63 && DNS1123.test(ns);
}

/** Split a comma-separated string into trimmed, non-empty entries. */
export function parseCsv(csv: string): string[] {
  return csv
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

/** Reduce probe results to the list of accessible namespace names. */
export function computeAllowedFromProbes(probes: ProbeResult[]): string[] {
  return probes.filter(p => p.allowed).map(p => p.namespace);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
`npx vitest run -c node_modules/@kinvolk/headlamp-plugin/config/vite.config.mjs src/features/namespaceScoper/probe.test.ts`
Expected: PASS (all describes).

- [ ] **Step 5: Typecheck + lint**

Run: `npm run tsc && npm run lint` Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/features/namespaceScoper/probe.ts src/features/namespaceScoper/probe.test.ts
git commit -m "$(cat <<'EOF'
features/namespaceScoper: pure probe helpers with SSRR rule matcher (#1)

Review body builders, ruleAllows (interprets SelfSubjectRulesReview),
DNS-1123 validation, CSV parsing, result reduction; fully unit tested.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

______________________________________________________________________

### Task 4: Candidate namespace resolution

Migrate the `config.json → build-time env → hardcoded fallback` resolution, refactored with injectable dependencies so
it is testable, and add the `list-all` selection path.

**Files:**

- Create: `src/features/namespaceScoper/scoper.ts` (partial — resolution functions only in this task)
- Test: `src/features/namespaceScoper/scoper.test.ts`

**Interfaces:**

- Consumes: `parseCsv`, `isValidNamespace` (from `./probe`); `ProbeStrategy` (from `../../settings/flags`).

- Produces:

  - `type CandidateSource = 'config.json' | 'build-time-env' | 'hardcoded-fallback'`
  - `const HARDCODED_FALLBACK: string[]`
  - `resolveCandidateNamespaces(deps?: { fetchImpl?: typeof fetch; buildTimeCsv?: string; hardcoded?: string[] }): Promise<{ source: CandidateSource; namespaces: string[] }>`

- [ ] **Step 1: Write the failing tests**

Create `src/features/namespaceScoper/scoper.test.ts`:

```ts
/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { resolveCandidateNamespaces } from './scoper';

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => body,
  } as unknown as Response;
}

function htmlResponse(): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'text/html' },
    json: async () => ({}),
  } as unknown as Response;
}

describe('resolveCandidateNamespaces', () => {
  it('uses config.json when it returns a JSON candidate list', async () => {
    const fetchImpl = async () => jsonResponse({ candidateNamespaces: ['a', 'b'] });
    const r = await resolveCandidateNamespaces({ fetchImpl: fetchImpl as typeof fetch });
    expect(r).toEqual({ source: 'config.json', namespaces: ['a', 'b'] });
  });

  it('falls through to build-time env when config.json is the SPA html fallback', async () => {
    const fetchImpl = async () => htmlResponse();
    const r = await resolveCandidateNamespaces({
      fetchImpl: fetchImpl as typeof fetch,
      buildTimeCsv: 'x, y',
    });
    expect(r).toEqual({ source: 'build-time-env', namespaces: ['x', 'y'] });
  });

  it('falls back to the hardcoded list when fetch throws and env is empty', async () => {
    const fetchImpl = async () => {
      throw new Error('network down');
    };
    const r = await resolveCandidateNamespaces({
      fetchImpl: fetchImpl as typeof fetch,
      buildTimeCsv: '',
      hardcoded: ['fixed-a', 'fixed-b'],
    });
    expect(r).toEqual({ source: 'hardcoded-fallback', namespaces: ['fixed-a', 'fixed-b'] });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
`npx vitest run -c node_modules/@kinvolk/headlamp-plugin/config/vite.config.mjs src/features/namespaceScoper/scoper.test.ts`
Expected: FAIL — module `./scoper` not found.

- [ ] **Step 3: Create `src/features/namespaceScoper/scoper.ts` (resolution part)**

```ts
/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { parseCsv } from './probe';

const PREFIX = '[uds-core:namespace-scoper]';
const log = {
  debug: (...args: unknown[]) => console.debug(PREFIX, ...args),
  info: (...args: unknown[]) => console.info(PREFIX, ...args),
  warn: (...args: unknown[]) => console.warn(PREFIX, ...args),
  error: (...args: unknown[]) => console.error(PREFIX, ...args),
};

const CONFIG_URL = './config.json';

const BUILD_TIME_NAMESPACES: string =
  (import.meta as any).env?.HEADLAMP_APP_CANDIDATE_NAMESPACES || '';

/** Last-resort candidate namespaces when no config.json or env var is present. */
export const HARDCODED_FALLBACK: string[] = [
  'authservice',
  'default',
  'headlamp',
  'istio-admin-gateway',
  'istio-egress-ambient',
  'istio-system',
  'istio-tenant-gateway',
  'keycloak',
  'kube-node-lease',
  'kube-public',
  'kube-system',
  'monitoring',
  'nimbus',
  'numarss',
  'pepr-system',
  'uds-crds',
  'uds-dev-stack',
  'uds-policy-exemptions',
  'zarf',
];

export type CandidateSource = 'config.json' | 'build-time-env' | 'hardcoded-fallback';

/**
 * Resolve the candidate namespace list. Runtime config.json wins; then the
 * build-time env var; then the hardcoded fallback. Never throws — a
 * missing/broken source just falls through. Dependencies are injectable for
 * testing.
 */
export async function resolveCandidateNamespaces(deps?: {
  fetchImpl?: typeof fetch;
  buildTimeCsv?: string;
  hardcoded?: string[];
}): Promise<{ source: CandidateSource; namespaces: string[] }> {
  const fetchImpl = deps?.fetchImpl ?? fetch;
  const buildTimeCsv = deps?.buildTimeCsv ?? BUILD_TIME_NAMESPACES;
  const hardcoded = deps?.hardcoded ?? HARDCODED_FALLBACK;

  // 1. Runtime config file (primary).
  try {
    const resp = await fetchImpl(CONFIG_URL, { cache: 'no-store' });
    if (resp.ok) {
      // Headlamp serves index.html for unknown paths, so a missing config.json
      // returns 200 text/html. Guard on content-type to treat that as "no config".
      const contentType = resp.headers.get('content-type') || '';
      if (contentType.includes('json')) {
        const data = await resp.json();
        const fromFile = Array.isArray(data?.candidateNamespaces)
          ? (data.candidateNamespaces as unknown[]).map(String)
          : [];
        if (fromFile.length > 0) {
          log.info(`candidate namespaces from config.json (${fromFile.length}):`, fromFile);
          return { source: 'config.json', namespaces: fromFile };
        }
      }
    }
  } catch (e) {
    log.debug('no usable runtime config.json, trying build-time env:', e);
  }

  // 2. Build-time env var.
  const fromEnv = parseCsv(buildTimeCsv);
  if (fromEnv.length > 0) {
    log.info(`candidate namespaces from build-time env (${fromEnv.length}):`, fromEnv);
    return { source: 'build-time-env', namespaces: fromEnv };
  }

  // 3. Hardcoded fallback.
  log.warn(
    `using HARDCODED fallback candidate namespaces (${hardcoded.length}). ` +
      'Provide config.json or the build-time env to scope to real cluster namespaces:',
    hardcoded
  );
  return { source: 'hardcoded-fallback', namespaces: hardcoded };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
`npx vitest run -c node_modules/@kinvolk/headlamp-plugin/config/vite.config.mjs src/features/namespaceScoper/scoper.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + lint**

Run: `npm run tsc && npm run lint` Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/features/namespaceScoper/scoper.ts src/features/namespaceScoper/scoper.test.ts
git commit -m "$(cat <<'EOF'
features/namespaceScoper: migrate candidate namespace resolution (#1)

config.json -> build-time env -> hardcoded fallback, with injectable
deps for testing.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

______________________________________________________________________

### Task 5: Impure probing, namespace listing, and apply

Complete `scoper.ts` with the ApiProxy-backed probes (SSRR-first, SSAR fallback), the `list-all` namespace listing,
cluster-settings load/store, `computeScope`/`applyScope`, and the cluster watcher.

**Files:**

- Modify: `src/features/namespaceScoper/scoper.ts`

**Interfaces:**

- Consumes: `ApiProxy` (from `@kinvolk/headlamp-plugin/lib`); `currentCluster` (from `../../common/cluster`); `store`
  (from `../../settings/config`); `getScoperConfig`, `isFeatureEnabled`, `ScoperConfig` (from `../../settings/flags`);
  `ProbeResult`, `ResourceAttributes`, `ResourceRule`, `isValidNamespace`, `ruleAllows`, `selfSubjectAccessReviewBody`,
  `selfSubjectRulesReviewBody`, `computeAllowedFromProbes` (from `./probe`).

- Produces:

  - `probeNamespace(namespace: string, attrs: ResourceAttributes): Promise<ProbeResult>`
  - `computeScope(): Promise<{ cluster: string | null; allowed: string[]; probes: ProbeResult[] }>`
  - `applyScope(): Promise<{ cluster: string | null; allowed: string[]; probes: ProbeResult[] } | null>`
  - `startClusterWatcher(): void`

- [ ] **Step 1: Append the probing + apply code to `src/features/namespaceScoper/scoper.ts`**

Add these imports to the existing import block at the top of the file:

```ts
import { ApiProxy } from '@kinvolk/headlamp-plugin/lib';
import { currentCluster } from '../../common/cluster';
import { store } from '../../settings/config';
import { getScoperConfig, isFeatureEnabled } from '../../settings/flags';
import {
  computeAllowedFromProbes,
  isValidNamespace,
  ProbeResult,
  ResourceAttributes,
  ResourceRule,
  ruleAllows,
  selfSubjectAccessReviewBody,
  selfSubjectRulesReviewBody,
} from './probe';
```

(Keep the existing `import { parseCsv } from './probe';` line; you may merge it into the block above.)

Append at the end of the file:

```ts
const FEATURE_ID = 'namespaceScoper';

/** Load Headlamp's per-cluster settings from localStorage (the key it uses). */
function loadClusterSettings(clusterName: string): Record<string, any> {
  if (!clusterName) {
    return {};
  }
  try {
    return JSON.parse(localStorage.getItem(`cluster_settings.${clusterName}`) || '{}');
  } catch {
    return {};
  }
}

/** Store Headlamp's per-cluster settings to localStorage (the key it uses). */
function storeClusterSettings(clusterName: string, settings: Record<string, any>): void {
  if (!clusterName) {
    return;
  }
  localStorage.setItem(`cluster_settings.${clusterName}`, JSON.stringify(settings));
}

/**
 * Probe one namespace: SelfSubjectRulesReview first (one review returns all
 * rules for the namespace), falling back to SelfSubjectAccessReview when the
 * rules review is unavailable or reports an evaluation error. Never throws — a
 * failed probe is reported as not-accessible.
 */
export async function probeNamespace(
  namespace: string,
  attrs: ResourceAttributes
): Promise<ProbeResult> {
  // 1. SelfSubjectRulesReview.
  try {
    const res: any = await ApiProxy.request(
      '/apis/authorization.k8s.io/v1/selfsubjectrulesreviews',
      {
        method: 'POST',
        body: JSON.stringify(selfSubjectRulesReviewBody(namespace)),
        headers: { 'Content-Type': 'application/json' },
      }
    );
    const status = res?.status || {};
    const rules: ResourceRule[] = Array.isArray(status.resourceRules)
      ? status.resourceRules
      : [];
    if (!status.evaluationError && rules.length > 0) {
      return {
        namespace,
        allowed: ruleAllows(rules, attrs),
        method: 'ssrr',
        evaluationError: status.evaluationError || undefined,
      };
    }
    // Empty rules or an evaluation error -> fall through to SSAR.
  } catch (e: any) {
    log.debug(`SSRR failed for "${namespace}", falling back to SSAR:`, e?.message ?? e);
  }

  // 2. SelfSubjectAccessReview fallback.
  try {
    const res: any = await ApiProxy.request(
      '/apis/authorization.k8s.io/v1/selfsubjectaccessreviews',
      {
        method: 'POST',
        body: JSON.stringify(selfSubjectAccessReviewBody(namespace, attrs)),
        headers: { 'Content-Type': 'application/json' },
      }
    );
    const status = res?.status || {};
    return {
      namespace,
      allowed: Boolean(status.allowed),
      method: 'ssar',
      reason: status.reason || undefined,
      evaluationError: status.evaluationError || undefined,
    };
  } catch (e: any) {
    const msg = e?.message ? String(e.message) : String(e);
    log.warn(`probe failed for "${namespace}" (treating as not-accessible):`, msg);
    return { namespace, allowed: false, method: 'ssar', error: msg };
  }
}

/**
 * List namespace names via the API (best-effort), optionally label-filtered.
 * Returns null when the user cannot list namespaces — the caller then falls
 * back to the candidate list.
 */
async function listNamespaces(labelSelector: string): Promise<string[] | null> {
  const query = labelSelector ? `?labelSelector=${encodeURIComponent(labelSelector)}` : '';
  try {
    const res: any = await ApiProxy.request(`/api/v1/namespaces${query}`, { method: 'GET' });
    const items: any[] = Array.isArray(res?.items) ? res.items : [];
    return items.map(i => i?.metadata?.name).filter(Boolean);
  } catch (e: any) {
    log.info('list-all: cannot list namespaces, will use candidate list:', e?.message ?? e);
    return null;
  }
}

/** Resolve the namespace set to probe, per the configured strategy. */
async function resolveNamespaces(cfg: ScoperConfig): Promise<string[]> {
  if (cfg.strategy === 'list-all') {
    const listed = await listNamespaces(cfg.labelSelector);
    if (listed && listed.length > 0) {
      return listed;
    }
  }
  const { namespaces } = await resolveCandidateNamespaces();
  return namespaces;
}

/** Resolve and probe the namespace set for the current cluster + config. */
export async function computeScope(): Promise<{
  cluster: string | null;
  allowed: string[];
  probes: ProbeResult[];
}> {
  const cluster = currentCluster();
  const cfg = getScoperConfig(store.get(), cluster ?? '');
  const attrs: ResourceAttributes = {
    verb: cfg.verb,
    group: cfg.group,
    resource: cfg.resource,
    subresource: cfg.subresource,
  };

  const raw = await resolveNamespaces(cfg);
  const candidates = raw.filter(isValidNamespace);
  const invalid = raw.filter(ns => !isValidNamespace(ns));
  if (invalid.length) {
    log.warn('ignoring candidate names that are not valid DNS-1123 labels:', invalid);
  }

  log.info(
    `probing ${candidates.length} namespace(s) as the impersonated user ` +
      `(cluster="${cluster}", strategy=${cfg.strategy}, probe="${attrs.verb} ${attrs.resource}` +
      `${attrs.subresource ? '/' + attrs.subresource : ''}")`
  );

  const probes = await Promise.all(candidates.map(ns => probeNamespace(ns, attrs)));
  const allowed = computeAllowedFromProbes(probes);
  log.info(`accessible namespaces (${allowed.length}/${candidates.length}):`, allowed);
  return { cluster, allowed, probes };
}

/**
 * Compute the scope and write it into Headlamp's per-cluster namespace filter.
 * Fail-open: never writes an empty list; leaves the filter untouched instead.
 */
export async function applyScope(): Promise<{
  cluster: string | null;
  allowed: string[];
  probes: ProbeResult[];
} | null> {
  const cluster = currentCluster();
  if (!cluster) {
    log.warn('applyScope: no active cluster; skipping');
    return null;
  }
  if (!isFeatureEnabled(store.get(), cluster, FEATURE_ID, true)) {
    log.info(`applyScope: scoping disabled for cluster "${cluster}"; skipping`);
    return null;
  }

  const result = await computeScope();
  if (result.allowed.length === 0) {
    log.warn(
      'applyScope: NO accessible namespaces; leaving the namespace filter UNTOUCHED (fail-open)'
    );
    return result;
  }

  const settings = loadClusterSettings(cluster);
  const current: string[] = settings.allowedNamespaces || [];
  const changed =
    current.length !== result.allowed.length ||
    !result.allowed.every(ns => current.includes(ns));
  if (changed) {
    settings.allowedNamespaces = result.allowed;
    storeClusterSettings(cluster, settings);
    log.info(`applyScope: set allowedNamespaces for "${cluster}" to`, result.allowed);
  } else {
    log.info(`applyScope: allowedNamespaces already up to date for "${cluster}"`);
  }
  return result;
}

// Cluster watcher: getCluster() is null until a cluster is active, and with
// OpenUnison SSO the authenticated view can settle after load. Poll and
// (re)apply whenever the active cluster changes.
let lastAppliedCluster: string | null = null;

function watchCluster(attempt = 0): void {
  const cluster = currentCluster();
  if (cluster && cluster !== lastAppliedCluster) {
    lastAppliedCluster = cluster;
    log.info(`active cluster is now "${cluster}"; applying namespace scope`);
    applyScope().catch(e => log.error('applyScope threw:', e));
  }
  const delay = attempt < 60 ? 500 : 2000;
  setTimeout(() => watchCluster(attempt + 1), delay);
}

/** Start the background cluster watcher (idempotent per module load). */
export function startClusterWatcher(): void {
  watchCluster();
}
```

- [ ] **Step 2: Run the existing scoper tests to verify no regression**

Run:
`npx vitest run -c node_modules/@kinvolk/headlamp-plugin/config/vite.config.mjs src/features/namespaceScoper/scoper.test.ts`
Expected: PASS (3 tests still green — resolution behavior unchanged).

- [ ] **Step 3: Typecheck + lint**

Run: `npm run tsc && npm run lint` Expected: exit 0. If lint flags `any`, keep it — the ApiProxy responses are untyped;
the existing scaffold and source use `any` for these. If lint flags an unused `parseCsv` import after merging, remove
the duplicate import line.

- [ ] **Step 4: Commit**

```bash
git add src/features/namespaceScoper/scoper.ts
git commit -m "$(cat <<'EOF'
features/namespaceScoper: SSRR-first probing, list-all, fail-open apply (#1)

probeNamespace does SelfSubjectRulesReview then SSAR fallback; list-all
strategy with candidate fallback; writes allowedNamespaces to the
per-cluster localStorage setting; polling cluster watcher.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

______________________________________________________________________

### Task 6: Wire the feature register() + console helpers

Replace the stubbed `register()` with real wiring: start the watcher and expose the debug/apply console helpers.

**Files:**

- Modify: `src/features/namespaceScoper/index.ts`

**Interfaces:**

- Consumes: `Feature` (from `../types`); `startClusterWatcher`, `computeScope`, `applyScope` (from `./scoper`).

- Produces: `namespaceScoperFeature: Feature` (unchanged export name; manifest already imports it).

- [ ] **Step 1: Replace the body of `src/features/namespaceScoper/index.ts` (below the license header)**

```ts
import { Feature } from '../types';
import { applyScope, computeScope, startClusterWatcher } from './scoper';

/** Feature (1): RBAC namespace scoping. Works without UDS Core. */
export const namespaceScoperFeature: Feature = {
  id: 'namespaceScoper',
  title: 'RBAC namespace scoping',
  defaultEnabled: true,
  register() {
    // Registration is one-shot (ADR-0004): always start the watcher; it gates
    // each apply on the live per-cluster enable flag, so toggling the feature
    // off stops scoping on the next tick / reload without needing to
    // conditionally skip registration here.
    startClusterWatcher();

    // On-demand console helpers for operators (filter console on
    // "uds-core:namespace-scoper"):
    //   udsScoperDebug() -> re-probe and print a namespace -> access table
    //   udsScoperApply() -> re-probe and write the namespace filter now
    (window as any).udsScoperDebug = async () => {
      const r = await computeScope();
      // eslint-disable-next-line no-console
      console.table(
        r.probes.map(p => ({
          namespace: p.namespace,
          access: p.allowed ? 'allowed' : 'denied',
          method: p.method,
          detail: p.reason || p.evaluationError || p.error || '',
        }))
      );
      return r;
    };
    (window as any).udsScoperApply = async () => applyScope();
  },
};
```

- [ ] **Step 2: Typecheck + lint + build**

Run: `npm run tsc && npm run lint && npm run build` Expected: all exit 0; build prints `dist/main.js`.

- [ ] **Step 3: Run the full test suite**

Run: `CI=true npm test` Expected: all test files pass (cluster, flags, probe, scoper).

- [ ] **Step 4: Commit**

```bash
git add src/features/namespaceScoper/index.ts
git commit -m "$(cat <<'EOF'
features/namespaceScoper: wire register() to the scoper (#1)

Starts the cluster watcher and exposes udsScoperDebug/udsScoperApply
console helpers. Replaces the Phase-1 stub.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

______________________________________________________________________

### Task 7: Settings UI for the scoper

Add a "Namespace scoping" sub-panel to the settings page: verb/group/resource/subresource inputs, a strategy selector,
and a label selector.

**Files:**

- Modify: `src/settings/Settings.tsx`

**Interfaces:**

- Consumes: `getScoperConfig`, `setScoperConfig`, `ProbeStrategy` (from `./flags`).

- [ ] **Step 1: Add imports**

In `src/settings/Settings.tsx`, extend the flags import to include the scoper helpers and add `MenuItem` is already
imported; add `ProbeStrategy` type import. Change the existing line:

```ts
import { DEFAULT_FLAGS, isFeatureEnabled, setFeature, UdsFlags } from './flags';
```

to:

```ts
import {
  DEFAULT_FLAGS,
  getScoperConfig,
  isFeatureEnabled,
  ProbeStrategy,
  setFeature,
  setScoperConfig,
  UdsFlags,
} from './flags';
```

- [ ] **Step 2: Add the scoper panel before the closing `</Box>` of the component**

Insert this block immediately after the "Features" `</Box>` and before the `UDS operator namespace` `TextField` in
`src/settings/Settings.tsx`:

```tsx
      <Box>
        <Typography variant="subtitle2" gutterBottom>
          Namespace scoping (probe)
        </Typography>
        {(() => {
          const scoper = getScoperConfig(flags, cluster);
          const patch = (p: Partial<typeof scoper>) =>
            onDataChange?.(setScoperConfig(flags, cluster, p));
          return (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                <TextField
                  size="small"
                  label="Verb"
                  value={scoper.verb}
                  onChange={e => patch({ verb: e.target.value })}
                />
                <TextField
                  size="small"
                  label="Group"
                  placeholder="(core)"
                  value={scoper.group}
                  onChange={e => patch({ group: e.target.value })}
                />
                <TextField
                  size="small"
                  label="Resource"
                  value={scoper.resource}
                  onChange={e => patch({ resource: e.target.value })}
                />
                <TextField
                  size="small"
                  label="Subresource"
                  value={scoper.subresource}
                  onChange={e => patch({ subresource: e.target.value })}
                />
              </Box>
              <Box>
                <Typography variant="body2" gutterBottom>
                  Strategy
                </Typography>
                <Select
                  size="small"
                  value={scoper.strategy}
                  onChange={e => patch({ strategy: e.target.value as ProbeStrategy })}
                >
                  <MenuItem value="candidates">Candidate list</MenuItem>
                  <MenuItem value="list-all">List all namespaces</MenuItem>
                </Select>
              </Box>
              {scoper.strategy === 'list-all' && (
                <TextField
                  size="small"
                  label="Label selector"
                  placeholder="e.g. kubernetes.io/metadata.name"
                  value={scoper.labelSelector}
                  onChange={e => patch({ labelSelector: e.target.value })}
                />
              )}
            </Box>
          );
        })()}
      </Box>
```

- [ ] **Step 3: Typecheck + lint + build**

Run: `npm run tsc && npm run lint && npm run build` Expected: all exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/settings/Settings.tsx
git commit -m "$(cat <<'EOF'
settings: add namespace-scoping probe controls (#1)

Per-cluster verb/group/resource/subresource, strategy selector, and
label selector wired to setScoperConfig.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

______________________________________________________________________

### Task 8: Acceptance verification & manual runtime check

Confirm every issue #1 acceptance criterion, run all four gates together, and record the manual runtime check.

**Files:** none (verification only).

- [ ] **Step 1: Run all four gates**

Run:

```bash
npm run tsc && npm run lint && CI=true npm test && npm run build
```

Expected: all exit 0; `dist/main.js` emitted; all test files green.

- [ ] **Step 2: Manual runtime verification (documented, not automated)**

Because scoping only observably works in a live Headlamp + OpenUnison deployment, verify manually and paste the console
output into the PR:

1. Load the built plugin, log in via OpenUnison, open a cluster view (`/c/<cluster>/...`).
1. In the browser console, filter on `uds-core:namespace-scoper`. Confirm a line like
   `active cluster is now "<cluster>"; applying namespace scope` and an `accessible namespaces (N/M)` summary.
1. Run `udsScoperDebug()` — confirm the table shows `method` = `ssrr` for namespaces where the rules review succeeded,
   and `ssar` only where it fell back.
1. Confirm Headlamp's namespace filter now lists only accessible namespaces
   (`localStorage['cluster_settings.<cluster>'].allowedNamespaces` is populated).
1. In Settings > Plugins > uds-core, toggle "RBAC namespace scoping" off for the cluster, Save, reload; confirm the
   console logs `scoping disabled for cluster ...; skipping` and no new scope is applied.
1. As a restricted user, confirm only their namespaces appear and no uncaught errors are logged.

- [ ] **Step 3: Map each acceptance criterion to evidence**

Confirm and check off in issue #1:

- [ ] `register()` populates `allowedNamespaces` under impersonation — Task 5/6 + manual step 4.

- [ ] Toggling off per cluster disables on reload — `applyScope` enable gate (Task 5) + manual step 5.

- [ ] Restricted RBAC → only accessible namespaces, no errors — per-probe try/catch + fail-open (Task 5) + manual step
  6\.

- [ ] SSRR-first with SSAR fallback — `probeNamespace` (Task 5), verified by `method` column (manual step 3),
  unit-tested matcher (Task 3).

- [ ] tsc/lint/test/build pass — Step 1.

- [ ] Unit tests cover namespace-resolution logic — Tasks 1-4 (`cluster`, `flags`, `probe`, `scoper` tests).

- [ ] **Step 4: Push the branch and open the PR**

```bash
git push -u origin feat/1-migrate-existing-rbac-namespace-scoper-into-namespacescoper-feature-phase-1
gh pr create --fill --base main \
  --title "Migrate RBAC namespace scoper into namespaceScoper feature (#1)" \
  --body "Closes #1. Migrates headlamp-namespace-scoper-plugin into the uds-core namespaceScoper feature: SSRR-first probing with SSAR fallback, settings-driven probe attributes/strategy per cluster, fail-open apply to Headlamp's allowedNamespaces. Includes manual runtime verification output.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

______________________________________________________________________

## Self-Review

**Spec coverage (issue #1 acceptance criteria):**

- `register()` populates `allowedNamespaces` under impersonation → Tasks 5, 6. ✓
- Toggle off per cluster disables on reload → Task 5 (`applyScope` enable gate). ✓
- Restricted RBAC → accessible-only, no errors → Task 5 (per-probe try/catch, fail-open). ✓
- SSRR-first + SSAR fallback → Tasks 3 (`ruleAllows`), 5 (`probeNamespace`). ✓
- 4 gates pass → Task 8. ✓
- Unit tests for resolution logic → Tasks 1-4. ✓
- Settings: verb/resource + strategy → Tasks 2, 7. ✓

**Decommission note:** the standalone `headlamp-namespace-scoper-plugin/` directory is left in place (untracked) as
reference during migration; deleting it is out of scope for issue #1 and should be a separate cleanup once the migrated
feature is verified in a live cluster.

**Type consistency:** `ScoperConfig` fields (`verb/group/resource/subresource/strategy/labelSelector`) are used
identically in `flags.ts` (Task 2), `scoper.ts` (Task 5), and `Settings.tsx` (Task 7). `ProbeResult.method`
(`'ssrr' | 'ssar'`) is set in Task 5 and read in Task 6's console table. `currentCluster()` signature is unchanged
across Task 1. `resolveCandidateNamespaces` deps object matches between Task 4 (definition/tests) and Task 5 (call with
no args).

**Placeholder scan:** no TBD/TODO-as-work in task steps; all code blocks are complete.
