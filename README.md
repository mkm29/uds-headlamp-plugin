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

- On every push to `main`, the `Release Please` workflow opens (or updates) a **release PR** that maintains
  `CHANGELOG.md` and bumps the version in `package.json` (`fix:` → patch, `feat:` → minor, `feat!:` / `BREAKING CHANGE`
  → major).
- Merging the release PR creates a GitHub Release and a `vX.Y.Z` git tag.
- The tag triggers two workflows: `Docker` builds and pushes the image to GHCR, and `Publish npm package` runs
  `bun publish` to publish `@mkm29/uds-headlamp-plugin` to the GitHub Packages npm registry
  (`https://npm.pkg.github.com`).

Configuration lives in `release-please-config.json` and `.release-please-manifest.json`.

### Consuming the npm package

The published package is scoped to `@mkm29` on GitHub Packages. To install it, point the scope at the registry in an
`.npmrc` and authenticate with a token that has `read:packages`:

```
@mkm29:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

Then `npm install @mkm29/uds-headlamp-plugin` (or `bun add`). The tarball contains the built plugin (`dist/`).

### Maintainer setup: `RELEASE_PLEASE_TOKEN`

Tags created with the default `GITHUB_TOKEN` do **not** start new workflow runs (GitHub's recursion guard), so the
`vX.Y.Z` tag would not trigger the `Docker` build or the `Publish npm package` workflow. To enable end-to-end
automation, add a repository secret `RELEASE_PLEASE_TOKEN` — a fine-grained PAT (or GitHub App token) with
`contents: write` and `pull-requests: write` on this repository. Without it, the release PR and GitHub Release still
work, but the Docker image and npm package must be released by pushing the tag manually.
