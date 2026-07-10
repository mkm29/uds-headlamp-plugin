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
