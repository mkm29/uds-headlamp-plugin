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

import {
  computeAllowedFromProbes,
  isValidNamespace,
  parseCsv,
  ProbeResult,
  ResourceRule,
  ruleAllows,
  selfSubjectAccessReviewBody,
  selfSubjectRulesReviewBody,
  ssrrConclusive,
} from './probe';

const ATTRS = { verb: 'get', group: '', resource: 'pods', subresource: 'log' };

describe('ruleAllows', () => {
  it('matches an exact verb/group/resource rule', () => {
    const rules: ResourceRule[] = [{ verbs: ['get'], apiGroups: [''], resources: ['pods'] }];
    expect(ruleAllows(rules, ATTRS)).toBe(true);
  });

  it('matches via wildcards', () => {
    const rules: ResourceRule[] = [{ verbs: ['*'], apiGroups: ['*'], resources: ['*'] }];
    expect(ruleAllows(rules, ATTRS)).toBe(true);
  });

  it('matches a subresource written as resource/subresource', () => {
    const rules: ResourceRule[] = [{ verbs: ['get'], apiGroups: [''], resources: ['pods/log'] }];
    expect(ruleAllows(rules, ATTRS)).toBe(true);
  });

  it('denies when the verb is absent', () => {
    const rules: ResourceRule[] = [{ verbs: ['list'], apiGroups: [''], resources: ['pods'] }];
    expect(ruleAllows(rules, ATTRS)).toBe(false);
  });

  it('denies when the group differs', () => {
    const rules: ResourceRule[] = [{ verbs: ['get'], apiGroups: ['apps'], resources: ['pods'] }];
    expect(ruleAllows(rules, ATTRS)).toBe(false);
  });

  it('denies on an empty rule set', () => {
    expect(ruleAllows([], ATTRS)).toBe(false);
  });
});

describe('review body builders', () => {
  it('builds a SelfSubjectRulesReview for a namespace', () => {
    expect(selfSubjectRulesReviewBody('ns1')).toEqual({
      apiVersion: 'authorization.k8s.io/v1',
      kind: 'SelfSubjectRulesReview',
      spec: { namespace: 'ns1' },
    });
  });

  it('builds a SelfSubjectAccessReview with resource attributes', () => {
    expect(selfSubjectAccessReviewBody('ns1', ATTRS)).toEqual({
      apiVersion: 'authorization.k8s.io/v1',
      kind: 'SelfSubjectAccessReview',
      spec: {
        resourceAttributes: {
          namespace: 'ns1',
          verb: 'get',
          group: '',
          resource: 'pods',
          subresource: 'log',
        },
      },
    });
  });
});

describe('isValidNamespace', () => {
  it('accepts DNS-1123 labels', () => {
    expect(isValidNamespace('kube-system')).toBe(true);
    expect(isValidNamespace('a')).toBe(true);
  });

  it('rejects invalid or over-long labels', () => {
    expect(isValidNamespace('')).toBe(false);
    expect(isValidNamespace('Bad_NS')).toBe(false);
    expect(isValidNamespace('-lead')).toBe(false);
    expect(isValidNamespace('a'.repeat(64))).toBe(false);
  });
});

describe('parseCsv', () => {
  it('splits, trims, and drops empties', () => {
    expect(parseCsv(' a, b ,,c ')).toEqual(['a', 'b', 'c']);
    expect(parseCsv('')).toEqual([]);
  });
});

describe('computeAllowedFromProbes', () => {
  it('returns only the allowed namespaces', () => {
    const probes: ProbeResult[] = [
      { namespace: 'a', allowed: true, method: 'ssrr' },
      { namespace: 'b', allowed: false, method: 'ssar' },
      { namespace: 'c', allowed: true, method: 'ssar' },
    ];
    expect(computeAllowedFromProbes(probes)).toEqual(['a', 'c']);
  });
});

describe('ssrrConclusive', () => {
  it('is true when rules are present and there is no evaluationError', () => {
    expect(
      ssrrConclusive({ resourceRules: [{ verbs: ['get'], apiGroups: [''], resources: ['pods'] }] })
    ).toBe(true);
  });

  it('is false when the rule set is empty', () => {
    expect(ssrrConclusive({ resourceRules: [] })).toBe(false);
  });

  it('is false when an evaluationError is present, even with rules', () => {
    expect(
      ssrrConclusive({
        evaluationError: 'boom',
        resourceRules: [{ verbs: ['get'], apiGroups: [''], resources: ['pods'] }],
      })
    ).toBe(false);
  });

  it('is false for an empty status object', () => {
    expect(ssrrConclusive({})).toBe(false);
  });
});
