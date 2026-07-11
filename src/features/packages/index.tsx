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

import { registerRoute } from '@kinvolk/headlamp-plugin/lib';
import { registerUdsCoreChild } from '../../common/udsSidebar';
import { Feature } from '../types';
import { PackageDetail } from './Detail';
import { PackagesList } from './List';

const FEATURE_ID = 'packages';

/** Feature (2): UDS Packages CR (packages.uds.dev/v1alpha1). */
export const packagesFeature: Feature = {
  id: FEATURE_ID,
  title: 'UDS Packages',
  defaultEnabled: true,
  requiresUds: true,
  register() {
    registerUdsCoreChild({
      featureId: FEATURE_ID,
      name: 'uds-packages',
      label: 'Packages',
      url: '/uds-core/packages',
      icon: 'mdi:package-variant-closed',
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
  },
};
