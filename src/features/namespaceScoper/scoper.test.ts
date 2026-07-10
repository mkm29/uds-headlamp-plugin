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

import { resolveCandidateNamespaces } from './scoper';

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => body,
  } as unknown as Response;
}

function htmlResponse(): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'text/html' },
    json: async () => ({}),
  } as unknown as Response;
}

describe('resolveCandidateNamespaces', () => {
  it('uses config.json when it returns a JSON candidate list', async () => {
    const fetchImpl = async () => jsonResponse({ candidateNamespaces: ['a', 'b'] });
    const r = await resolveCandidateNamespaces({ fetchImpl: fetchImpl as typeof fetch });
    expect(r).toEqual({ source: 'config.json', namespaces: ['a', 'b'] });
  });

  it('falls through to build-time env when config.json is the SPA html fallback', async () => {
    const fetchImpl = async () => htmlResponse();
    const r = await resolveCandidateNamespaces({
      fetchImpl: fetchImpl as typeof fetch,
      buildTimeCsv: 'x, y',
    });
    expect(r).toEqual({ source: 'build-time-env', namespaces: ['x', 'y'] });
  });

  it('falls back to the hardcoded list when fetch throws and env is empty', async () => {
    const fetchImpl = async () => {
      throw new Error('network down');
    };
    const r = await resolveCandidateNamespaces({
      fetchImpl: fetchImpl as typeof fetch,
      buildTimeCsv: '',
      hardcoded: ['fixed-a', 'fixed-b'],
    });
    expect(r).toEqual({ source: 'hardcoded-fallback', namespaces: ['fixed-a', 'fixed-b'] });
  });
});
