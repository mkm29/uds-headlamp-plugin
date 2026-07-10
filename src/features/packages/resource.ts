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

/** Package phases from status.phase (UDS operator, v1alpha1). */
export type PackagePhase =
  | 'Pending'
  | 'Ready'
  | 'Failed'
  | 'Retrying'
  | 'Removing'
  | 'RemovalFailed';

/** Colors accepted by Headlamp's StatusLabel component. */
export type StatusKind = 'success' | 'warning' | 'error' | '';

/** Map a Package status.phase to a StatusLabel color. Pure; unknown -> ''. */
export function phaseToStatus(phase: string | undefined): StatusKind {
  switch (phase) {
    case 'Ready':
      return 'success';
    case 'Pending':
    case 'Retrying':
    case 'Removing':
      return 'warning';
    case 'Failed':
    case 'RemovalFailed':
      return 'error';
    default:
      return '';
  }
}

/**
 * The Package custom resource (packages.uds.dev/v1alpha1, namespaced).
 *
 * Imported from the top-level `/lib/Crd` re-export, NOT a deep submodule path
 * (the deep-import landmine).
 */
export const Package = makeCustomResourceClass({
  apiInfo: [{ group: 'uds.dev', version: 'v1alpha1' }],
  kind: 'Package',
  pluralName: 'packages',
  singularName: 'package',
  isNamespaced: true,
});
