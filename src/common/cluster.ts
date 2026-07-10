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

import { getCluster } from '@kinvolk/headlamp-plugin/lib/Utils';

/**
 * The current cluster name from the URL, or null when none is selected.
 *
 * Note: at plugin-load time (registration) the URL may not yet name a cluster,
 * so callers must treat null defensively — per-cluster gating happens in live
 * filters/guards that re-read the cluster reactively (ADR-0004).
 */
export function currentCluster(): string | null {
  return getCluster();
}
