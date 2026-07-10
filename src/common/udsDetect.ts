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

/** Result of UDS Core detection. */
export interface UdsDetectResult {
  /** True when the uds.dev CRD group is present in the cluster. */
  hasUds: boolean;
  /** The set of CRD groups observed (empty until detection is implemented). */
  groups: Set<string>;
}

/**
 * Detect whether UDS Core is installed in the current cluster.
 *
 * Scaffold placeholder: returns "not detected" so callers can wire UI now.
 *
 * TODO(phase-2): query CustomResourceDefinition.useList() for the `uds.dev`
 * group and look up the pepr-uds-core deployment. Reads are impersonated, so a
 * user lacking `list customresourcedefinitions` degrades to "unknown" → treat
 * as hidden (ADR-0004).
 */
export function useUdsDetect(): UdsDetectResult {
  return { hasUds: false, groups: new Set<string>() };
}
