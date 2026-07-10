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

import { clusterConfigFeature } from './clusterConfig';
import { exemptionsFeature } from './exemptions';
import { namespaceScoperFeature } from './namespaceScoper';
import { packagesFeature } from './packages';
import { policyEngineFeature } from './policyEngine';
import { Feature } from './types';

/**
 * The single source of truth for which features exist (ADR-0003). index.tsx
 * iterates this list to register; the settings page generates a toggle per
 * entry. Adding a feature is: create its folder and add one line here.
 */
export const FEATURES: Feature[] = [
  namespaceScoperFeature,
  packagesFeature,
  exemptionsFeature,
  clusterConfigFeature,
  policyEngineFeature,
];
