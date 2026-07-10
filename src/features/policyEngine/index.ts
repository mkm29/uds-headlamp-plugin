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

/** Feature (5): Pepr policy engine catalog + health. No dedicated CRD. */
export const policyEngineFeature: Feature = {
  id: 'policyEngine',
  title: 'Policy Engine (Pepr)',
  defaultEnabled: true,
  requiresUds: true,
  register() {
    // TODO(phase-3): a static catalog of the mutations + validations keyed to a
    // UDS version, a live pepr-uds-core / watcher health section, and workload
    // cross-links showing per-object exemption annotations.
  },
};
