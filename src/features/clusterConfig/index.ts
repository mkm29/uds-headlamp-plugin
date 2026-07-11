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

import { Feature } from '../types';

/** Feature (4): ClusterConfig singleton (clusterconfig.uds.dev/v1alpha1). */
export const clusterConfigFeature: Feature = {
  id: 'clusterConfig',
  title: 'Cluster Config',
  defaultEnabled: true,
  register() {
    // TODO(phase-3): single route + sidebar entry rendering the read-only
    // uds-cluster-config singleton (attributes, expose, networking, caBundle
    // flags, policy). No list view needed.
  },
};
