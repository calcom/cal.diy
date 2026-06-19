# Cal.diy Development Guide for AI Agents

You are a senior Cal.diy engineer working in a Yarn/Turbo monorepo. You prioritize type safety, security, and small, reviewable diffs.

## Do

- Use `select` instead of `include` in Prisma queries for performance and security
- Use `import type { X }` for TypeScript type imports
- Use early returns to reduce nesting: `if (!booking) return null;`
- Use `ErrorWithCode` for errors in non-tRPC files (services, repositories, utilities); use `TRPCError` only in tRPC routers
- Use conventional commits: `feat:`, `fix:`, `refactor:`
- Create PRs in draft mode by default
- Run `yarn type-check:ci --force` before concluding CI failures are unrelated to your changes
- Import directly from source files, not barrel files (e.g., `@calcom/ui/components/button` not `@calcom/ui`)
- Add translations to `packages/i18n/locales/en/common.json` for all UI strings
- Use `date-fns` or native `Date` instead of Day.js when timezone awareness isn't needed
- Put permission checks in `page.tsx`, never in `layout.tsx`
- Use `ast-grep` for searching if available; otherwise use `rg` (ripgrep), then fall back to `grep`
- Use Biome for formatting and linting
- Only add code comments that explain **why**, not **what** — see [code comment guidelines](agents/rules/quality-code-comments.md)


## Don't

- Never use `as any` - use proper type-safe solutions instead
- Never expose `credential.key` field in API responses or queries
- Never commit secrets or API keys
- Never modify `*.generated.ts` files directly - they're created by app-store-cli
- Never put business logic in repositories - that belongs in Services
- Never use barrel imports from index.ts files
- Never skip running type checks before pushing
- Never create large PRs (>500 lines or >10 files) - split them instead
- Never add comments that simply restate what the code does (e.g., `// Get the user` above a `getUser()` call)

## PR Size Guidelines

Large PRs are difficult to review, prone to errors, and slow down the development process. Always aim for smaller, self-contained PRs that are easier to understand and review.

### Size Limits

- **Lines changed**: Keep PRs under 500 lines of code (additions + deletions)
- **Files changed**: Keep PRs under 10 code files
- **Single responsibility**: Each PR should do one thing well

**Note**: These limits apply to code files only. Non-code files like documentation (README.md, CHANGELOG.md), lock files (yarn.lock, package-lock.json), and auto-generated files are excluded from the count.

### How to Split Large Changes

When a task requires extensive changes, break it into multiple PRs:

1. **By layer**: Separate database/schema changes, backend logic, and frontend UI into different PRs
2. **By feature component**: Split a feature into its constituent parts (e.g., API endpoint PR, then UI PR, then integration PR)
3. **By refactor vs feature**: Do preparatory refactoring in a separate PR before adding new functionality
4. **By dependency order**: Create PRs in the order they can be merged (base infrastructure first, then features that depend on it)

### Examples of Good PR Splits

**Instead of one large "Add booking notifications" PR:**
- PR 1: Add notification preferences schema and migration
- PR 2: Add notification service and API endpoints
- PR 3: Add notification UI components
- PR 4: Integrate notifications into booking flow

**Instead of one large "Refactor calendar sync" PR:**
- PR 1: Extract calendar sync logic into dedicated service
- PR 2: Add new calendar provider abstraction
- PR 3: Migrate existing providers to new abstraction
- PR 4: Add new calendar provider support

### Benefits of Smaller PRs

- Faster review cycles and quicker feedback
- Easier to identify and fix issues
- Lower risk of merge conflicts
- Simpler to revert if problems arise
- Better git history and easier debugging

## Commands

See [agents/commands.md](agents/commands.md) for full reference. Key commands:

```bash
yarn type-check:ci --force  # Type check (always run before pushing)
yarn biome check --write .  # Lint and format
TZ=UTC yarn test            # Run unit tests
yarn prisma generate        # Regenerate types after schema changes
```


## Boundaries

### Always do
- Run type check on changed files before committing
- Run relevant tests before pushing
- Use `select` in Prisma queries
- Follow conventional commits for PR titles
- Run Biome before pushing

### Ask first
- Adding new dependencies
- Schema changes to `packages/prisma/schema.prisma`
- Changes affecting multiple packages
- Deleting files
- Running full build or E2E suites

### Never do
- Commit secrets, API keys, or `.env` files
- Expose `credential.key` in any query
- Use `as any` type casting
- Force push or rebase shared branches
- Modify generated files directly

## Project Structure

