# 1. Record architecture decisions

Date: 2026-07-10

## Status

Accepted

## Context

We are starting Phase 1 of the `uds-core` Headlamp plugin. The overall design (a monolithic, feature-flag-driven plugin
for UDS Core) is captured in a single research/planning document, but that document is a snapshot: it mixes settled
decisions, open questions, and unverified assumptions in one place. As the plugin evolves across phases, we need a
durable, reviewable record of *why* each structural decision was made — one that survives contributor turnover and lets
a future reader reconstruct the reasoning without re-deriving it from code or chat history.

Constraints shaping this:

- The plugin will be built and deployed into air-gapped/regulated (UDS) clusters, where "why did we do it this way"
  questions carry compliance and audit weight.
- Several decisions rest on unverified externals (e.g. the Prometheus plugin's exact config keys, Headlamp API stability
  across release lines) and may need to be revisited; we want a format that supports superseding a prior decision rather
  than silently editing it.

## Decision

We will use Architecture Decision Records (ADRs), following Michael Nygard's format
(<https://github.com/architecture-decision-record/architecture-decision-record>).

- ADRs live in `docs/adr/` and follow `docs/adr/template.md`.
- Each ADR is a numbered Markdown file named `NNNN-kebab-case-title.md` with a zero-padded 4-digit sequence number
  (`0001`, `0002`, …).
- Each ADR has the sections: **Title**, **Date**, **Status**, **Context**, **Decision**, **Consequences**.
- **Status** is one of `Proposed`, `Accepted`, `Deprecated`, or `Superseded by ADR-NNNN`. Accepted ADRs are immutable in
  intent: to change a decision we add a new ADR that supersedes the old one and update the old ADR's Status to point at
  it, rather than rewriting history.
- ADRs are committed alongside the code change that enacts them wherever possible, so the decision and its first
  implementation share a reviewable diff.

## Consequences

- Contributors gain a chronological, greppable trail of structural decisions; onboarding and audits get faster.
- There is a small ongoing cost: non-trivial structural or cross-cutting decisions must be written up before or with the
  change. Trivial or easily-reversible choices do not warrant an ADR — judgment applies.
- Because superseding (not editing) is the mechanism for change, the directory will accumulate historical records that
  are no longer "true." Readers must check Status; a `Superseded` ADR is history, not current guidance.
- This ADR is itself the first record and establishes the convention every subsequent ADR in this repository follows.
