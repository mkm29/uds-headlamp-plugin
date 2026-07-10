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
import { ExemptionDetail } from './Detail';
import { ExemptionsList } from './List';

const FEATURE_ID = 'exemptions';

/** Live read of the enable flag (no hooks -- used inside the sidebar filter). */
function exemptionsEnabled(): boolean {
  const flags = store.get() ?? DEFAULT_FLAGS;
  return isFeatureEnabled(flags, currentCluster() ?? '', FEATURE_ID, true);
}

/** Feature (3): Exemptions CR (exemptions.uds.dev/v1alpha1). */
export const exemptionsFeature: Feature = {
  id: FEATURE_ID,
  title: 'Exemptions',
  defaultEnabled: true,
  requiresUds: true,
  register() {
    // Shared UDS Core parent -- idempotent (sidebar entries keyed by name).
    registerSidebarEntry({
      parent: null,
      name: 'uds-core',
      label: 'UDS Core',
      url: '/uds-core/exemptions',
      icon: 'mdi:package-variant-closed',
    });
    registerSidebarEntry({
      parent: 'uds-core',
      name: 'uds-exemptions',
      label: 'Exemptions',
      url: '/uds-core/exemptions',
    });

    registerRoute({
      path: '/uds-core/exemptions',
      sidebar: 'uds-exemptions',
      name: 'uds-exemptions',
      exact: true,
      component: () => <ExemptionsList />,
    });
    registerRoute({
      path: '/uds-core/exemptions/:namespace/:name',
      sidebar: 'uds-exemptions',
      name: 'uds-exemption-detail',
      exact: true,
      component: () => <ExemptionDetail />,
    });

    // Gate ONLY our own child; the shared parent is owned collectively.
    registerSidebarEntryFilter(entry =>
      entry.name === 'uds-exemptions' && !exemptionsEnabled() ? null : entry
    );
  },
};
