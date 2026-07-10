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

/** Feature (1): RBAC namespace scoping. Works without UDS Core. */
export const namespaceScoperFeature: Feature = {
  id: 'namespaceScoper',
  title: 'RBAC namespace scoping',
  defaultEnabled: true,
  register() {
    // TODO(phase-1): migrate the SelfSubjectAccessReview / SelfSubjectRulesReview
    // scoper here — register an app-bar action (or background effect) that scans
    // candidate namespaces as the impersonated user and writes allowedNamespaces.
    // Gate visibility via live config (ADR-0004), not this one-shot call.
  },
};
