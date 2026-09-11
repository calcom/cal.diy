# Clever Cloud deployment

The app is deployed as a Node application; the deployed directory is the whole
checkout after `yarn build`. `post-build.sh` trims what `next start` never
reads. Wire it with:

```
CC_POST_BUILD_HOOK=./scripts/clever/post-build.sh
```

| Variable | Default | Effect |
|---|---|---|
| `PRUNE_DEV_DEPENDENCIES` (custom, set it in the app env) | `false` | `yarn workspaces focus --all --production` after the build — drops ~2 GB of devDependencies. Requires a run command that does not go through `turbo` (e.g. `yarn workspace @calcom/web start`). |
| `SENTRY_AUTH_TOKEN` | — | When set, `yarn build` has uploaded the source maps to Sentry and the hook deletes the local `.map` files. |

Always removed: `.turbo`, `.yarn/cache`, `.yarn/install-state.gz`,
`apps/web/.next/cache`.
