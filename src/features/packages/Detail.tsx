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
import { useParams } from 'react-router-dom';
import {
  AllowRule,
  AuthserviceClient,
  ExposeEntry,
  MonitorEntry,
  Package,
  PackageObject,
  packageSpec,
  packageStatus,
  phaseToStatus,
  SsoClient,
} from './resource';

const { DetailsGrid, StatusLabel, ConditionsTable, SectionBox, SimpleTable } = CommonComponents;

/** Render a string[] as a simple list, or a muted dash when empty. */
function NameList({ items }: { items?: string[] }) {
  if (!items || items.length === 0) {
    return <Typography color="textSecondary">-</Typography>;
  }
  return (
    <Box component="ul" sx={{ m: 0, pl: 2 }}>
      {items.map(i => (
        <li key={i}>{i}</li>
      ))}
    </Box>
  );
}

export function PackageDetail() {
  const { namespace, name } = useParams<{ namespace: string; name: string }>();

  return (
    <DetailsGrid
      resourceType={Package}
      name={name}
      namespace={namespace}
      withEvents
      extraInfo={(pkg: PackageObject | null) => {
        const s = pkg ? packageStatus(pkg) : undefined;
        return (
          pkg && [
            {
              name: 'Status',
              value: <StatusLabel status={phaseToStatus(s?.phase)}>{s?.phase ?? 'Unknown'}</StatusLabel>,
            },
            { name: 'Mesh Mode', value: s?.meshMode ?? '-' },
            { name: 'Observed Generation', value: s?.observedGeneration === undefined ? '-' : String(s.observedGeneration) },
            { name: 'Retry Attempt', value: s?.retryAttempt === undefined ? '-' : String(s.retryAttempt) },
            { name: 'Network Policies', value: String(s?.networkPolicyCount ?? 0) },
            { name: 'Authorization Policies', value: String(s?.authorizationPolicyCount ?? 0) },
          ]
        );
      }}
      extraSections={(pkg: PackageObject | null) => {
        if (!pkg) {
          return [];
        }
        const s = packageStatus(pkg);
        const spec = packageSpec(pkg);
        return [
          { id: 'uds-endpoints', section: (<SectionBox title="Endpoints"><NameList items={s?.endpoints} /></SectionBox>) },
          { id: 'uds-sso-clients', section: (<SectionBox title="SSO Clients"><NameList items={s?.ssoClients} /></SectionBox>) },
          {
            id: 'uds-authservice',
            section: (
              <SectionBox title="Authservice Clients">
                <SimpleTable
                  emptyMessage="None"
                  columns={[
                    { label: 'Client ID', getter: (c: AuthserviceClient) => c.clientId },
                    {
                      label: 'Selector',
                      getter: (c: AuthserviceClient) =>
                        Object.entries(c.selector ?? {}).map(([k, v]) => `${k}=${v}`).join(', ') || '-',
                    },
                  ]}
                  data={s?.authserviceClients ?? []}
                />
              </SectionBox>
            ),
          },
          { id: 'uds-monitors', section: (<SectionBox title="Monitors"><NameList items={s?.monitors} /></SectionBox>) },
          { id: 'uds-probes', section: (<SectionBox title="Probes"><NameList items={s?.probes} /></SectionBox>) },
          {
            id: 'uds-expose',
            section: (
              <SectionBox title="Exposed Services (spec.network.expose)">
                <SimpleTable
                  emptyMessage="None"
                  columns={[
                    { label: 'Host', getter: (e: ExposeEntry) => e.host },
                    { label: 'Gateway', getter: (e: ExposeEntry) => e.gateway ?? 'tenant' },
                    { label: 'Service', getter: (e: ExposeEntry) => e.service ?? '-' },
                    { label: 'Port', getter: (e: ExposeEntry) => (e.port === undefined ? '-' : String(e.port)) },
                    { label: 'Target Port', getter: (e: ExposeEntry) => (e.targetPort === undefined ? '-' : String(e.targetPort)) },
                  ]}
                  data={spec?.network?.expose ?? []}
                />
              </SectionBox>
            ),
          },
          {
            id: 'uds-allow',
            section: (
              <SectionBox title="Network Allow Rules (spec.network.allow)">
                <SimpleTable
                  emptyMessage="None"
                  columns={[
                    { label: 'Direction', getter: (a: AllowRule) => a.direction },
                    { label: 'Remote', getter: (a: AllowRule) => a.remoteGenerated ?? a.remoteNamespace ?? a.remoteCidr ?? a.remoteHost ?? '-' },
                    { label: 'Ports', getter: (a: AllowRule) => (a.ports ?? (a.port !== undefined ? [a.port] : [])).join(', ') || '-' },
                    { label: 'Description', getter: (a: AllowRule) => a.description ?? '-' },
                  ]}
                  data={spec?.network?.allow ?? []}
                />
              </SectionBox>
            ),
          },
          {
            id: 'uds-sso-config',
            section: (
              <SectionBox title="SSO Client Configuration (spec.sso)">
                <SimpleTable
                  emptyMessage="None"
                  columns={[
                    { label: 'Client ID', getter: (c: SsoClient) => c.clientId },
                    { label: 'Name', getter: (c: SsoClient) => c.name },
                    { label: 'Protocol', getter: (c: SsoClient) => c.protocol ?? 'openid-connect' },
                    { label: 'Enabled', getter: (c: SsoClient) => (c.enabled === false ? 'No' : 'Yes') },
                    { label: 'Redirect URIs', getter: (c: SsoClient) => (c.redirectUris ?? []).join(', ') || '-' },
                    { label: 'Groups', getter: (c: SsoClient) => (c.groups?.anyOf ?? []).join(', ') || '-' },
                  ]}
                  data={spec?.sso ?? []}
                />
              </SectionBox>
            ),
          },
          {
            id: 'uds-monitor-config',
            section: (
              <SectionBox title="Monitor Configuration (spec.monitor)">
                <SimpleTable
                  emptyMessage="None"
                  columns={[
                    { label: 'Kind', getter: (m: MonitorEntry) => m.kind ?? 'ServiceMonitor' },
                    { label: 'Port Name', getter: (m: MonitorEntry) => m.portName },
                    { label: 'Target Port', getter: (m: MonitorEntry) => String(m.targetPort) },
                    { label: 'Path', getter: (m: MonitorEntry) => m.path ?? '/metrics' },
                  ]}
                  data={spec?.monitor ?? []}
                />
              </SectionBox>
            ),
          },
          {
            id: 'uds-cabundle',
            section: (
              <SectionBox title="CA Bundle">
                <Typography>
                  {spec?.caBundle?.configMap?.name
                    ? `From ConfigMap ${spec.caBundle.configMap.name}` +
                      (spec.caBundle.configMap.key ? ` (key ${spec.caBundle.configMap.key})` : '')
                    : 'None'}
                </Typography>
              </SectionBox>
            ),
          },
          { id: 'uds-conditions', section: (<SectionBox title="Conditions"><ConditionsTable resource={pkg.jsonData} /></SectionBox>) },
        ];
      }}
    />
  );
}
