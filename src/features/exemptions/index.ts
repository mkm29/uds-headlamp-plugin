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

/** Feature (3): Exemptions CR (exemptions.uds.dev/v1alpha1). */
export const exemptionsFeature: Feature = {
  id: 'exemptions',
  title: 'Exemptions',
  defaultEnabled: true,
  requiresUds: true,
  register() {
    // TODO(phase-3): sidebar + list/detail for exemptions.uds.dev; render each
    // exemption's policies as chips and its matcher; cross-link the exempted
    // policy annotations onto Pod/Service detail views.
  },
};
