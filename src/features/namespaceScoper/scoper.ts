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

import { ApiProxy } from '@kinvolk/headlamp-plugin/lib';
import { currentCluster } from '../../common/cluster';
import { store } from '../../settings/config';
import { getScoperConfig, isFeatureEnabled, ScoperConfig } from '../../settings/flags';
import {
  computeAllowedFromProbes,
  isValidNamespace,
  parseCsv,
  ProbeResult,
  ResourceAttributes,
  ResourceRule,
  ruleAllows,
  selfSubjectAccessReviewBody,
  selfSubjectRulesReviewBody,
  ssrrConclusive,
} from './probe';

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

const FEATURE_ID = 'namespaceScoper';

/** Load Headlamp's per-cluster settings from localStorage (the key it uses). */
function loadClusterSettings(clusterName: string): Record<string, any> {
  if (!clusterName) {
    return {};
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(`cluster_settings.${clusterName}`) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
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
    if (ssrrConclusive(status)) {
      return {
        namespace,
        allowed: ruleAllows(status.resourceRules as ResourceRule[], attrs),
        method: 'ssrr',
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
  // Re-read the active cluster AFTER the async probe phase. computeScope captured
  // its cluster before probing, so comparing against result.cluster cannot detect a
  // switch that happened DURING probing; re-reading currentCluster() here can.
  const clusterAfterProbe = currentCluster();
  if (clusterAfterProbe !== cluster) {
    log.warn(
      `applyScope: active cluster changed during probe (was "${cluster}", now "${clusterAfterProbe}"); skipping write`
    );
    return result;
  }
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