```
apps/web/                    # Main Next.js application
packages/prisma/             # Database schema (schema.prisma) and migrations
packages/trpc/               # tRPC API layer (routers in server/routers/)
packages/ui/                 # Shared UI components
packages/features/           # Feature-specific code
packages/app-store/          # Third-party integrations
packages/lib/                # Shared utilities
```

### Key files
- Routes: `apps/web/app/` (App Router)
- Database schema: `packages/prisma/schema.prisma`
- tRPC routers: `packages/trpc/server/routers/`
- Translations: `packages/i18n/locales/en/common.json`
- Workflow constants: `packages/features/ee/workflows/lib/constants.ts`

## Tech Stack

- **Framework**: Next.js 13+ (App Router in some areas)
- **Language**: TypeScript (strict)
- **Database**: PostgreSQL with Prisma ORM
- **API**: tRPC for type-safe APIs
- **Auth**: NextAuth.js
- **Styling**: Tailwind CSS
- **Testing**: Vitest (unit), Playwright (E2E)
- **i18n**: next-i18next

## Code Examples

### Good error handling

```typescript
// Good - Descriptive error with context
throw new Error(`Unable to create booking: User ${userId} has no available time slots for ${date}`);

// Bad - Generic error
throw new Error("Booking failed");
```

For which error class to use (`ErrorWithCode` vs `TRPCError`) and concrete examples, see [quality-error-handling](agents/rules/quality-error-handling.md).

### Good Prisma query

```typescript
// Good - Use select for performance and security
const booking = await prisma.booking.findFirst({
  select: {
    id: true,
    title: true,
    user: {
      select: {
        id: true,
        name: true,
        email: true,
      }
    }
  }
});

// Bad - Include fetches all fields including sensitive ones
const booking = await prisma.booking.findFirst({
  include: { user: true }
});
```

### Good imports

```typescript
// Good - Type imports and direct paths
import type { User } from "@prisma/client";
import { Button } from "@calcom/ui/components/button";

// Bad - Regular import for types, barrel imports
import { User } from "@prisma/client";
import { Button } from "@calcom/ui";
```

### API v2 Imports (apps/api/v2)

When importing from `@calcom/features` or `@calcom/trpc` into `apps/api/v2`, **do not import directly** because the API v2 app's `tsconfig.json` doesn't have path mappings for these modules, which causes "module not found" errors.

Instead, re-export from `packages/platform/libraries/index.ts` and import from `@calcom/platform-libraries`:

```typescript
// Step 1: In packages/platform/libraries/index.ts, add the export
export { ProfileRepository } from "@calcom/features/profile/repositories/ProfileRepository";

// Step 2: In apps/api/v2, import from platform-libraries
import { ProfileRepository } from "@calcom/platform-libraries";

// Bad - Direct import causes module not found error in apps/api/v2
import { ProfileRepository } from "@calcom/features/profile/repositories/ProfileRepository";
```

## PR Checklist

- [ ] Title follows conventional commits: `feat(scope): description`
- [ ] Type check passes: `yarn type-check:ci --force`
- [ ] Lint passes: `yarn lint:fix`
- [ ] Relevant tests pass
- [ ] Diff is small and focused (<500 lines, <10 files)
- [ ] No secrets or API keys committed
- [ ] UI strings added to translation files
- [ ] Created as draft PR

## When Stuck

- Ask a clarifying question before making large speculative changes
- Propose a short plan for complex tasks
- Open a draft PR with notes if unsure about approach
- Fix type errors before test failures - they're often the root cause
- Run `yarn prisma generate` if you see missing enum/type errors

## Spec-Driven Development (Opt-In)

For complex features, you can use spec-driven development when explicitly requested.

**To enable:** Tell the AI "use spec-driven development" or "follow the spec workflow"

See [SPEC-WORKFLOW.md](SPEC-WORKFLOW.md) for the full workflow documentation.

## Extended Documentation

For detailed information, see the `agents/` directory:

- **[agents/README.md](agents/README.md)** - Rules index and architecture overview
- **[agents/rules/](agents/rules/)** - Modular engineering rules
- **[agents/commands.md](agents/commands.md)** - Complete command reference
- **[agents/knowledge-base.md](agents/knowledge-base.md)** - Domain knowledge and business rules

---

## AIM Custom Features

Features added to the AIM fork that are NOT in the upstream cal.diy repo:

### Admin Impersonation ("Login as User")

Added 2026-06-19. Allows instance admins to take over any advisor's session for
full management (schedules, integrations, personal settings) without sharing
credentials.

**Entry point:** `/settings/admin/users` → DropdownActions → "Impersonate"

