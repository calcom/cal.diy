Customizable UI components to integrate scheduling into your services.

## Users guide

### Support
Currently supports React 18, React 19, Next 14 and Next 15.

### Changelog 
Changelog can be viewed [here](https://github.com/calcom/cal.diy/blob/main/packages/platform/atoms/CHANGELOG.md).

### Versioning
1. We use semantic versioning meaning that all updates except major should be safe to update.
2. If there are breaking changes within a specific version it will be marked as `❗️Breaking change` in the changelog, so please check it out before updating.
3. Some of the versions are suffixed e.g. `1.0.102-framer` and are intended for isolated use cases, so you most probably
want to use version without any suffix e.g. `1.0.103`.

### Documentation 
Documentation on how to get started with platform solution is [here](https://cal.com/docs/platform/quickstart) and list of atoms can be viewed
[here](https://cal.com/docs/platform/atoms/cal-provider)

## Contributors guide

### Versioning
`@calcom/atoms` is not released from this repository. The package is marked `private`, and the [npm package](https://www.npmjs.com/package/@calcom/atoms) is published from [calcom/cal](https://github.com/calcom/cal), so you don't need to add a changeset or bump the version for atoms changes here.

### Testing
Atoms are tested in CI using e2e tests within the example platform app. To run them locally:
1. Go to "packages/platform/atoms" and run `yarn dev-on` and then `yarn build` - this will create local build of atoms.
2. Setup environment variables in "packages/platform/examples/base/.env" file. You will need your own platform oAuth client to populate NEXT_PUBLIC_X_CAL_ID (oAuth id), X_CAL_SECRET_KEY (oAuth secret), VITE_BOOKER_EMBED_OAUTH_CLIENT_ID (oAuth id) and ORGANIZATION_ID (organization id to which oAuth client belongs) - all of these are available in the platform settings dashboard after creating the oAuth client.
```
NEXT_PUBLIC_X_CAL_ID=""
X_CAL_SECRET_KEY=""
NEXT_PUBLIC_CALCOM_API_URL="https://api.cal.com/v2"
VITE_BOOKER_EMBED_OAUTH_CLIENT_ID=""
VITE_BOOKER_EMBED_API_URL="https://api.cal.com/v2"
ORGANIZATION_ID=""
```
3. Go to "packages/platform/examples/base" and run `yarn dev:e2e` - this will start the example platform app and run e2e tests by using locally built atoms. Because it is not running within CI it will open a browser and run tests.


