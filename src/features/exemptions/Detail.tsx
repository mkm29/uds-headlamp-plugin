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
import { Box, Chip } from '@mui/material';
import { useParams } from 'react-router-dom';
import {
  countExemptions,
  distinctPolicies,
  Exemption,
  ExemptionElement,
  ExemptionObject,
  exemptionSpec,
} from './resource';

const { DetailsGrid, SectionBox, NameValueTable } = CommonComponents;

export function ExemptionDetail() {
  const { namespace, name } = useParams<{ namespace: string; name: string }>();

  return (
    <DetailsGrid
      resourceType={Exemption}
      name={name}
      namespace={namespace}
      withEvents
      extraInfo={(ex: ExemptionObject | null) => {
        const spec = ex ? exemptionSpec(ex) : undefined;
        return (
          ex && [
            { name: 'Exemptions', value: String(countExemptions(spec)) },
            { name: 'Distinct Policies', value: String(distinctPolicies(spec).length) },
          ]
        );
      }}
      extraSections={(ex: ExemptionObject | null) => {
        if (!ex) {
          return [];
        }
        const spec = exemptionSpec(ex);
        return (spec?.exemptions ?? []).map((e: ExemptionElement, i: number) => ({
          id: `uds-exemption-${i}`,
          section: (
            <SectionBox title={e.title || `Exemption ${i + 1}`}>
              <NameValueTable
                rows={[
                  { name: 'Description', value: e.description || '-' },
                  { name: 'Matcher Kind', value: e.matcher?.kind || 'any' },
                  { name: 'Matcher Name', value: e.matcher?.name || '-' },
                  { name: 'Matcher Namespace', value: e.matcher?.namespace || '-' },
                  {
                    name: 'Policies',
                    value: (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {(e.policies ?? []).map(p => (
                          <Chip key={p} size="small" label={p} />
                        ))}
                      </Box>
                    ),
                  },
                ]}
              />
            </SectionBox>
          ),
        }));
      }}
    />
  );
}
