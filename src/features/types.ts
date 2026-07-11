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
 * A self-contained plugin feature (ADR-0003). Each feature folder exports one
 * of these; the manifest is the single list of them.
 */
export interface Feature {
  /** Stable identifier; also the per-cluster flag key in UdsFlags. */
  id: string;
  /** Human-readable name shown next to the settings toggle. */
  title: string;
  /** Default enablement when no per-cluster override exists. */
  defaultEnabled: boolean;
  /**
   * Called exactly once at plugin load (ADR-0004). Registration is one-shot, so
   * this should register unconditionally and gate visibility with live filters/
   * guards rather than skipping registration when `enabled` is false.
   */
  register: (ctx: { enabled: boolean }) => void;
}
