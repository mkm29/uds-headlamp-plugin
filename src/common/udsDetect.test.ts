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

import { UDS_GROUP, udsCrdNames, udsGroupsFromCrds } from './udsDetect';

describe('udsGroupsFromCrds', () => {
  it('collects distinct spec.group values', () => {
    const crds = [
      { spec: { group: 'uds.dev' } },
      { spec: { group: 'uds.dev' } },
      { spec: { group: 'cert-manager.io' } },
    ];
    expect(udsGroupsFromCrds(crds)).toEqual(new Set(['uds.dev', 'cert-manager.io']));
  });

  it('is empty and never throws for null (RBAC-denied list)', () => {
    expect(udsGroupsFromCrds(null)).toEqual(new Set());
  });

  it('skips entries missing spec.group', () => {
    const crds = [{ spec: {} }, {}, { spec: { group: 'uds.dev' } }] as any;
    expect(udsGroupsFromCrds(crds)).toEqual(new Set([UDS_GROUP]));
  });
});

describe('udsCrdNames', () => {
  it('collects the names of uds.dev CRDs only', () => {
    const crds = [
      { metadata: { name: 'packages.uds.dev' }, spec: { group: 'uds.dev' } },
      { metadata: { name: 'exemptions.uds.dev' }, spec: { group: 'uds.dev' } },
      { metadata: { name: 'certificates.cert-manager.io' }, spec: { group: 'cert-manager.io' } },
    ];
    expect(udsCrdNames(crds)).toEqual(new Set(['packages.uds.dev', 'exemptions.uds.dev']));
  });

  it('is empty and never throws for null (RBAC-denied list)', () => {
    expect(udsCrdNames(null)).toEqual(new Set());
  });

  it('skips uds.dev CRDs missing a metadata.name', () => {
    const crds = [{ spec: { group: 'uds.dev' } }, { metadata: {}, spec: { group: 'uds.dev' } }] as any;
    expect(udsCrdNames(crds)).toEqual(new Set());
  });
});
