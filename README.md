> [!WARNING]  
> Use at your own risk. Cal.diy is the open source community edition of Cal.com and it is intended for users who want to self-host their own Cal.diy instance. It is strictly recommended for personal, non-production use. Please review all installation and configuration steps carefully. Self-hosting requires advanced knowledge of server administration, database management, and securing sensitive data. Proceed only if you are comfortable with these responsibilities.

> [!TIP]
> For any commercial and enterprise-ready scheduling infrastructure, use Cal.com, not Cal.diy; hosted by us or get invited to on-prem enterprise access here: <a href="https://cal.com/sales">https://cal.com/sales</a>

<!-- PROJECT LOGO -->
<p align="center">
  <a href="https://github.com/calcom/cal.diy">
   <img src="https://user-images.githubusercontent.com/8019099/210054112-5955e812-a76e-4160-9ddd-58f2c72f1cce.png" alt="Logo">
  </a>

  <h3 align="center">Cal.diy</h3>

  <p align="center">
    The community-driven, open-source scheduling platform.
    <br />
    <a href="https://github.com/calcom/cal.diy"><strong>GitHub</strong></a>
    <br />
    <a href="https://github.com/calcom/cal.diy/issues">Issues</a>
    &middot;
    <a href="./CONTRIBUTING.md">Contributing</a>
  </p>
</p>

<p align="center">
   <a href="https://github.com/calcom/cal.diy/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-purple" alt="License"></a>
   <a href="https://github.com/calcom/cal.diy/stargazers"><img src="https://img.shields.io/github/stars/calcom/cal.diy" alt="Github Stars"></a>
   <a href="https://github.com/calcom/cal.diy/pulse"><img src="https://img.shields.io/github/commit-activity/m/calcom/cal.diy" alt="Commits-per-month"></a>
   <a href="https://hub.docker.com/r/calcom/cal.diy"><img src="https://img.shields.io/docker/pulls/calcom/cal.diy" alt="Docker Pulls"></a>
   <a href="https://github.com/calcom/cal.diy/issues?q=is:issue+is:open+label:%22%F0%9F%99%8B%F0%9F%8F%BB%E2%80%8D%E2%99%82%EF%B8%8Fhelp+wanted%22"><img src="https://img.shields.io/badge/Help%20Wanted-Contribute-blue"></a>
   <a href="https://contributor-covenant.org/version/1/4/code-of-conduct/"><img src="https://img.shields.io/badge/Contributor%20Covenant-1.4-purple" /></a>
</p>

<!-- ABOUT THE PROJECT -->

## About Cal.diy

<img width="100%" alt="booking-screen" src="https://github.com/calcom/cal.diy/assets/8019099/407e727e-ff19-4ca4-bcae-049dca05cf02">

