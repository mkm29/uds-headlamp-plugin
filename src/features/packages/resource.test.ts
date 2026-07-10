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

// @kinvolk/headlamp-plugin/lib/Crd pulls in the full k8s resource-class graph
// (crd.js -> k8s/index.js -> deployment.js -> replicaSet.js -> KubeObject.js),
// which has a circular-import ordering bug that crashes under Vitest's ESM
// loader ("Class extends value undefined"). It loads fine in the real
// Headlamp app because the host externalizes this module at build time (see
// makeCustomResourceClass in resource.ts), so it's never evaluated by our own
// bundle there. Mock it here so this test file -- which only exercises the
// pure phaseToStatus mapping -- doesn't trip that upstream bug.
vi.mock('@kinvolk/headlamp-plugin/lib/Crd', () => ({
  makeCustomResourceClass: () => class {},
}));

import { phaseToStatus } from './resource';

describe('phaseToStatus', () => {
  it('maps Ready to success', () => {
    expect(phaseToStatus('Ready')).toBe('success');
  });
  it('maps in-progress phases to warning', () => {
    for (const p of ['Pending', 'Retrying', 'Removing']) {
      expect(phaseToStatus(p)).toBe('warning');
    }
  });
  it('maps failure phases to error', () => {
    for (const p of ['Failed', 'RemovalFailed']) {
      expect(phaseToStatus(p)).toBe('error');
    }
  });
  it('maps unknown/undefined to the neutral empty status', () => {
    expect(phaseToStatus(undefined)).toBe('');
    expect(phaseToStatus('Weird')).toBe('');
  });
});
