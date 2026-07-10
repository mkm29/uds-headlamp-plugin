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
import { Box, Typography } from '@mui/material';
import { useUdsDetect } from '../../common/udsDetect';
import { Package, phaseToStatus } from './resource';

const { ResourceListView, StatusLabel } = CommonComponents;

/** Count helper: length of a status array field, 0 when absent. */
function count(v: unknown): number {
  return Array.isArray(v) ? v.length : 0;
}

export function PackagesList() {
  const { hasUds } = useUdsDetect();

  if (!hasUds) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography>UDS Core not detected in this cluster.</Typography>
      </Box>
    );
  }

  return (
    <ResourceListView
      title="UDS Packages"
      resourceClass={Package}
      columns={[
        'name',
        'namespace',
        {
          id: 'status',
          label: 'Status',
          getValue: (pkg: any) => pkg.status?.phase ?? '',
          render: (pkg: any) => (
            <StatusLabel status={phaseToStatus(pkg.status?.phase)}>
              {pkg.status?.phase ?? 'Unknown'}
            </StatusLabel>
          ),
        },
        { id: 'sso', label: 'SSO Clients', getValue: (pkg: any) => count(pkg.status?.ssoClients) },
        { id: 'endpoints', label: 'Endpoints', getValue: (pkg: any) => count(pkg.status?.endpoints) },
        { id: 'monitors', label: 'Monitors', getValue: (pkg: any) => count(pkg.status?.monitors) },
        { id: 'probes', label: 'Probes', getValue: (pkg: any) => count(pkg.status?.probes) },
        { id: 'netpol', label: 'Network Policies', getValue: (pkg: any) => pkg.status?.networkPolicyCount ?? 0 },
        {
          id: 'authpol',
          label: 'Authorization Policies',
          getValue: (pkg: any) => pkg.status?.authorizationPolicyCount ?? 0,
        },
        'age',
      ]}
    />
  );
}
