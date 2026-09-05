## 📌 Summary
Fixes #29982

Fixes a critical **Team Webhook IDOR / Authorization Bypass** vulnerability where team members with standard `MEMBER` role could edit, redirect, or delete team webhooks and retrieve signing secrets.

---

## 🛡️ Root Cause & Security Mitigation

### The Issue
Previously, in `packages/trpc/server/routers/viewer/webhook/util.ts`, `createWebhookProcedure()` only validated `webhook.userId !== ctx.user.id`. For team-level webhooks, `webhook.userId` is `null` (since they belong to a `teamId`), which allowed the middleware check to silently pass for any authenticated user who knew or queried the webhook ID via `viewer.webhook.getByViewer`.

### The Solution
1. **Middleware Authorization (`util.ts`)**:
   - Selected `teamId` in the initial webhook lookup.
   - Added team membership and role validation: when `webhook.teamId` is present, strictly enforces that `ctx.user.id` is an active member with `ADMIN` or `OWNER` role (`MembershipRole.ADMIN` / `MembershipRole.OWNER`).
   - Added corresponding checks for team-associated `eventTypeId` webhooks.
2. **Defense-in-Depth (`edit.handler.ts`)**:
   - Added secondary verification ensuring team webhook updates require team administrative permissions before modifying URLs or credentials.

---

## 🧪 Verification & Testing

- [x] Verified authorization logic against `ADMIN`, `OWNER`, and `MEMBER` roles.
- [x] Verified personal webhooks continue to function for owning users.
- [x] Added automated unit tests in `packages/trpc/server/routers/viewer/webhook/webhookAuth.unit.test.ts`.
- [x] Pre-flight security and quality audit passed with zero defects.
