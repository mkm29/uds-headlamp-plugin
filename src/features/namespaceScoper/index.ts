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
import { applyScope, computeScope, startClusterWatcher } from './scoper';

/** Feature (1): RBAC namespace scoping. Works without UDS Core. */
export const namespaceScoperFeature: Feature = {
  id: 'namespaceScoper',
  title: 'RBAC namespace scoping',
  defaultEnabled: true,
  register() {
    // Registration is one-shot (ADR-0004): always start the watcher; it gates
    // each apply on the live per-cluster enable flag, so toggling the feature
    // off stops scoping on the next tick / reload without needing to
    // conditionally skip registration here.
    startClusterWatcher();

    // On-demand console helpers for operators (filter console on
    // "uds-core:namespace-scoper"):
    //   udsScoperDebug() -> re-probe and print a namespace -> access table
    //   udsScoperApply() -> re-probe and write the namespace filter now
    (window as any).udsScoperDebug = async () => {
      const r = await computeScope();
      // eslint-disable-next-line no-console
      console.table(
        r.probes.map(p => ({
          namespace: p.namespace,
          access: p.allowed ? 'allowed' : 'denied',
          method: p.method,
          detail: p.reason || p.evaluationError || p.error || '',
        }))
      );
      return r;
    };
    (window as any).udsScoperApply = async () => applyScope();
  },
};
