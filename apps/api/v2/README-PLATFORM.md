# Local development

## Local development - part 1
This setup will allow you to develop with api v2 locally and also test platform atoms with the examples app.

Open `apps/api/v2/README.md` and do all the steps except step 6 where you setup prisma.

## Local development - part 2 (platform variables shared between api v2 and examples app)
We now need to setup platform OAuth client and OAuth 2.0 client that can be tested in the platform example app `packages/platform/examples/base`.

### If you want to create clients by seeding the database automatically

1. Setup root environment that are re-used in the root `.env` and in the platform examples app - open the root `.env` and set values for the platform OAuth client. The id and secret can be random values.
```
SEED_PLATFORM_OAUTH_CLIENT_ID=
SEED_PLATFORM_OAUTH_CLIENT_SECRET=
```
Then you need to copy these values to the platform examples app environment.
- Rename `packages/platform/examples/base/.env.example` to `packages/platform/examples/base/.env`. There will be many environment variables already populated to make it easier for you.
- copy the value of `SEED_PLATFORM_OAUTH_CLIENT_ID` into `packages/platform/examples/base/.env` `NEXT_PUBLIC_X_CAL_ID`
- copy the value of `SEED_PLATFORM_OAUTH_CLIENT_SECRET` into `packages/platform/examples/base/.env` `X_CAL_SECRET_KEY`

Then, we need to setup platform OAuth 2.0 client. We will need an id, and then hashed and plain secrets. To generate them you can:
```
cd apps/api/v2
yarn generate-secrets
```

and then the secrets will be written to `apps/api/v2/.generated-secrets` file containing:
```
plain - <PLAINTEXT_SECRET>
hashed - <HASHED_SECRET>
```

In the root `.env` set the following environment variables:
```
SEED_OAUTH2_CLIENT_ID=
SEED_OAUTH2_CLIENT_SECRET_HASHED=
```
where CLIENT_ID can be random but SECRET_HASHED is hashed secret above.
Then in the `packages/platform/examples/base/.env` set the `NEXT_PUBLIC_OAUTH2_CLIENT_ID` to be equal to `SEED_OAUTH2_CLIENT_ID` and `OAUTH2_CLIENT_SECRET_PLAIN` to the plain secret generated above.


### If you want to create clients manually
1. Create new oauth client in the PlatformOAuthClient table manually. Here is example json. You can set id and secret to random values.
```
  {
    "id": "clxyyy21o0003sbk7yw5z6tzg",
    "name": "Acme",
    "secret": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuYW1lIjoiQWNtZSAiLCJwZXJtaXNzaW9ucyI6MTAyMywicmVkaXJlY3RVcmlzIjpbImh0dHA6Ly9sb2NhbGhvc3Q6NDMyMSJdLCJib29raW5nUmVkaXJlY3RVcmkiOiIiLCJib29raW5nQ2FuY2VsUmVkaXJlY3RVcmkiOiIiLCJib29raW5nUmVzY2hlZHVsZVJlZGlyZWN0VXJpIjoiIiwiYXJlRW1haWxzRW5hYmxlZCI6dHJ1ZSwiaWF0IjoxNzE5NTk1ODA4fQ.L5_jSS14fcKLCD_9_DAOgtGd6lUSZlU5CEpCPaPt41I",
    "permissions": 1023,
    "logo": null,
    "redirectUris": "{http://localhost:4321}",
    "organizationId": 1,
    "createdAt": "2026-01-27 09:35:27.297",
    "areEmailsEnabled": true,
    "bookingCancelRedirectUri": null,
    "bookingRedirectUri": null,
    "bookingRescheduleRedirectUri": null,
    "areDefaultEventTypesEnabled": true,
    "areCalendarEventsEnabled": true
  }
```
Then you need to copy id and secret to the platform examples app environment.
- Rename `packages/platform/examples/base/.env.example` to `packages/platform/examples/base/.env`
- copy the client id into `packages/platform/examples/base/.env` `NEXT_PUBLIC_X_CAL_ID`
- copy the client secret into `packages/platform/examples/base/.env` `X_CAL_SECRET_KEY`

