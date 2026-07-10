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
import { countExemptions, distinctPolicies, Exemption, ExemptionObject, exemptionSpec } from './resource';

const { ResourceListView } = CommonComponents;

export function ExemptionsList() {
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
      title="UDS Exemptions"
      resourceClass={Exemption}
      columns={[
        'name',
        'namespace',
        {
          id: 'exemptions',
          label: 'Exemptions',
          getValue: (ex: ExemptionObject) => countExemptions(exemptionSpec(ex)),
        },
        {
          id: 'policies',
          label: 'Policies',
          getValue: (ex: ExemptionObject) => distinctPolicies(exemptionSpec(ex)).length,
        },
        'age',
      ]}
    />
  );
}
