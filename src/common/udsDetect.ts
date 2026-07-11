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

import { K8s } from '@kinvolk/headlamp-plugin/lib';

/** Result of UDS Core detection. */
export interface UdsDetectResult {
  /** True when the uds.dev CRD group is present in the cluster. */
  hasUds: boolean;
  /** The set of CRD API groups observed. */
  groups: Set<string>;
  /** The names of uds.dev CRDs present (e.g. "packages.uds.dev"). */
  crdNames: Set<string>;
}

/** The CRD API group shared by Packages, Exemptions, and ClusterConfig. */
export const UDS_GROUP = 'uds.dev';

/** The UDS Core CRDs we expect, by name — used to report detection detail. */
export const UDS_CRDS = ['packages.uds.dev', 'exemptions.uds.dev', 'clusterconfig.uds.dev'];

/** The Pepr policy-engine deployment that enforces UDS policies. */
export const PEPR_DEPLOYMENT = 'pepr-uds-core';
export const PEPR_NAMESPACE = 'pepr-system';

/** Pure: reduce a CRD list to the set of API groups present. Null-safe (RBAC-denied). */
export function udsGroupsFromCrds(crds: Array<{ spec?: { group?: string } }> | null): Set<string> {
  const groups = new Set<string>();
  for (const c of crds ?? []) {
    const g = c?.spec?.group;
    if (g) {
      groups.add(g);
    }
  }
  return groups;
}

/** Pure: the names of CRDs in the uds.dev group. Null-safe (RBAC-denied). */
export function udsCrdNames(
  crds: Array<{ metadata?: { name?: string }; spec?: { group?: string } }> | null
): Set<string> {
  const names = new Set<string>();
  for (const c of crds ?? []) {
    if (c?.spec?.group === UDS_GROUP && c?.metadata?.name) {
      names.add(c.metadata.name);
    }
  }
  return names;
}

/**
 * Detect whether UDS Core is installed in the current cluster. Reads are
 * impersonated, so a user lacking `list customresourcedefinitions` gets an
 * empty list -> hasUds:false ("unknown" treated as "not detected", ADR-0004).
 */
export function useUdsDetect(): UdsDetectResult {
  const [crds] = K8s.ResourceClasses.CustomResourceDefinition.useList();
  const list = crds as Array<{ metadata?: { name?: string }; spec?: { group?: string } }> | null;
  const groups = udsGroupsFromCrds(list);
  return { hasUds: groups.has(UDS_GROUP), groups, crdNames: udsCrdNames(list) };
}

/**
 * Detect the Pepr policy-engine deployment (pepr-uds-core in pepr-system).
 * RBAC-graceful: absence, or a user who cannot get it, yields false.
 */
export function usePeprDetected(): boolean {
  const [deploy] = K8s.ResourceClasses.Deployment.useGet(PEPR_DEPLOYMENT, PEPR_NAMESPACE);
  return !!deploy;
}
