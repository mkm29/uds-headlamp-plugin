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
