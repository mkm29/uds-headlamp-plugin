ARG CANDIDATE_NAMESPACES
FROM oven/bun:canary-debian@sha256:88ad267b0bb9d10cfcce12338a2020361405885f2deca6b0099cd213f6347124 AS builder
# Re-declare the global ARG so it is in scope inside this stage; without this,
# $CANDIDATE_NAMESPACES below expands to empty and the build-arg is silently ignored.
ARG CANDIDATE_NAMESPACES
WORKDIR /src
COPY package.json package-lock.json ./
RUN bun install --frozen-lockfile
COPY src ./src
RUN HEADLAMP_APP_CANDIDATE_NAMESPACES=$CANDIDATE_NAMESPACES bun run build

FROM busybox@sha256:1487d0af5f52b4ba31c7e465126ee2123fe3f2305d638e7827681e7cf6c83d5e AS final
# Re-declare the global ARG so the ENV below resolves it (fixes buildkit UndefinedVar).
ARG CANDIDATE_NAMESPACES
RUN mkdir -p /plugins/uds-headlamp-plugin
ENV HEADLAMP_APP_CANDIDATE_NAMESPACES=$CANDIDATE_NAMESPACES
COPY --from=builder --chown=1001:1001 /src/dist/* /plugins/uds-headlamp-plugin
# Headlamp reads each plugin folder's package.json to check compatibility
# (semver.satisfies(coerce(devDependencies['@kinvolk/headlamp-plugin']), '>=0.8.0-alpha.3')).
# `headlamp-plugin build` only emits dist/main.js, so ship package.json too or
# the plugin is disabled as "not compatible with this version of Headlamp".
COPY --from=builder --chown=1001:1001 /src/package.json /plugins/uds-headlamp-plugin/package.json
# Headlamp's pod (and thus the initContainer that copies these files) runs as a
# non-root UID that is not necessarily 1001, so make the plugin assets
# world-readable — otherwise the initContainer's `cp` hits "Permission denied"
# on package.json (which lands mode 0600).
RUN chmod -R a+rX /plugins/uds-headlamp-plugin
USER 1001