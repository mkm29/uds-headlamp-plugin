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

import { makeCustomResourceClass } from '@kinvolk/headlamp-plugin/lib/Crd';

/** UDS policy names an Exemption entry can exempt a workload from. */
export type Policy =
  | 'DisallowHostNamespaces'
  | 'DisallowNodePortServices'
  | 'DisallowPrivileged'
  | 'DisallowSELinuxOptions'
  | 'DropAllCapabilities'
  | 'RequireNonRootUser'
  | 'RestrictCapabilities'
  | 'RestrictExternalNames'
  | 'RestrictHostPathWrite'
  | 'RestrictHostPorts'
  | 'RestrictIstioAmbientOverrides'
  | 'RestrictIstioSidecarOverrides'
  | 'RestrictIstioTrafficOverrides'
  | 'RestrictIstioUser'
  | 'RestrictProcMount'
  | 'RestrictSeccomp'
  | 'RestrictSELinuxType'
  | 'RestrictVolumeTypes';

/** Identifies the pod or service an exemption entry applies to. */
export interface ExemptionMatcher {
  kind?: 'pod' | 'service';
  name: string;
  namespace: string;
}

/** A single exemption: what it matches and which policies it exempts. */
export interface ExemptionElement {
  title?: string;
  description?: string;
  matcher: ExemptionMatcher;
  policies: Policy[];
}

/** Exemption spec (exemptions.uds.dev/v1alpha1). No status. */
export interface ExemptionSpec {
  exemptions: ExemptionElement[];
}

/**
 * The Exemption custom resource (exemptions.uds.dev/v1alpha1, namespaced).
 *
 * Imported from the top-level `/lib/Crd` re-export, NOT a deep submodule path
 * (the deep-import landmine).
 */
export const Exemption = makeCustomResourceClass({
  apiInfo: [{ group: 'uds.dev', version: 'v1alpha1' }],
  kind: 'Exemption',
  pluralName: 'exemptions',
  singularName: 'exemption',
  isNamespaced: true,
});

export type ExemptionObject = InstanceType<typeof Exemption>;

/** Read the typed spec off an Exemption instance. Pure accessor. */
export function exemptionSpec(ex: ExemptionObject): ExemptionSpec | undefined {
  return ex.jsonData?.spec as ExemptionSpec | undefined;
}

/** Number of exemption entries in a spec. Pure; undefined/empty -> 0. */
export function countExemptions(spec: ExemptionSpec | undefined): number {
  return spec?.exemptions.length ?? 0;
}

/** Union of every policy across a spec's exemption entries, deduped and sorted. Pure. */
export function distinctPolicies(spec: ExemptionSpec | undefined): Policy[] {
  const policies = new Set<Policy>();
  for (const entry of spec?.exemptions ?? []) {
    for (const policy of entry.policies) {
      policies.add(policy);
    }
  }
  return [...policies].sort();
}
