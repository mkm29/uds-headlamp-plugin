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

import { K8s, PluginSettingsDetailsProps } from '@kinvolk/headlamp-plugin/lib';
import {
  Box,
  Button,
  FormControlLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { currentCluster } from '../common/cluster';
import { useUdsDetect } from '../common/udsDetect';
import { FEATURES } from '../features/manifest';
import {
  DEFAULT_FLAGS,
  getScoperConfig,
  isFeatureEnabled,
  ProbeStrategy,
  setFeature,
  setScoperConfig,
  UdsFlags,
} from './flags';

/**
 * Plugin settings page (registered at /settings/plugins/uds-core).
 *
 * Mirrors the built-in Prometheus plugin pattern (ADR-0005): an Auto-detect
 * toggle, a cluster selector, per-feature toggles generated from the manifest,
 * and a Test/Detect action. Rendered with Headlamp's Save button, so edits are
 * persisted on Save and structural changes take effect on the next reload.
 */
export function Settings(props: PluginSettingsDetailsProps) {
  const { data, onDataChange } = props;
  // Headlamp keeps settings schema-opaque; cast at the boundary and rely on
  // in-code defaults so an empty store still yields a working config.
  const flags = (data as UdsFlags | undefined) ?? DEFAULT_FLAGS;

  const clustersConf = K8s.useClustersConf() || {};
  const clusterNames = Object.keys(clustersConf);
  const [cluster, setCluster] = useState<string>(
    currentCluster() || clusterNames[0] || ''
  );

  const detect = useUdsDetect();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 640 }}>
      <FormControlLabel
        control={
          <Switch
            checked={flags.autoDetect ?? true}
            onChange={e => onDataChange?.({ ...flags, autoDetect: e.target.checked })}
          />
        }
        label="Auto-detect UDS Core"
      />

      <Box>
        <Typography variant="subtitle2" gutterBottom>
          Cluster
        </Typography>
        <Select
          size="small"
          value={cluster}
          displayEmpty
          onChange={e => setCluster(e.target.value as string)}
        >
          {clusterNames.length === 0 && (
            <MenuItem value="">
              <em>No clusters</em>
            </MenuItem>
          )}
          {clusterNames.map(name => (
            <MenuItem key={name} value={name}>
              {name}
            </MenuItem>
          ))}
        </Select>
      </Box>

      <Box>
        <Typography variant="subtitle2" gutterBottom>
          Features
        </Typography>
        {FEATURES.map(feature => (
          <Box key={feature.id}>
            <FormControlLabel
              label={feature.title}
              control={
                <Switch
                  checked={isFeatureEnabled(flags, cluster, feature.id, feature.defaultEnabled)}
                  onChange={e =>
                    onDataChange?.(setFeature(flags, cluster, feature.id, e.target.checked))
                  }
                />
              }
            />
          </Box>
        ))}
      </Box>

      <Box>
        <Typography variant="subtitle2" gutterBottom>
          Namespace scoping (probe)
        </Typography>
        {(() => {
          const scoper = getScoperConfig(flags, cluster);
          const patch = (p: Partial<typeof scoper>) =>
            onDataChange?.(setScoperConfig(flags, cluster, p));
          return (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                <TextField
                  size="small"
                  label="Verb"
                  value={scoper.verb}
                  onChange={e => patch({ verb: e.target.value })}
                />
                <TextField
                  size="small"
                  label="Group"
                  placeholder="(core)"
                  value={scoper.group}
                  onChange={e => patch({ group: e.target.value })}
                />
                <TextField
                  size="small"
                  label="Resource"
                  value={scoper.resource}
                  onChange={e => patch({ resource: e.target.value })}
                />
                <TextField
                  size="small"
                  label="Subresource"
                  value={scoper.subresource}
                  onChange={e => patch({ subresource: e.target.value })}
                />
              </Box>
              <Box>
                <Typography variant="body2" gutterBottom>
                  Strategy
                </Typography>
                <Select
                  size="small"
                  value={scoper.strategy}
                  onChange={e => patch({ strategy: e.target.value as ProbeStrategy })}
                >
                  <MenuItem value="candidates">Candidate list</MenuItem>
                  <MenuItem value="list-all">List all namespaces</MenuItem>
                </Select>
              </Box>
              {scoper.strategy === 'list-all' && (
                <TextField
                  size="small"
                  label="Label selector"
                  placeholder="e.g. kubernetes.io/metadata.name"
                  value={scoper.labelSelector}
                  onChange={e => patch({ labelSelector: e.target.value })}
                />
              )}
            </Box>
          );
        })()}
      </Box>

      <TextField
        size="small"
        label="UDS operator namespace"
        placeholder="uds-policy-exemptions"
        // TODO(phase-2): persist per-cluster into flags.clusters[cluster].serviceAddress.
      />

      <Box>
        <Button variant="outlined" onClick={() => undefined}>
          Test / Detect UDS Core
        </Button>
        <Typography variant="body2" sx={{ mt: 1 }}>
          {detect.hasUds
            ? 'UDS Core detected.'
            : 'UDS Core not detected (scaffold placeholder).'}
        </Typography>
      </Box>
    </Box>
  );
}
