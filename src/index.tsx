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

import { registerPluginSettings } from '@kinvolk/headlamp-plugin/lib';
import { currentCluster } from './common/cluster';
import { FEATURES } from './features/manifest';
import { store } from './settings/config';
import { DEFAULT_FLAGS, isFeatureEnabled } from './settings/flags';
import { Settings } from './settings/Settings';

// Register the unified settings page with Headlamp's Save button (ADR-0005).
registerPluginSettings('uds-core', Settings, true);

// Registration is one-shot at load (ADR-0004): read a snapshot of the flags and
// let each feature register itself. Features register unconditionally and gate
// their own visibility with live filters/guards, so a disabled feature is
// hidden rather than skipped here.
const flags = store.get() ?? DEFAULT_FLAGS;
const cluster = currentCluster() ?? '';

for (const feature of FEATURES) {
  const enabled = isFeatureEnabled(flags, cluster, feature.id, feature.defaultEnabled);
  feature.register({ enabled });
}
