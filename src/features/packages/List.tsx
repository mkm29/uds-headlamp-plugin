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

import { CommonComponents } from '@kinvolk/headlamp-plugin/lib';
import { useUdsDetect } from '../../common/udsDetect';
import { UdsNotDetected } from '../../common/UdsNotDetected';
import { Package, PackageObject, packageStatus, phaseToStatus } from './resource';

const { Link, ResourceListView, StatusLabel } = CommonComponents;

/** Count helper: length of a status array field, 0 when absent. */
function count(v: unknown): number {
  return Array.isArray(v) ? v.length : 0;
}

export function PackagesList() {
  const { hasUds } = useUdsDetect();

  if (!hasUds) {
    return <UdsNotDetected />;
  }

  return (
    <ResourceListView
      title="UDS Packages"
      resourceClass={Package}
      columns={[
        {
          id: 'name',
          label: 'Name',
          getValue: (pkg: PackageObject) => pkg.getName(),
          render: (pkg: PackageObject) => (
            <Link
              routeName="uds-package-detail"
              params={{ namespace: pkg.getNamespace() ?? '', name: pkg.getName() }}
            >
              {pkg.getName()}
            </Link>
          ),
        },
        'namespace',
        {
          id: 'status',
          label: 'Status',
          getValue: (pkg: PackageObject) => packageStatus(pkg)?.phase ?? '',
          render: (pkg: PackageObject) => (
            <StatusLabel status={phaseToStatus(packageStatus(pkg)?.phase)}>
              {packageStatus(pkg)?.phase ?? 'Unknown'}
            </StatusLabel>
          ),
        },
        {
          id: 'sso',
          label: 'SSO Clients',
          getValue: (pkg: PackageObject) => count(packageStatus(pkg)?.ssoClients),
        },
        {
          id: 'endpoints',
          label: 'Endpoints',
          getValue: (pkg: PackageObject) => count(packageStatus(pkg)?.endpoints),
        },
        {
          id: 'monitors',
          label: 'Monitors',
          getValue: (pkg: PackageObject) => count(packageStatus(pkg)?.monitors),
        },
        {
          id: 'probes',
          label: 'Probes',
          getValue: (pkg: PackageObject) => count(packageStatus(pkg)?.probes),
        },
        {
          id: 'netpol',
          label: 'Network Policies',
          getValue: (pkg: PackageObject) => packageStatus(pkg)?.networkPolicyCount ?? 0,
        },
        {
          id: 'authpol',
          label: 'Authorization Policies',
          getValue: (pkg: PackageObject) => packageStatus(pkg)?.authorizationPolicyCount ?? 0,
        },
        'age',
      ]}
    />
  );
}
