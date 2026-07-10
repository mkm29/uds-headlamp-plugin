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
// pure countExemptions/distinctPolicies helpers -- doesn't trip that upstream
// bug.
vi.mock('@kinvolk/headlamp-plugin/lib/Crd', () => ({
  makeCustomResourceClass: () => class {},
}));

import { countExemptions, distinctPolicies, ExemptionSpec } from './resource';

const spec: ExemptionSpec = {
  exemptions: [
    {
      matcher: { name: 'a.*', namespace: 'ns1', kind: 'pod' },
      policies: ['DisallowPrivileged', 'RequireNonRootUser'],
    },
    {
      matcher: { name: 'b.*', namespace: 'ns2' },
      policies: ['RequireNonRootUser', 'RestrictVolumeTypes'],
    },
  ],
};

describe('countExemptions', () => {
  it('counts entries', () => expect(countExemptions(spec)).toBe(2));
  it('is 0 for undefined/empty', () => {
    expect(countExemptions(undefined)).toBe(0);
    expect(countExemptions({ exemptions: [] })).toBe(0);
  });
});

describe('distinctPolicies', () => {
  it('unions and sorts policies across entries, deduped', () => {
    expect(distinctPolicies(spec)).toEqual([
      'DisallowPrivileged',
      'RequireNonRootUser',
      'RestrictVolumeTypes',
    ]);
  });
  it('sorts alphabetically regardless of insertion order', () => {
    // Insertion order here (RestrictVolumeTypes, DisallowPrivileged) is the
    // reverse of the sorted order, so this fails if `.sort()` is ever dropped.
    const unordered: ExemptionSpec = {
      exemptions: [
        { matcher: { name: 'z', namespace: 'ns' }, policies: ['RestrictVolumeTypes'] },
        { matcher: { name: 'a', namespace: 'ns' }, policies: ['DisallowPrivileged'] },
      ],
    };
    expect(distinctPolicies(unordered)).toEqual(['DisallowPrivileged', 'RestrictVolumeTypes']);
  });
  it('is [] for undefined', () => expect(distinctPolicies(undefined)).toEqual([]));
});