**API route:** `POST /api/auth/impersonate` — validates admin session server-side,
generates a signed NextAuth JWT as the target user (with `impersonatedBy` metadata),
and sets the session cookie. Admin ID is NEVER trusted from the request body.

**Security model:**
- Only `role='ADMIN'` users can impersonate
- Cannot impersonate yourself or locked users
- JWT is signed with `NEXTAUTH_SECRET` — cannot be forged
- Admin identity stored in `session.user.impersonatedBy` (readable server-side)

**UI:**
- Orange `ImpersonationBanner` shown at the top of all pages while impersonating
- "Click here to stop" calls `signOut()` and redirects to `/settings/admin/users`

**Files involved:**
- `apps/web/pages/api/auth/impersonate.ts` — API route (core logic)
- `apps/web/modules/users/components/ImpersonationBanner.tsx` — warning banner
- `apps/web/modules/shell/banners/LayoutBanner.tsx` — banner registry
- `apps/web/modules/users/components/UsersTable.tsx` — dropdown action
- `packages/i18n/locales/en/common.json` — `error_impersonating_user` key

**i18n keys used (already existed in upstream):**
- `impersonating_user_warning` — "Viewing as {user}"
- `impersonating_stop_instructions` — "Click here to stop impersonating"

---

## AIM Production Deployment Context

This section is specific to the AIM fork. It describes how this repo is deployed and
what makes the AIM instance different from a vanilla cal.diy installation.

### What this fork is

This is **AIM's (Advisor Internet Marketing) fork** of cal.diy, deployed at
**https://cal.annuitygator.com** for 85 financial advisors. The ops repo lives at
`https://github.com/advisorinternetmarketing/cal-aim` (parent directory when cloned).

### Git remotes

- `origin` → `https://github.com/AIM-techteam/cal.diy` (AIM fork — push here)
- `upstream` → `https://github.com/calcom/cal.diy` (original — pull updates from here)

### Production server

| Item | Value |
|---|---|
| URL | https://cal.annuitygator.com |
| Server | DigitalOcean droplet 159.203.143.99, `/opt/cal-aim/cal.diy` |
| Database | DigitalOcean Managed PostgreSQL (external, sslmode=require) |
| Container | Docker image built from `Dockerfile` in this repo root |
| Admin account | erandi@advisorinternetmarketing.com |

### AIM-specific behavior and gotchas

**Platform API is not available.** `apps/api` (NestJS) is not built or deployed.
All bulk operations are done via DB-direct SQL. Any `/api/v2/` endpoint will 404.

**Admin role requires 2FA.** `INACTIVE_ADMIN` is assigned to any admin user with
`identityProvider='CAL'` who has not enabled TOTP 2FA. Enabling 2FA in Settings →
Security promotes the role to `ADMIN`, which makes the admin sidebar sections appear.

**85 advisor accounts are DB-seeded.** Created via `../scripts/seed-advisors.js`
(direct Postgres INSERTs). Each has `identityProvider='CAL'`, `role='USER'`,
`completedOnboarding=false`. Advisors activate by signing in with Google OAuth.

**Default timezone is Europe/London.** AIM advisors were bulk-updated to
`America/Chicago` after seeding. New users should be updated after creation.

**n8n webhook.** Every advisor has a webhook pointing to
`https://aimkt-app.app.n8n.cloud/webhook/cal-booking` for FUB + Keap CRM sync.
Metadata fields `fubId`, `keapContactId`, `leadId` are passed from the Cal embed
in the funnel and appear in every webhook payload as `$json.payload.metadata.*`.

### How to deploy a UI change

1. Edit files under `apps/web/` or the relevant `packages/`
2. `git push origin main` → pushes to AIM-techteam fork
3. SSH to `root@159.203.143.99` → `/opt/cal-aim` → inside `cal.diy/`, run
   `git pull origin main`
4. `docker compose build cal && docker compose up -d cal`
5. Verify: `curl -s https://cal.annuitygator.com/api/health`

Full guide: `../docs/howto-deploy-ui-changes.md`

### Key env vars (AIM-specific values)

| Var | Notes |
|---|---|
| `EMAIL_SERVER_HOST` | `smtp.sendgrid.net` — SendGrid, not Gmail |
| `EMAIL_SERVER_USER` | `apikey` (literal string for SendGrid) |
| `EMAIL_SERVER_PASSWORD` | SendGrid API key |
| `GOOGLE_API_CREDENTIALS` | Google Cloud project "AIM Calendar" — separate from any personal project |
| `CALCOM_TELEMETRY_DISABLED` | `1` — always disabled in production |

Never reuse credentials from `cale.ndi.mx` (Erandi's personal instance) — they are
separate Google Cloud projects with separate OAuth clients.
