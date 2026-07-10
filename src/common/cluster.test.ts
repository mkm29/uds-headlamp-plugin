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

import { getClusterFromPath } from './cluster';

describe('getClusterFromPath', () => {
  it('parses the cluster from a /c/<cluster> path', () => {
    expect(getClusterFromPath('/c/my-cluster/namespaces')).toBe('my-cluster');
  });

  it('returns the first name for a multi-cluster (+) view', () => {
    expect(getClusterFromPath('/c/a+b+c/pods')).toBe('a');
  });

  it('decodes URL-encoded cluster names', () => {
    expect(getClusterFromPath('/c/team%2Fprod/pods')).toBe('team/prod');
  });

  it('returns null when there is no cluster segment', () => {
    expect(getClusterFromPath('/settings/plugins/uds-core')).toBeNull();
  });
});
