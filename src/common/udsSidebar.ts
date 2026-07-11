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
  registerRouteFilter,
  registerSidebarEntry,
  registerSidebarEntryFilter,
} from '@kinvolk/headlamp-plugin/lib';
import { store } from '../settings/config';
import { anyFeatureEnabled, DEFAULT_FLAGS, isFeatureEnabled } from '../settings/flags';
import { currentCluster } from './cluster';

const UDS_CORE = 'uds-core';

/** Feature ids that contribute a child under the UDS Core parent. Populated as
 *  features call registerUdsCoreChild() at load, before any filter runs. */
const childFeatureIds = new Set<string>();
let parentRegistered = false;

function liveCluster(): string {
  return currentCluster() ?? '';
}

/** Register a feature's child under the shared "UDS Core" sidebar parent.
 *  Registers the parent once (idempotent) with a filter that hides it only when
 *  no child feature is enabled, then registers this child and a filter gating it
 *  on its own feature flag. Features must NOT register the parent themselves. */
export function registerUdsCoreChild(opts: {
  featureId: string;
  name: string;
  label: string;
  url: string;
  icon?: string;
}): void {
  childFeatureIds.add(opts.featureId);

  if (!parentRegistered) {
    parentRegistered = true;
    // Parent url points at the first-registered child's url (manifest order).
    registerSidebarEntry({
      parent: null,
      name: UDS_CORE,
      label: 'UDS Core',
      url: opts.url,
      icon: 'mdi:hexagon-multiple',
    });
    // Hide the shared parent only when NO child feature is enabled.
    registerSidebarEntryFilter(entry =>
      entry.name === UDS_CORE &&
      !anyFeatureEnabled(store.get() ?? DEFAULT_FLAGS, liveCluster(), childFeatureIds, true)
        ? null
        : entry
    );
  }

  registerSidebarEntry({
    parent: UDS_CORE,
    name: opts.name,
    label: opts.label,
    url: opts.url,
    icon: opts.icon,
  });
  // Gate this child on its own feature flag (live).
  registerSidebarEntryFilter(entry =>
    entry.name === opts.name &&
    !isFeatureEnabled(store.get() ?? DEFAULT_FLAGS, liveCluster(), opts.featureId, true)
      ? null
      : entry
  );
  // Gate this feature's routes on the same flag, so a disabled feature's page is
  // not reachable by direct URL (matches the hidden sidebar entry). The feature's
  // routes all register with `sidebar: opts.name`, so match on that.
  registerRouteFilter(route =>
    route.sidebar === opts.name &&
    !isFeatureEnabled(store.get() ?? DEFAULT_FLAGS, liveCluster(), opts.featureId, true)
      ? null
      : route
  );
}
