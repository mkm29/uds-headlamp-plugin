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

/**
 * Pure probing helpers: authorization review request bodies, the RBAC rule
 * matcher that interprets a SelfSubjectRulesReview response, namespace
 * validation, and result reduction. No Headlamp or DOM dependencies, so this
 * is the unit-tested core of the scoper (issue #1 acceptance criteria).
 */

/** The access check used as the "can this user work here?" signal. */
export interface ResourceAttributes {
  verb: string;
  group: string;
  resource: string;
  subresource: string;
}

/** A single rule from a SelfSubjectRulesReview status.resourceRules entry. */
export interface ResourceRule {
  verbs: string[];
  apiGroups: string[];
  resources: string[];
}

/** Outcome of probing one namespace. */
export interface ProbeResult {
  namespace: string;
  allowed: boolean;
  method: 'ssrr' | 'ssar';
  reason?: string;
  evaluationError?: string;
  error?: string;
}

/** Build a SelfSubjectRulesReview body for a namespace. */
export function selfSubjectRulesReviewBody(namespace: string) {
  return {
    apiVersion: 'authorization.k8s.io/v1',
    kind: 'SelfSubjectRulesReview',
    spec: { namespace },
  };
}

/** Build a SelfSubjectAccessReview body for a namespace + resource attributes. */
export function selfSubjectAccessReviewBody(namespace: string, attrs: ResourceAttributes) {
  return {
    apiVersion: 'authorization.k8s.io/v1',
    kind: 'SelfSubjectAccessReview',
    spec: {
      resourceAttributes: {
        namespace,
        verb: attrs.verb,
        group: attrs.group,
        resource: attrs.resource,
        subresource: attrs.subresource,
      },
    },
  };
}

const inList = (list: string[], value: string): boolean =>
  list.includes('*') || list.includes(value);

/**
 * Does any resource rule permit the requested verb/group/resource(/subresource)?
 * Wildcards ('*') in a rule match anything. A subresource matches either the
 * bare resource or the "resource/subresource" form.
 */
export function ruleAllows(rules: ResourceRule[], attrs: ResourceAttributes): boolean {
  const wanted = attrs.subresource
    ? [attrs.resource, `${attrs.resource}/${attrs.subresource}`]
    : [attrs.resource];
  return rules.some(
    rule =>
      inList(rule.verbs, attrs.verb) &&
      inList(rule.apiGroups, attrs.group) &&
      wanted.some(r => inList(rule.resources, r))
  );
}

// DNS-1123 label validation (from Headlamp's isValidNamespaceFormat).
const DNS1123 = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

/** True when `ns` is a valid DNS-1123 label (<= 63 chars). */
export function isValidNamespace(ns: string): boolean {
  return ns.length > 0 && ns.length <= 63 && DNS1123.test(ns);
}

/** Split a comma-separated string into trimmed, non-empty entries. */
export function parseCsv(csv: string): string[] {
  return csv
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

/** Reduce probe results to the list of accessible namespace names. */
export function computeAllowedFromProbes(probes: ProbeResult[]): string[] {
  return probes.filter(p => p.allowed).map(p => p.namespace);
}
