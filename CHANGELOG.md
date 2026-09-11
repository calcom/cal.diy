# Changelog

All notable changes to the `cal.diy` fork are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this fork
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Upstream (Cal.com) tracks
its own versioning under `v6.x`; the fork moves to `v7.x` to mark its independent line.

## [7.5.2] — 2026-09-11

Fixes the `PRUNE_DEV_DEPENDENCIES=true` path of the Clever Cloud post-build
hook introduced in 7.5.1, which aborted the deploy:

```
calcom-monorepo@workspace:. STDERR command not found: husky
[ERROR] POST_BUILD_HOOK failed, aborting
```

`YARN_ENABLE_SCRIPTS=0` only silences dependency build scripts; the root
workspace's own `postinstall` (`husky install && turbo run post-install`) still
ran during `yarn workspaces focus --all --production`, and both `husky` and
`turbo` are devDependencies the focus had just removed.

The `postinstall` is now stripped from `package.json` for the duration of the
re-link and restored afterwards — a `trap` on `EXIT` covers a failing focus.
The Prisma client is regenerated after the prune
(`yarn workspace @calcom/prisma prisma generate`; `prisma` is a regular
dependency and survives) rather than trusting that the re-link of
`@prisma/client` left it in place.

The default path of the hook — caches only, no prune — was unaffected.
Verified in a sandbox with a stub `yarn`: `package.json` is restored
identically whether the focus succeeds or fails.

## [7.5.1] — 2026-09-11

The fork is deployed to Clever Cloud as a Node application, not as a
container, and the deployed directory is the whole checkout after
`yarn build` — 7.8 GB on v7.5.0. This release drops the Docker packaging and
adds a post-build hook that trims what `next start` never reads.

### Docker packaging removed

`Dockerfile`, `docker-compose.yml`, `.dockerignore`, the `release-docker`
workflow — which was rebuilding an 8 GB image on every `v*` tag — the
`docker-build-and-test` action and the three scripts only the Dockerfile used
(`start.sh`, `replace-placeholder.sh`, `wait-for-it.sh`) are gone. All of it is
recoverable from `v7.5.0` if a container build is ever wanted again. Dev-only
compose files (prisma, emails, api v2) stay.

### Clever Cloud post-build trim

`scripts/clever/post-build.sh`, wired through
`CC_POST_BUILD_HOOK=./scripts/clever/post-build.sh`:

- always removes the build caches — `.turbo` (1.1 GB), `.yarn/cache` and
  `install-state.gz` (0.8 GB), `apps/web/.next/cache` (~1 GB);
- deletes the browser source maps once Sentry has them, i.e. when
  `SENTRY_AUTH_TOKEN` is set and `yarn build` uploaded them; without an upload
  they stay, being the only way to read a stack trace;
- prunes devDependencies with `yarn workspaces focus --all --production`
  (~2 GB of the 3.5 GB `node_modules`) behind `PRUNE_DEV_DEPENDENCIES=true`, a
  custom variable read by the hook. Opt-in because `turbo`, `ts-node` and every
  other devDependency disappear: the run command must not go through `turbo`
  (`yarn workspace @calcom/web start` works) — `prisma` itself stays, being a
  regular dependency of `packages/prisma`. Lifecycle scripts are disabled
  during the re-link, since native modules were already built and the root
  `postinstall` needs `turbo`.

Expected: 7.8 → ~4.5 GB by default, ~2.5 GB with the prune. Verified with a
dry run of the hook on a mock tree; the first real deploy with the hook is the
actual validation.

## [7.5.0] — 2026-09-11

Fork synchronised with `upstream/main` up to #30124, and the runtime
dependencies brought back under the `high` advisory line — `next`, `nodemailer`,
`sharp` and `kysely` all carried an open advisory reachable from a request.

### Upstream sync