Then, we need to setup platform OAuth 2.0 client. We will need an id, and then hashed and plain secrets. To generate them you can:
```
cd apps/api/v2
yarn generate-secrets
```

and then the secrets will be written to `apps/api/v2/.generated-secrets` file containing:
```
plain - <PLAINTEXT_SECRET>
hashed - <HASHED_SECRET>
```

Then in the `packages/platform/examples/base/.env` set the `NEXT_PUBLIC_OAUTH2_CLIENT_ID` to be equal to a random id and `OAUTH2_CLIENT_SECRET_PLAIN` to the plain secret generated above.

Then create a new entry in the OAuthClient table with the random id and hashed secret. It is important that the redirectUri is like below because that is where the examples app is running.
```
  {
    "clientId": "1c70be53f35aa480a5e3146d361fd993d265e564d2d86a203df3adbd05186517",
    "redirectUri": "http://localhost:4321",
    "clientSecret": "970db2cf14112013ba3a510b945294fef8737d42ee58c32031d2351692068ce7",
    "name": "atoms examples app oauth 2 client",
    "logo": null,
    "clientType": "confidential",
    "isTrusted": false,
    "createdAt": "2026-01-27 09:35:26.731",
    "purpose": "test atoms examples app with oauth 2",
    "rejectionReason": null,
    "status": "approved",
    "userId": 10,
    "websiteUrl": "http://localhost:4321"
  }
```
I point userId to 10 aka `admin@example.com`.

## Local development - part 3
Proceed to `apps/api/v2/README.md` step 6 to setup prisma and seed database if you need to.

## Local development - part 4
If you followed steps above then examples app environment is setup.

If you also want to test apple connect calendar atom, then you need to create app specific password using your apple email and
set the following variables:
```
ATOMS_E2E_APPLE_ID=
ATOMS_E2E_APPLE_CONNECT_APP_SPECIFIC_PASSCODE=
```

Finally, if you want that the examples app is tested using OAuth 2.0 client then you must set environment variable
`NEXT_PUBLIC_OAUTH2_MODE="true"` in `packages/platform/examples/base/.env`. If you want to test it using platform OAuth client then
comment this variable or set to false.

# Running everything
1. Build atoms for local development:
cd packages/platform/atoms
yarn dev-on
yarn build-npm
```
The dev-on command changes how atoms are built. Remember to run `yarn dev-off` when you are done testing atoms locally. If you update anything related to frontend, for example, Booker, then you need to run `yarn build-npm` again to rebuild atoms.

2. Start api v2:
```
Sometimes it happens that v2 api restarts because some unrelated log of build files changed, and if it makes examples app not wor you can just start it using:
```
cd apps/api/v2
yarn dev:build
yarn start
```

3. Setups examples app sqlite database.
```
cd packages/platform/examples/base
rm -f prisma/dev.db && yarn prisma db push
```
4. Run examples app and open localhost:4321
```
cd packages/platform/examples/base
yarn dev
```

If you have set `NEXT_PUBLIC_OAUTH2_MODE="true"` then here is how to test it:

If you do test OAuth 2.0 using atoms then do below:
1. Start cal web app locally by running `yarn dev` in the root folder and login using any user into cal web app running locally.
2. Using client id and redirect_uri information above create /authorize url. Example http://localhost:3000/auth/oauth2/authorize?client_id=1c70be53f35aa480a5e3146d361fd993d265e564d2d86a203df3adbd05186517&redirect_uri=http://localhost:4321&state=texas or if you have setup localhost:3000 to map to app.cal.local http://app.cal.local:3000/auth/oauth2/authorize?client_id=1c70be53f35aa480a5e3146d361fd993d265e564d2d86a203df3adbd05186517&redirect_uri=http://localhost:4321&state=texas and authorize test OAuth client. You will be redirected to localhost:4321?code=abc and this route will exchange the authorization code for access and refresh tokens for the logged in cal user and store them in the examples app SQLite database.
3. Examples app is ready to use. If you update, let's say an availability, then it will be reflected in the availability of admin@example.com in the web app running locally.
