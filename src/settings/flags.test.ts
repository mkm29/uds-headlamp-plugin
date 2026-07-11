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

import {
  DEFAULT_SCOPER,
  getScoperConfig,
  setScoperConfig,
} from './flags';

describe('scoper config', () => {
  it('returns DEFAULT_SCOPER when no override exists', () => {
    expect(getScoperConfig(undefined, 'c1')).toEqual(DEFAULT_SCOPER);
    expect(getScoperConfig(DEFAULT_FLAGS, 'c1')).toEqual(DEFAULT_SCOPER);
  });

  it('merges a partial override over the defaults', () => {
    const cfg = setScoperConfig(DEFAULT_FLAGS, 'c1', { resource: 'secrets', verb: 'list' });
    const got = getScoperConfig(cfg, 'c1');
    expect(got.resource).toBe('secrets');
    expect(got.verb).toBe('list');
    // Untouched fields keep their defaults.
    expect(got.subresource).toBe(DEFAULT_SCOPER.subresource);
    expect(got.strategy).toBe(DEFAULT_SCOPER.strategy);
  });

  it('setScoperConfig is immutable and per-cluster', () => {
    const cfg = setScoperConfig(DEFAULT_FLAGS, 'c1', { strategy: 'list-all' });
    expect(DEFAULT_FLAGS.clusters).toEqual({});
    expect(getScoperConfig(cfg, 'c2')).toEqual(DEFAULT_SCOPER);
  });

  it('coexists with feature flags on the same cluster', () => {
    const withFeature = setFeature(DEFAULT_FLAGS, 'c1', 'namespaceScoper', false);
    const withScoper = setScoperConfig(withFeature, 'c1', { verb: 'watch' });
    expect(isFeatureEnabled(withScoper, 'c1', 'namespaceScoper', true)).toBe(false);
    expect(getScoperConfig(withScoper, 'c1').verb).toBe('watch');
  });
});

import { anyFeatureEnabled } from './flags';

describe('anyFeatureEnabled', () => {
  const cfg = { autoDetect: true, clusters: { c1: { features: { a: false, b: true } } } };
  it('is true when any id is enabled', () => {
    expect(anyFeatureEnabled(cfg, 'c1', ['a', 'b'], true)).toBe(true);
  });
  it('is false when every id is explicitly disabled', () => {
    expect(anyFeatureEnabled(cfg, 'c1', ['a'], true)).toBe(false);
  });
  it('falls back to the default for absent ids', () => {
    expect(anyFeatureEnabled(cfg, 'c1', ['missing'], true)).toBe(true);
    expect(anyFeatureEnabled(cfg, 'c1', ['missing'], false)).toBe(false);
  });
  it('is false for an empty id list', () => {
    expect(anyFeatureEnabled(cfg, 'c1', [], true)).toBe(false);
  });
});
