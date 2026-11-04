# Creating a Salesforce test org
You must have the [Salesforce CLI](https://developer.salesforce.com/tools/salesforcecli) installed to create a test org. Once installed, you can create a test org using the following command `yarn scratch-org:create`

This will create a scratch org with the configuration specified in the `project-scratch-def.json` file.

To open a browser tab to the org, run `yarn scratch-org:start`

# Working With GraphQL
This package utilizes [`GraphQL Codegen`](https://the-guild.dev/graphql/codegen#graphql-codegen) to generate types and queries from the Salesforce schema.

### Generating GraphQL Schema
Currently v63 of the Salesforce graphql endpoint throws an error when trying to generate files. This is due to the `Setup__JoinInput` type not generating any fields. To work around this, the `schema.json` file comes from the [Salesforce graphql introspection query](https://www.postman.com/salesforce-developers/salesforce-developers/request/sy8qaf9/introspection-query). This file is then converted to a SDL file using the [graphql-introspection-json-to-sdl](https://github.com/potatosalad/graphql-introspection-json-to-sdl) package. You can generate the SDL file by running `yarn generate:schema`.

### Generating Queries
When working with graphql files ensure that `yarn codegen:watch` is running in the background. This will generate the types and queries from the SDL file.

# Developing the SFDC package
The SFDC package is written using Apex. To develop this package, you need to have the Salesforce CLI installed. Then you can run `yarn sfdc:deploy:preview` to see what changes will be deployed to the scratch org. Running `yarn sfdc:deploy` will deploy the changes to the scratch org.

Note that if you want to call your local development instances you need to change the "Named Credential" on the scratch org settings to point the `CalCom_Development` credential to the local instance.

# Publishing the SFDC Package

All commands should be run from the `sfdc-package` directory:

```bash
cd packages/app-store/salesforce/sfdc-package
```

### Initial Setup (One-time)

If the package doesn't exist yet in the Dev Hub, create it:

```bash
sf package create \
  --name "calcom-sfdc-package" \
  --package-type Unlocked \
  --path force-app \
  --target-dev-hub team@cal.com
```

This registers the package and updates `sfdx-project.json` with the package ID.

### Creating a New Package Version

Each time you want to release changes, create a new version:

```bash
sf package version create \
  --package "calcom-sfdc-package" \
  --installation-key-bypass \
  --wait 20 \
  --target-dev-hub team@cal.com
```

Options:
- `--installation-key-bypass`: Allows installation without a password
- `--wait 20`: Waits up to 20 minutes for completion
- `--code-coverage`: Add this flag when ready to promote (requires 75% Apex test coverage)

### Viewing Packages and Installation URLs

List all package versions:

```bash
sf package version list --target-dev-hub team@cal.com
```

The installation URL format is:

```
https://login.salesforce.com/packaging/installPackage.apexp?p0=<04t_SUBSCRIBER_PACKAGE_VERSION_ID>
```

### Promoting for Production

Beta versions can only be installed in sandboxes/scratch orgs. To allow installation in production orgs, promote the version:

```bash
sf package version promote \
  --package "calcom-sfdc-package@X.X.X-X" \
  --target-dev-hub team@cal.com
```

Replace `X.X.X-X` with the version number (e.g., `0.1.0-1`).

### Running Tests

To run Apex tests and check code coverage:

```bash
sf project deploy start --target-org <org-alias>
sf apex run test --test-level RunLocalTests --wait 10 --target-org <org-alias>
```
