# uds-headlamp-plugin

This is the default template README for [Headlamp Plugins](https://github.com/kubernetes-sigs/headlamp).

- The description of your plugin should go here.
- You should also edit the package.json file meta data (like name and description).

## Developing Headlamp plugins

For more information on developing Headlamp plugins, please refer to:

- [Getting Started](https://headlamp.dev/docs/latest/development/plugins/), How to create a new Headlamp plugin.
- [API Reference](https://headlamp.dev/docs/latest/development/api/), API documentation for what you can do
- [UI Component Storybook](https://headlamp.dev/docs/latest/development/frontend/#storybook), pre-existing components
  you can use when creating your plugin.
- [Plugin Examples](https://github.com/kubernetes-sigs/headlamp/tree/main/plugins/examples), Example plugins you can
  look at to see how it's done.

## Releases

Releases are automated with [release-please](https://github.com/googleapis/release-please), driven by
[Conventional Commits](https://www.conventionalcommits.org/):

A single `Release` workflow (`.github/workflows/release.yaml`) drives the whole flow:

- On every push to `main`, the `release-please` job opens (or updates) a **release PR** that maintains `CHANGELOG.md`
  and bumps the version in `package.json` (`fix:` → patch, `feat:` → minor, `feat!:` / `BREAKING CHANGE` → major).
- Merging the release PR runs the workflow again; the same run creates a GitHub Release and a `vX.Y.Z` git tag, then —
  gated on `release_created` — the `image` job builds and pushes the multi-arch (amd64/arm64) container image to GHCR
  with signed SLSA build-provenance and SBOM attestations.

Because the image build is a dependent job in the same run (not a separate tag-triggered workflow), it fires on the
normal merge-to-`main` push and needs no personal access token.

Configuration lives in `release-please-config.json` and `.release-please-manifest.json`.

### Optional: `RELEASE_PLEASE_TOKEN`

PRs opened with the default `GITHUB_TOKEN` do **not** trigger other workflows, so the release PR won't get CI checks
unless it is opened by a PAT. If you want CI to run on the release PR itself, add a repository secret
`RELEASE_PLEASE_TOKEN` — a fine-grained PAT (or GitHub App token) with `contents: write` and `pull-requests: write` on
this repository. The release + image build do not require it.
