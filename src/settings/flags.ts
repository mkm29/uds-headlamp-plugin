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
 * Pure configuration types and helpers for the uds-core plugin.
 *
 * This module has no Headlamp runtime dependency on purpose: the flag logic is
 * the load-bearing part of the feature-flag model (ADR-0004) and must be unit
 * testable in isolation. The ConfigStore instance that persists these values
 * lives in ./config.ts.
 */

/** Per-cluster configuration nested inside the single plugin config blob. */
export interface ClusterFlags {
  /** Enablement per feature id; absence means "use the feature default". */
  features: { [featureId: string]: boolean };
  /** Optional service address (e.g. UDS operator namespace/service). */
  serviceAddress?: string;
  /** Namespace-scoper probe configuration (feature 1). */
  scoper?: ScoperConfig;
}

/**
 * The full plugin configuration.
 *
 * Headlamp's ConfigStore holds one opaque blob per plugin name; the per-cluster
 * nesting here is ours, not a platform feature (see ADR-0004).
 */
export interface UdsFlags {
  autoDetect: boolean;
  clusters: { [cluster: string]: ClusterFlags };
}

/**
 * Defaults applied when storage is empty. Because ConfigStore persists to
 * per-browser local storage, a fresh browser has no config at all, so every
 * read must fall back to these in-code defaults (ADR-0005).
 */
export const DEFAULT_FLAGS: UdsFlags = {
  autoDetect: true,
  clusters: {},
};

/**
 * Resolve whether a feature is enabled for a cluster, falling back to the
 * feature's own default when no per-cluster override exists.
 */
export function isFeatureEnabled(
  cfg: UdsFlags | undefined,
  cluster: string,
  id: string,
  dflt: boolean
): boolean {
  return cfg?.clusters?.[cluster]?.features?.[id] ?? dflt;
}

/** True when at least one of `ids` is enabled for the cluster (default `dflt`). */
export function anyFeatureEnabled(
  cfg: UdsFlags | undefined,
  cluster: string,
  ids: Iterable<string>,
  dflt: boolean
): boolean {
  for (const id of ids) {
    if (isFeatureEnabled(cfg, cluster, id, dflt)) {
      return true;
    }
  }
  return false;
}

/**
 * Return a new UdsFlags with the given feature toggled for one cluster.
 * Immutable: the input and other clusters/features are never mutated.
 */
export function setFeature(
  cfg: UdsFlags | undefined,
  cluster: string,
  id: string,
  enabled: boolean
): UdsFlags {
  const base = cfg ?? DEFAULT_FLAGS;
  const clusterFlags = base.clusters?.[cluster] ?? { features: {} };
  return {
    ...base,
    clusters: {
      ...base.clusters,
      [cluster]: {
        ...clusterFlags,
        features: { ...clusterFlags.features, [id]: enabled },
      },
    },
  };
}

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
