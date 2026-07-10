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

import { DEFAULT_FLAGS, isFeatureEnabled, setFeature, UdsFlags } from './flags';

describe('flags', () => {
  it('falls back to the provided default when no override exists', () => {
    expect(isFeatureEnabled(undefined, 'c1', 'packages', true)).toBe(true);
    expect(isFeatureEnabled(DEFAULT_FLAGS, 'c1', 'packages', false)).toBe(false);
  });

  it('reads a per-cluster override', () => {
    const cfg = setFeature(DEFAULT_FLAGS, 'c1', 'packages', false);
    expect(isFeatureEnabled(cfg, 'c1', 'packages', true)).toBe(false);
    // A different cluster is unaffected and still uses the default.
    expect(isFeatureEnabled(cfg, 'c2', 'packages', true)).toBe(true);
  });

  it('setFeature is immutable and does not mutate DEFAULT_FLAGS', () => {
    const cfg = setFeature(DEFAULT_FLAGS, 'c1', 'packages', true);
    expect(DEFAULT_FLAGS.clusters).toEqual({});
    const cfg2 = setFeature(cfg, 'c1', 'exemptions', false);
    expect(cfg2.clusters.c1.features).toEqual({ packages: true, exemptions: false });
  });

  it('preserves autoDetect and other clusters when setting a feature', () => {
    const start: UdsFlags = {
      autoDetect: false,
      clusters: { c2: { features: { packages: true } } },
    };
    const next = setFeature(start, 'c1', 'exemptions', true);
    expect(next.autoDetect).toBe(false);
    expect(next.clusters.c2.features).toEqual({ packages: true });
    expect(next.clusters.c1.features).toEqual({ exemptions: true });
  });
});
