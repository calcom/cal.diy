#!/usr/bin/env bash
# Clever Cloud post-build hook (CC_POST_BUILD_HOOK=./scripts/clever/post-build.sh).
#
# The deployed directory is the whole checkout after `yarn build`: build caches,
# the offline yarn cache and dev tooling all ship with it and none of it is read
# by `next start`. Measured on a v7.5.0 deploy: .turbo 1.1G, .yarn/cache 0.8G,
# apps/web/.next/cache ~1G, node_modules 3.5G of which roughly two thirds are
# devDependencies.
set -euo pipefail
cd "$(dirname "$0")/../.."

size() { du -sh . 2>/dev/null | cut -f1; }
echo "post-build: ${PWD} is $(size) before trimming"

# Opt-in because it changes what the run command may rely on: turbo, ts-node
# and every other devDependency disappear, so the app must be started with
# `yarn workspace @calcom/web start` (or `next start` from apps/web), not through
# `turbo run`. Lifecycle scripts are disabled: native modules were already built
# by the main install and the root postinstall needs turbo.
if [ "${CC_PRUNE_DEV_DEPENDENCIES:-false}" = "true" ]; then
  echo "post-build: pruning devDependencies"
  YARN_ENABLE_SCRIPTS=0 yarn workspaces focus --all --production
fi

# Sentry uploads source maps during `yarn build` (create-sentry-release.js), so
# the .map files have already served their purpose. Kept when no Sentry auth
# token is set: without an upload they are the only way to read a stack trace.
if [ -n "${SENTRY_AUTH_TOKEN:-}" ]; then
  echo "post-build: removing browser source maps"
  find apps/web/.next -name '*.map' -type f -delete
fi

rm -rf .turbo .yarn/cache .yarn/install-state.gz apps/web/.next/cache
find . -path ./node_modules -prune -o -type d -name .turbo -print0 2>/dev/null | xargs -0 rm -rf

echo "post-build: ${PWD} is $(size) after trimming"
