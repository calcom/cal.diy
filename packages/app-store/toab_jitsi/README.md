# TOAB Jitsi for Cal.com

Add TOAB Jitsi video meetings to Cal.com bookings using the organizer’s preferred conference server managed by [TOAB Moderator](https://toab-jitsi.com/).

## Permissions and data access

See [PERMISSIONS.md](./PERMISSIONS.md) for what the app reads, changes and sends to TOAB Moderator, and why it needs each one.

## Install and configure

1. Install the TOAB Jitsi app in Cal.com.
2. In the Cal.com admin settings, configure these app keys for `toab_jitsi`:
   - `moderatorHost`: Moderator base URL, such as `https://moderator.example.com`.
   - `auth0Domain`: Auth0 tenant host, such as `tenant.eu.auth0.com`.
   - `auth0Audience`: Moderator API audience.
   - `auth0TokenUrl` (optional): OAuth token endpoint. By default the app uses `https://<auth0Domain>/oauth/token`.
   - `auth0ClientId` and `auth0ClientSecret`: Auth0 machine-to-machine credentials authorized for the Moderator API.
3. For local development, sign in with the seeded Cal.com admin account and open `/settings/admin` to configure app keys. The seeded admin account is defined in [`packages/prisma/seed.ts`](https://github.com/calcom/cal.diy/blob/main/packages/prisma/seed.ts).
4. In an event type, enable TOAB Jitsi, choose “TOAB Jitsi Video” as its location, and save. Reopen the app settings and select one of the organizer’s Moderator servers.

Admin app keys are defined in `zod.ts` and managed by Cal.com. Keep the Auth0 client secret in the admin app keys; it is never stored in event app data or sent to the browser. The server caches the M2M access token until shortly before it expires.

## Integration endpoints

The app serves its endpoints below the Cal.com base URL:

- `<baseUrl>/api/integrations/toab_jitsi/config?eventTypeId=<id>` looks up the organizer in Moderator and loads their servers. The browser caches a successful result for five minutes and shares it between app-card prefetch and settings.
- `<baseUrl>/api/integrations/toab_jitsi/location?eventTypeId=<id>` checks the event type’s currently saved location whenever settings open. This check is intentionally fresh.

The conference adapter creates, retrieves the meeting URL for, and cancels conferences through the Moderator API.