**Cal.diy** is the community-driven, fully open-source scheduling platform — a fork of [Cal.com](https://cal.com) with all enterprise/commercial code removed.

Cal.diy is **100% MIT-licensed** with no proprietary "Enterprise Edition" features. It's designed for individuals and self-hosters who want full control over their scheduling infrastructure without any commercial dependencies.

### What's different from Cal.com?

- **No license key required** — Everything works out of the box, no Cal.com account or license needed
- **100% open source** — The entire codebase is licensed under MIT, no "Open Core" split
- **Small footprint** — One TanStack Start app on SQLite: run it on Cloudflare Workers with D1, or in a single Docker container on any machine, including a Raspberry Pi
- **Community-maintained** — Contributions are welcome and go directly into this project (see [CONTRIBUTING.md](./CONTRIBUTING.md))

> **Note:** Cal.diy is a self-hosted project. There is no hosted/managed version. You run it on your own infrastructure.

### Built With

- [TanStack Start](https://tanstack.com/start) and [React](https://react.dev/)
- [Drizzle ORM](https://orm.drizzle.team/) on [Cloudflare D1](https://developers.cloudflare.com/d1/) or a local SQLite/libSQL file
- [Better Auth](https://www.better-auth.com/) (passwords, Google sign-in, 2FA, API keys, teams and organizations)
- [Tailwind CSS](https://tailwindcss.com/)
- [Day.js](https://day.js.org/)

## Getting Started

### Prerequisites

- Node.js 22 or newer
- Yarn (run `corepack enable` once)

### Setup

```sh
git clone https://github.com/calcom/cal.diy.git
cd cal.diy
yarn install

cp apps/web/.env.example apps/web/.env
# Fill in BETTER_AUTH_SECRET (openssl rand -base64 32) and CALENDSO_ENCRYPTION_KEY
# (openssl rand -base64 24). Everything else is optional; the comments in the file say what each
# integration needs.

yarn dev    # http://localhost:3000, with a SQLite file at apps/web/data/cal.db
```

Migrations run when the server starts. Sign up at `/auth/signup`; the first account becomes the
instance admin.

Without email settings (`EMAIL_FROM` plus Resend or SMTP) no emails are sent: sign-in still works,
but password resets, email verification and team invitations need email.

### Cloudflare Workers runtime locally

```sh
cp apps/web/.dev.vars.example apps/web/.dev.vars
yarn db:migrate:d1:local
yarn dev:cf
```

### Checks and tests

```sh
yarn type-check
yarn lint:fix
yarn test    # unit tests
yarn e2e     # Playwright, on a throwaway database with fake Google, Microsoft, Zoom and Stripe servers
```

The browser tests need Chromium: `yarn workspace @calcom/web playwright install chromium`.

### Changing the schema

Edit `packages/db/src/schema.ts`, then run `yarn db:generate` to write a migration. See
[MIGRATION.md](./MIGRATION.md) for the rules SQL has to follow to run on D1.

## Deployment

### Docker (any machine, including a Raspberry Pi)

```sh
echo "BETTER_AUTH_SECRET=$(openssl rand -base64 32)" >> .env
echo "CALENDSO_ENCRYPTION_KEY=$(openssl rand -base64 24)" >> .env
echo "BETTER_AUTH_URL=http://raspberrypi.local:3000" >> .env   # the URL people will use
docker compose up -d --build
```

Or skip the build and pull the prebuilt image (amd64, arm64 and armv7), which the
`Docker image` workflow publishes to GitHub's container registry on every push to `main`:

```sh
IMAGE=ghcr.io/smithmanny/cal.diy:latest docker compose up -d --no-build
```

To build a multi-arch image yourself:

```sh
docker buildx build --platform linux/amd64,linux/arm64,linux/arm/v7 -t cal-diy .
```

The database lives at `/data/cal.db` in the `cal-data` volume. Set `RUN_MIGRATIONS=false` to apply
migrations yourself. Behind a reverse proxy that terminates TLS, set `TRUST_PROXY` so client IPs
and secure cookies work.

### Cloudflare Workers

```sh
npx wrangler d1 create cal-diy               # put the printed database_id into apps/web/wrangler.jsonc
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put BETTER_AUTH_URL      # e.g. https://cal.example.com
npx wrangler secret put CALENDSO_ENCRYPTION_KEY
yarn db:migrate:d1:remote
yarn deploy:cf
```

Add the optional integration settings with `wrangler secret put` in the same way.

### Moving from an existing Cal.com or Cal.diy install

`yarn import:postgres` copies an existing Postgres database (users, passwords, event types,
bookings, credentials, teams and more) into a new SQLite file or a SQL file for D1. See
[MIGRATION.md](./MIGRATION.md#migrating-from-an-existing-cal-install) for what comes across and
the steps.

## Integrations

Each integration is turned on by its settings in `apps/web/.env` (or Workers secrets). Redirect
URIs keep Cal's paths, so an OAuth app registered for an earlier install keeps working.

| Integration | Settings | Redirect URI |
| --- | --- | --- |
| Google sign-in, Google Calendar and Meet | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `<BETTER_AUTH_URL>/api/auth/callback/google` and `<BETTER_AUTH_URL>/api/integrations/googlecalendar/callback` |
| Outlook Calendar and Teams | `MS_GRAPH_CLIENT_ID`, `MS_GRAPH_CLIENT_SECRET` | `<BETTER_AUTH_URL>/api/integrations/office365calendar/callback` and `<BETTER_AUTH_URL>/api/integrations/office365video/callback` |
| Zoom | `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` | `<BETTER_AUTH_URL>/api/integrations/zoomvideo/callback` |
| Cal Video (Daily) | `DAILY_API_KEY` | |
| Jitsi | `JITSI_HOST` | |
| Stripe payments (Connect) | `STRIPE_PRIVATE_KEY`, `STRIPE_CLIENT_ID`, `STRIPE_WEBHOOK_SECRET` | `<BETTER_AUTH_URL>/api/integrations/stripepayment/callback`, webhook `<BETTER_AUTH_URL>/api/integrations/stripepayment/webhook` |
| Email | `RESEND_API_KEY`, or `EMAIL_SERVER_*` for SMTP (Docker only) | |
| Browser push notifications | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | |

CalDAV, Apple Calendar and the static-link video apps need no settings.

Webhooks can't target this server's own network (localhost, private addresses, Docker service
names) unless `ALLOW_PRIVATE_WEBHOOK_URLS=true` is set, for example to post to n8n on the same host.

## License

Cal.diy is fully open source, licensed under the [MIT License](https://opensource.org/license/mit).

## Contributing

We welcome contributions! Whether it's fixing a typo, improving documentation, or building new features, your help makes Cal.diy better.

> **Important:** Cal.diy is a community fork. Contributions to this repo do **not** flow to Cal.com's production platform. See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

- Check out our [Contributing Guide](./CONTRIBUTING.md) for detailed steps.
- Please follow our coding standards and commit message conventions to keep the project consistent.

Even small improvements matter — thank you for helping us grow!

### Good First Issues

We have a list of [help wanted](https://github.com/calcom/cal.diy/issues?q=is:issue+is:open+label:%22%F0%9F%99%8B%F0%9F%8F%BB%E2%80%8D%E2%99%82%EF%B8%8Fhelp+wanted%22) that contain small features and bugs which have a relatively limited scope. This is a great place to get started, gain experience, and get familiar with our contribution process.

<!-- CONTRIBUTORS -->

### Contributors

<a href="https://github.com/calcom/cal.diy/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=calcom/cal.diy" />
</a>

<!-- TRANSLATIONS -->

### Translations

Don't code but still want to contribute? help translate Cal.diy into your language.

<!-- ACKNOWLEDGEMENTS -->

## Acknowledgements

Cal.diy is built on the foundation created by [Cal.com](https://cal.com) and the many contributors to the original project. Special thanks to:

- [TanStack](https://tanstack.com/)
- [Drizzle](https://orm.drizzle.team/)
- [Better Auth](https://www.better-auth.com/)
- [Day.js](https://day.js.org/)
- [Tailwind CSS](https://tailwindcss.com/)
