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

import { registerRoute, registerSidebarEntry, registerSidebarEntryFilter } from '@kinvolk/headlamp-plugin/lib';
import { currentCluster } from '../../common/cluster';
import { store } from '../../settings/config';
import { DEFAULT_FLAGS, isFeatureEnabled } from '../../settings/flags';
import { Feature } from '../types';
import { PackageDetail } from './Detail';
import { PackagesList } from './List';

const FEATURE_ID = 'packages';

/** Live read of the enable flag from the current store snapshot (no hooks). */
function packagesEnabled(): boolean {
  const flags = store.get() ?? DEFAULT_FLAGS;
  return isFeatureEnabled(flags, currentCluster() ?? '', FEATURE_ID, true);
}

/** Feature (2): UDS Packages CR (packages.uds.dev/v1alpha1). */
export const packagesFeature: Feature = {
  id: FEATURE_ID,
  title: 'UDS Packages',
  defaultEnabled: true,
  requiresUds: true,
  register() {
    // Registration is one-shot (ADR-0004): always register the sidebar entries
    // and route; visibility is gated live by the filter below (and by the
    // !hasUds guard inside PackagesList), not by skipping registration here.
    registerSidebarEntry({
      parent: null,
      name: 'uds-core',
      label: 'UDS Core',
      url: '/uds-core/packages',
      icon: 'mdi:package-variant-closed',
    });
    registerSidebarEntry({
      parent: 'uds-core',
      name: 'uds-packages',
      label: 'Packages',
      url: '/uds-core/packages',
    });

    registerRoute({
      path: '/uds-core/packages',
      sidebar: 'uds-packages',
      name: 'uds-packages',
      exact: true,
      component: () => <PackagesList />,
    });
    registerRoute({
      path: '/uds-core/packages/:namespace/:name',
      sidebar: 'uds-packages',
      name: 'uds-package-detail',
      exact: true,
      component: () => <PackageDetail />,
    });

    // Hide the UDS Core sidebar tree when the feature is toggled off (live).
    registerSidebarEntryFilter(entry =>
      (entry.name === 'uds-core' || entry.name === 'uds-packages') && !packagesEnabled() ? null : entry
    );
  },
};