Nine commits cherry-picked with `-x`; `git cherry` confirmed the other
forty-six upstream commits were already applied by v7.3.0, and #29648 was
already present with the fork's trailing-newline fix. No conflict. Notable
ones: HitPay (#30039) and PayPal (#29984) no longer scale amounts in
zero-decimal currencies (JPY, KRW…) — a ¥1000 booking was charged ¥10;
`updateUser`'s `tempOrgRedirect` rewrite now runs on the transaction client
instead of the global one (#30096), so a failed rename no longer leaves stale
redirects behind; dynamic group bookings pick the conferencing app of the
*first* username in the URL, as `handleNewBooking` already did (#30124) —
the booking page could advertise a different location than the one booked;
`Tooltip` wraps non-element children in a `<span>` and renders bare children
when it has no content, silencing the React 19 ref deprecation warning
(#30111); `CalVideoSettings` booleans document `default: false` in the v2
OpenAPI spec (#30088); the unused `TokenHandler` component is removed (#30084);
Japanese (#29970) and Polish (#30107) translations.

### Security — dependencies

- `next` 16.2.12 → 16.3.4 on `apps/web` — GHSA-2xp9-vwfh-vxw4, unauthenticated
  RCE through the image optimisation endpoint on a crafted AVIF file. Mitigated
  on this fork by `images.unoptimized: true`, but the endpoint still exists;
  also GHSA-p293-qw3h-jr36 (Windows hosts only). Docs and example workspaces
  aligned on 15.5.25 / 16.3.4.
- `nodemailer` 9.0.5 → 9.1.1 — GHSA-2x7j-588g-ccc2, quadratic `addressparser`
  on a crafted address list. Reachable: attendee addresses come from the
  booker. Aligned in `packages/features/auth` too, which still declared 9.0.5.
- `sharp` 0.33.5 → 0.35.4 — inherited libvips and libheif CVEs
  (GHSA-f88m-g3jw-g9cj, GHSA-rgj7-g3m4-5g8c), on the logo/avatar upload path.
  `metadata().format` is now typed as `keyof FormatEnum`, which exposed two
  dead branches in `detectImageFormat`: libvips has always reported AVIF as
  the `heif` container and `jpg` never existed. The fallback now matches
  `heif` with `compression === "av1"`, so AVIF files without the `ftyp` magic
  at offset 4 are actually detected.
- `kysely` 0.28.14 → 0.28.17 — GHSA-pv5w-4p9q-p3v2, JSON-path injection through
  unsanitised metacharacters in `JSONPathBuilder.key()`/`.at()`.
- Via `resolutions`: `multer` 2.2.0 → 2.3.0 (three multipart DoS, API v2),
  `express-rate-limit` 8.2.2 → 8.7.0, `ws` 8.21.3 / 7.5.13 (fragment memory
  exhaustion), `engine.io` 6.6.10 (polling connection exhaustion, WebTransport
  SID DoS), `postcss` 8.5.28 (arbitrary file read through `sourceMappingURL`).

Highs on runtime dependencies 29 → 0; the one remaining critical
(`next` 15.x, Windows-only) sits on the docs workspace. No major-version
change, no new peer-dependency warning.

### Still open

`ip-address` 9.0.5 (SSRF through leading-zero octets) is reached only through
`socks` and needs a major bump; `fast-xml-builder` and `vite` (Windows-only
`server.fs.deny` bypass) are build tooling. None is reachable from a request.

The `apps/web` production build was not run locally; verified with
`type-check:ci` (9/9), `TZ=UTC yarn vitest run` on HitPay/PayPal (10 green)
and `packages/lib/server packages/features/auth apps/web/lib` (248 green
across 20 files), and Biome.

## [7.4.0] — 2026-08-17

Adds a generic OpenID Connect login provider, so a self-hosted instance can
authenticate against Keycloak — or any other compliant IdP (Authentik, Zitadel,
Okta…) — instead of Google.

### Generic OIDC provider

Endpoints are resolved from the IdP's discovery document
(`${OIDC_ISSUER}/.well-known/openid-configuration`) rather than hardcoded, so one
implementation covers every compliant provider. Google, Azure AD and credentials
login are untouched.

The provider is opt-in and inert by default: it is only registered when
`OIDC_LOGIN_ENABLED=true` *and* issuer, client id and client secret are all set.
Existing deployments see no change. `IdentityProvider.OIDC` is a new enum value —
the migration is purely additive (`ALTER TYPE … ADD VALUE`) and touches no
existing rows.

### Accounts are namespaced per issuer

`sub` is only unique within its own issuer, so persisting it alone would let a
replacement IdP that reuses a subject identifier resolve the account created for
the previous one — NextAuth looks the account up before the `signIn` callback
ever runs. The persisted `providerAccountId` is `sha256(issuer):sub`, so a
different issuer yields a different account.

The practical consequence: changing `OIDC_ISSUER` detaches the accounts created
under the previous one. Users are signed back in through the regular
verified-email matching on their next login.

### UserInfo claims are read, not just the ID token

NextAuth builds the raw profile from the ID token claims when `idToken: true` and
never calls UserInfo on its own, which rejected compliant IdPs that only release
`email`, `email_verified` or `name` there. A `userinfo.request` handler — which
takes precedence over `idToken` in NextAuth's OAuth callback — now merges both,
the ID token winning on conflicts so a signed `email_verified: false` cannot be
overridden by a laxer UserInfo response. The UserInfo `sub` must be present and
identical to the token's (OIDC Core 5.3.2); `openid-client` performs no such
check here, since it is handed the raw access token rather than a `TokenSet`. A
UserInfo network failure falls back to the token claims.

### Account linking

Linking reuses the existing matrix rather than introducing a parallel path. An
OIDC identity auto-merges onto a matching account whose email is verified on both
sides — including an account originally created through Google, which keeps its
bookings, username and teams. Converting a `CAL` account still requires
`emailVerified` to already be true, so the anti pre-hijacking guard added for
Google and Azure AD applies unchanged. The merge trusts the IdP's
`email_verified` claim, as it already does for Google and Azure AD.

`checkIfUserShouldBelongToOrg` accepts `OIDC` alongside Google and Azure AD; this
has no effect unless `ORGANIZATIONS_AUTOLINK` is enabled.

### Not covered

The real OAuth negotiation was never exercised: discovery, PKCE and the code
exchange need a live IdP. The tests cover claim handling and identity linking
only, so a manual run against a real Keycloak instance is still advisable before
enabling this in production.

Every new variable is documented in `.env.example`. Verified with
`type-check:ci` (9/9), `TZ=UTC yarn vitest run packages/features/auth/lib` (131
green across 8 files), and Biome.

## [7.3.1] — 2026-08-17

Closes the last `high` advisory v7.3.0 left open, on `nodemailer` — bumped
7.0.12 → 9.0.5.

The advisory: the message-level `raw` option bypassed `disableFileAccess` /
`disableUrlAccess`, allowing arbitrary file read and full message forgery
(fixed in 9.0.1). The bump also clears five more advisories on the same
package — SMTP command injection via `envelope.size` and via CRLF in the
transport name, CRLF injection in `List-*` header comments, a `jsonTransport`
bypass of the same file/url access flags, and improper TLS certificate
validation when fetching OAuth2 tokens.

Three breaking changes sit between the two versions; none applies here:

- `8.0.0` renames error code `NoAuth` to `ENOAUTH` — neither is referenced in
  this repository.
- `9.0.0` makes remote content fetches validate TLS certificates by default
  (attachment `href`/`path`, OAuth2 token endpoints, proxy `CONNECT`). The two
  templates that attach transcripts fetch them themselves and pass a `Buffer`
  as `content`, so nodemailer issues no request of its own; `icalEvent` is
  likewise inline through `generateIcsFile`; and `detectTransport()` produces
  neither an OAuth2 transport nor a proxy. Distinct from the SMTP connection's
  own `tls.rejectUnauthorized`, which this change does not touch and which
  stays driven by `serverConfig` — self-hosters on a self-signed SMTP
  certificate are unaffected.
- `7.0.0` (SESv2 SDK) predates the version in use.

`@types/nodemailer` moved 6.4.5 → 8.0.1 in the same pass, the old types still
describing nodemailer 6. Nodemailer still ships no types of its own, so the
`@types` package remains necessary.

Production advisories 106 → 100, highs 29 → 28. No new advisory. Verified with
`type-check:ci` (9/9), `TZ=UTC yarn vitest run packages/emails
packages/features/auth/lib` (129 green across 13 files), and Biome.

## [7.3.0] — 2026-08-17

Fork synchronised with `upstream/main` up to #29940, and the security
`resolutions` block brought back up to date.

### Upstream sync

Nineteen commits cherry-picked with `-x`; `git cherry` confirmed the other
twenty-eight upstream commits were already applied to the fork. Notable ones:
`parseIpFromHeaders` now trims whitespace (#29857) — untrimmed headers let a
crafted `X-Forwarded-For` slip past the IP banlist; all seat payments are
refunded when a paid seated booking is cancelled (#29685); cancelled bookings
send `METHOD:CANCEL` in their ICS (#29708); `customReplyToEmail` is no longer
dropped when `hideOrganizerEmail` is set (#29940); `getEventLocationType` is
renamed to `getLocationByType` (#28567).

One conflict, in `markdownToSafeHTML.ts` and `markdownToSafeHTMLClient.ts`:
#29648 rewrites the `.replace()` chain the fork had amended for SEC-203. Both
intents are kept — the fork's `rel="noopener noreferrer"` on every new-tab link
**and** upstream's `h1`/`h2` rendering.

### Security — dependencies

The CI `security-audit` job was already failing: it blocks on
`yarn npm audit --severity critical` and three critical advisories were open.
None of them comes from the sync — no cherry-picked commit touches a manifest.
The cause is that the security `resolutions` block had drifted, several entries
pinning a version that had since become vulnerable (`axios` held at 1.15.0 when
the fix landed in 1.16.0, likewise `tar`, `form-data`, `multer`, `hono`,
`protobufjs`).

- `next-auth` 4.24.13 → 4.24.15 — GHSA-7rqj-j65f-68wh: the email normaliser
  validates the address *before* Unicode normalisation, so an `@` homoglyph
  bypasses account matching on the magic-link flow. The only one of the three
  criticals on a real authentication path, and on a flow this fork already
  hardened (SEC-008).
- `tar` 7.5.11 → 7.5.22 (decompression DoS, via `sqlite3` ← `saml-jackson`) and
  `websocket-driver` 0.7.4 → 0.7.5 (message corruption, via `faye-websocket`).
- Markdown path, widened by #29648 now that headings render: `sanitize-html`
  2.17.0 → 2.17.7 (incomplete URI scheme validation let `javascript:` through
  `action`/`formaction`/`poster`), `dompurify` 3.3.2 → 3.4.13, `linkify-it`
  5.0.0 → 5.0.2 (quadratic DoS on attacker text).
- `next` 16.2.3 → 16.2.12 on `apps/web` — App Router middleware bypass, SSRF via
  rewrites, Server Actions DoS. Docs and example workspaces aligned too: no
  production code, but they accounted for 43 advisories and drowned the signal.
- `axios` 1.19.0, `form-data` 4.0.6, `multer` 2.2.0, `hono` 4.13.2,
  `protobufjs` 7.6.5, `@xmldom/xmldom`, `brace-expansion`, `nanoid` 3.x,
  `js-yaml` 4.3.1, `fast-uri` 3.1.5.

Production advisories 265 → 106; criticals 3 → 0; highs 93 → 29. No new
advisory, no major-version change, no new peer-dependency warning.

### Still open

`nodemailer` stays on 7.0.12 with a `high`: the message-level `raw` option
bypasses `disableFileAccess`/`disableUrlAccess`, allowing arbitrary file read.
The fix requires 9.x — a major on the email path, deliberately left to its own
change. The remaining highs are mostly build-tooling DoS (`vite`, `postcss`,
`glob`, `tmp`, `svgo`) or transitives not reachable from a request.

## [7.2.1] — 2026-07-15

The 2FA login screen returned a bare "something went wrong" for every kind of
failure. The two-factor branch of `authorizeCredentials` had three unguarded
throw sites — `symmetricDecrypt`, `totpAuthenticatorCheck`, and the dynamic
import of `@calcom/lib/totp`. None was caught or logged, so a raw exception
escaped `authorize()` and reached the client as an **unmapped** error code,
which the login view renders through its `t("something_went_wrong")` fallback.
That message is indistinguishable from a wrong password, a wrong code, or a
rate limit, and it left no trace in the logs whatsoever. v7.0.4 instrumented
the OAuth path but left the classic and 2FA branches silent.

Each throw site now logs and maps to a known `ErrorCode`:

- `2fa-secret-decrypt-threw` — key does not match the ciphertext, or corrupt row
- `2fa-totp-check-threw` — bundle import failure, or non-base32 secret
- `2fa-secret-bad-length` — decrypted, but unexpected length
- `incorrect-2fa-code` — genuinely wrong TOTP
- `incorrect-password` / `no-password-hash` — classic credentials path

The decrypt log carries `storedFormat` (`v1-cbc` / `v2-gcm`). A wrong key and a
corrupted row raise the same exception; the payload's format is what tells them
apart.

User-visible change: these failures now surface as `InternalServerError`, which
the client maps to a real message. The previous bare error literally meant
"unrecognised error code".

This release is observability only — it changes no authentication logic.

- `next-auth-options.ts`: catch, log and map the three throw sites; instrument
  the classic credentials path.
- `crypto-clever.ts`: `isLegacyCiphertext` is now read at runtime, so its
  docstring no longer claims it is test-only.
- `next-auth-options.test.ts`: 5 cases, one per mapping. The two covering the
  raw throws fail against the unpatched code.

## [7.0.5] — 2026-05-27

Team invitations were effectively broken end to end. The "Accept invite"
button in the invite email linked to
`/auth/login?callbackUrl=/teams?inviteToken=…`, which (a) targeted `/teams` —
a route that does not exist in this fork (only `/settings/teams`) — and (b)
left the nested `?inviteToken=` unencoded, so it was parsed as a param of
`/auth/login` and dropped. The in-app team list also showed pending invites
with only a "pending" badge and no way to accept them; clicking the row
navigated to the team profile, which threw `FORBIDDEN` and rendered as
"Team not found".

- `inviteMember.handler.ts`: point `joinLink` at the existing `/settings/teams`
  route with a properly URL-encoded `callbackUrl` carrying the invite token.
- `settings/teams` view: add Accept/Decline buttons on pending invites,
  auto-accept the matching invite when arriving via `?inviteToken=`, and stop
  linking pending teams to the profile page (which 403s for non-members).
- `inviteMember.test.ts`: new tests covering the encoded invite link and the
  no-account no-op.

The backend `acceptOrLeave` handler already supported both tokenless in-app
accept and the token defense-in-depth path, so it was unchanged.

## [7.0.4] — 2026-05-23

Follow-up to v7.0.3. The previous fix only triggered when `user.password.hash`
was null, which left **hybrid accounts** broken — e.g. an account created
through email/password that later linked Google. The signIn callback would
correctly redirect those to TOTP, but `authorizeCredentials` then fell into
the classic credentials branch with an empty `password` field and rejected
the login. Discovered in production with `idP=GOOGLE`, `hasPasswordHash=true`,
`twoFactorEnabled=true`.

Authorization mode is now driven by the **presence of `totpToken`**, not by
the absence of a password. The signed JWT (HS256, 2-min TTL, issued by the
signIn callback after the IdP step) is the canonical proof of having
completed OAuth — its presence routes the request through the OAuth+2FA
branch regardless of whether a password is also set on the account.

- `next-auth-options.ts`: split authorize logic into `isOAuthContinuation`
  (totpToken present, JWT verified, idP !== CAL, totpCode present) vs
  classic credentials. Adds instrumentation at every reject point
  (`authorize:entry`, `:user-lookup-result`, `:reject:user-not-found`,
  `:reject:user-locked`, `:reject:rate-limit`, `oauth-2fa-*`) so future
  regressions are diagnosable from logs alone.
- `next-auth-options.test.ts`: new test for the hybrid case
  (password hash + idP=GOOGLE + 2FA + valid JWT → success).

Operational note: this fork's rate limiter (`packages/lib/rateLimit.ts`)
fails closed in production when `UNKEY_ROOT_KEY` is missing or its key lacks
`ratelimit.*` permissions. The same login symptom (`401` with no
`authorize:entry` log) will appear if Unkey returns a permission error,
since `checkRateLimitAndThrowError` runs before any auth logic. See
SEC-200 docstring in `rateLimit.ts`.

## [7.0.3] — 2026-05-22

Hotfix: Google/Azure OAuth users with 2FA enabled could no longer complete login.
Upstream #25563 simplified the credentials provider authorize flow and removed
the branch that allowed OAuth users (no password hash) to authenticate via TOTP
alone. After the IdP step the signIn callback still redirects to
`/auth/login?totp=<signed JWT>`, but the TOTP form submission was then rejected
with `IncorrectEmailPassword` because the user has no password.

We re-allow this path under a stricter contract: the JWT issued by the signIn
callback is now forwarded as a hidden credential (`totpToken`) and re-verified
inside `authorizeCredentials`. The password check is skipped only when (a) the
user has no password hash, (b) `identityProvider !== CAL`, (c) a valid
unexpired JWT (HS256, matching issuer/audience) is supplied, and (d) its email
matches the user. The existing TOTP code check still runs unchanged.

- `packages/features/auth/lib/verifyTotpLoginJwt.ts` (new)
- `packages/features/auth/lib/next-auth-options.ts`: accept `totpToken`; gated
  bypass of password check for OAuth users; preserves all previous reject paths.
- `apps/web/modules/auth/login-view.tsx`: forward `?totp=` query param as
  `totpToken` in `signIn("credentials", …)`. Also seed `email` via
  `useForm({ defaultValues })` when arriving on the TOTP step from the JWT
  redirect — the email input is not rendered in 2FA mode, so without a
  seeded default the Zod schema rejected `email: undefined` and
  `handleSubmit` silently swallowed the click.
- Tests: 4 new cases in `next-auth-options.test.ts` (happy path; email mismatch;
  invalid/expired JWT; CAL user with JWT still rejected). 41/41 passing.

## [7.0.0] — 2026-05-22

Closes the 5-sprint security audit remediation (Sprints 0 → 4). 62 commits, 193 files,
+14 581 / -472 lines. ~47 tickets resolved in code; remaining items deferred to
`audit/OPS_TODO.md` (ops/PM responsibility).

This is a **major** release: several behavioural defaults change in ways that are visible
to operators and end-users. See **Breaking Changes** below.

### Breaking Changes

- **Password minimum length raised from 7 to 12 characters.** Existing users keep their
  passwords; new sign-ups and password resets are rejected below 12. [`SEC-005`]
- **Admin tRPC routes optionally require 2FA** via `REQUIRE_2FA_FOR_ADMIN=true`. Off by
  default in this release; flip after admins enroll. [`SPRINT3-041`]
- **`teams.create` defaults `isPrivate=true`.** Previously public-by-default.
  [`SEC-307+308-FORK`]
- **Per-user team-creation quota.** `MAX_TEAMS_PER_USER` (default 50). [`SEC-303-FORK`]
- **Admin team deletion refuses to drop teams with future ACCEPTED/PENDING bookings**
  unless `force: true` is passed. [`SEC-306-FORK`]
- **`adminList` returns `{ teams, nextCursor }`** instead of a bare array. Callers must
  paginate. [`BUG-101-FORK`]
- **`requireMember` returns `{ id: null, isSyntheticAdmin: true }`** for system admins
  instead of fake `id: -1`. Update any downstream consumers reading `.id` blindly.
  [`BUG-102-FORK`]
- **Avatar / team-image upload caps tightened.** `imageField` 1 MiB → **256 KiB** with
  MIME `refine` (`png|jpe?g|svg+xml|webp`); base64 avatar route hard-capped at 8 MiB with
  PNG/JPEG magic-bytes validation. [`SEC-015`, `SEC-304-FORK`]
- **`/api/logo` capped at 5 MiB** (returns 413 above). [`PERF-011`]
- **Markdown links emit `target="_blank" rel="noopener noreferrer"`.** [`SEC-203`]
- **CSP enforced on `/auth/login` and `/login`**, Report-Only everywhere else;
  `script-src` reduced to `'nonce-{nonce}' 'strict-dynamic'`. Inline scripts without the
  nonce will be blocked once Report-Only is flipped to enforce. [`SEC-201`, `SEC-205`]
- **Reset-password tokens are atomically consumed** via `updateMany({ where: { id, expires: { gt: now } } })`.
  Tokens are single-use; double-submits return 404. [`BUG-002`]
- **`/api/auth/two-factor/totp/disable` always requires password**, even for OAuth-only
  identities. [`SEC-011`]

### Added

- `FORK-NOTES.md` — branch model, shim pattern, divergence inventory, rebase procedure
  against upstream. [`FORK-301-FORK`]
- `audit/REMEDIATION_STATUS.md`, `audit/OPS_TODO.md` — sprint-by-sprint remediation
  tracking and ops backlog.
- `packages/prisma/migrations/MIGRATIONS.md` — documents the `CREATE INDEX CONCURRENTLY`
  pattern and `@prisma:no-transaction` directive. [`BUG-011`]
- `packages/features/audit-log/adminAuditLog.ts` — structured `recordAdminAction` audit
  trail (`granted` / `denied` outcomes, actor, target, reason) wired into every admin
  tRPC handler. [`SEC-305-FORK`]
- `packages/lib/crypto-clever.ts` — externalised AES-256-GCM logic with `v2:` prefix
  shim; reduces `crypto.ts` divergence from upstream to 3 lines. [`FORK-REFACTOR`]
- `packages/trpc/server/routers/viewer/webhook/authorization-clever.ts` — externalised
  webhook authorization helpers; `util.ts` diff vs upstream now ~5 lines. [`FORK-300-FORK`]
- OAuth refresh in-process mutex via `Map<userId::appSlug, Promise>` to coalesce
  concurrent token refreshes. [`SEC-107`]
- SSRF validation for CalDAV and ICS feed URLs. [`SEC-104`]
- Sentry `beforeSend` PII scrubbing with edge-runtime guard. [`RGPD-302`]
- Renovate config with `rangeStrategy: pin` and `@radix-ui/*` grouping. [`SEC-309-FORK`]
- GitHub Actions workflows: Semgrep (OWASP/TS/React/Node/secrets) + CodeQL
  (`security-extended`), both uploading SARIF. [`FORK-302-FORK`]
- `isSillyEnabled(log)` helper guarding hot-path `logger.silly` call sites
  (`EventManager`, `getBusyTimes`). [`PERF-002`]
- DST-aware `getWorkingHours` via optional `forDate` on `relativeTimeUnit`. [`BUG-004`]
- DST-aware `getUTCOffsetByTimezone(zone, date)` in booking time-bounds validation.
  [`BUG-003`]
- Recurring booking creation batched at 5 concurrent (`Promise.all` bounded). [`BUG-006`]
- `adminList` cursor pagination (`take: limit + 1`, `nextCursor`). [`BUG-101-FORK`]
- Invite email + atomic invite-token consumption. [`SEC-302-FORK`, `BUG-100-FORK`]

### Changed

- `EnvVars`: new `REQUIRE_2FA_FOR_ADMIN`, `MAX_TEAMS_PER_USER` (default 50),
  `MAX_BASE64_IMAGE_BYTES`. See `.env.example`.
- `getCspHeader` accepts a tri-state `{ mode: "enforce" | "report-only" | "off" }` in
  addition to the legacy `{ shouldEnforceCsp }` signature.
- `apps/web/proxy.ts` matcher broadened to cover all page paths for CSP injection.
- Lark / Feishu / Webex calendar+video adapters no longer swallow OAuth errors silently
  (`catch (err) { logger.warn(..., err); throw }`). [`BUG-007`]

### Fixed

- Reset-password token race condition (atomic consume). [`BUG-002`]
- Booking time-zone DST handling at slot boundaries. [`BUG-003`]
- Working-hours DST handling. [`BUG-004`]
- Recurring booking unbounded parallelism. [`BUG-006`]
- Webhook authorization branching (5-line diff vs upstream now isolated in
  `authorization-clever.ts`). [`FORK-300-FORK`]

### Security

This release closes ~47 audit findings. Headline tickets:

| ID                  | Theme                                                  |
| ------------------- | ------------------------------------------------------ |
| `SEC-005`           | Password min length 7 → 12                             |
| `SEC-011`           | 2FA disable requires password (incl. OAuth identities) |
| `SEC-015`           | Avatar base64 upload size + magic-bytes                |
| `SEC-104`           | SSRF validation (CalDAV, ICS feeds)                    |
| `SEC-107`           | OAuth refresh mutex (no concurrent refresh)            |
| `SEC-201` `SEC-205` | CSP Report-Only rollout + script-src tightened         |
| `SEC-203`           | Markdown links `rel="noopener noreferrer"`             |
| `SEC-302-FORK`      | Invite email + atomic token consumption                |
| `SEC-303-FORK`      | Per-user team-creation quota                           |
| `SEC-304-FORK`      | Team imageField size + MIME refine                     |
| `SEC-305-FORK`      | Admin audit trail (structured `recordAdminAction`)     |
| `SEC-306-FORK`      | adminDelete refuses future bookings without `force`    |
| `SEC-307+308-FORK`  | `teams.create` defaults `isPrivate=true`               |
| `SEC-309-FORK`      | Strict-pin Radix, Renovate config                      |
| `RGPD-302`          | Sentry PII scrubbing + edge-runtime guard              |
| `FORK-300/301/302`  | Webhook auth shim, fork notes, Semgrep+CodeQL          |

### Deferred (tracked in `audit/OPS_TODO.md`)

- Flip `REQUIRE_2FA_FOR_ADMIN=true` after admin enrollment.
- Flip CSP Report-Only → enforce after 48 h observation window.
- Wire admin-audit log to SIEM.
- Install Renovate GitHub App; enable GitHub Code Scanning (GHAS).
- Prisma indexes pending EXPLAIN ANALYZE on prod data (`SPRINT3-010/011/012`).
- Reset-token SHA-256 storage + schema migration (`SEC-007`, PM decision).
- ISR for public pages (`PERF-003`), `getPublicEvent` bundle (`PERF-009`).
- RGPD documentation: DPIA, `/privacy`, retention policy, breach notification
  (`SPRINT4-100..103`).
- Investigations: `INVEST-001..003`.
- P3 batched cleanup epic (~20 items): `SEC-004/010/013/014/016/017/108/207`,
  `BUG-008/010/012/014`, `PERF-006/007/008/100-FORK`.

### Notes

- This fork is now tagged `v7.0.0`. Upstream Cal.com `v6.x` continues on its own line;
  see `FORK-NOTES.md` for rebase procedure.
- The monorepo root `package.json` is bumped from `0.0.0` to `7.0.0` to track the fork
  release line; `apps/web/package.json` is bumped from `6.2.0` to `7.0.0` accordingly.
- Pre-remediation baseline preserved as tag `pre-remediation-20260520`. Sprint
  checkpoints: `sprint-0-closed` … `sprint-4-closed`.

[7.0.0]: https://github.com/sebartyr/cal.diy/releases/tag/v7.0.0
