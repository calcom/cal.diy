# Contributing to Cal.diy

> **Important:** Cal.diy is a community-driven, open-source fork of Cal.com. Contributions made here **do not** get merged into Cal.com's production service — Cal.com is now closed-source. This repo is maintained independently by the community under the MIT license.

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

## House Rules (for PRs and Issues)

### 👥 Prevent Work Duplication

Before submitting a new issue or PR, check if it already exists in the [Issues](https://github.com/calcom/cal.diy/issues) or [Pull Requests](https://github.com/calcom/cal.diy/pulls).

### ✅ Work Only on Approved Issues

For feature requests, please wait for a core team member to approve and remove the `🚨 needs approval` label before you start coding or submitting a PR.

For bugs, security, performance, documentation, etc., you can start coding immediately—even if the `🚨 needs approval` label is present.

We highly value new feature ideas, but to maintain consistency in the product direction, they must go through a review and approval process.

### 🚫 Don’t Just Drop a Link

Avoid posting third-party links (e.g., Slack threads or Linear tickets) without context. A GitHub issue or PR should stand on its own—reviewers shouldn’t have to chase information across multiple tools to understand the context.

### 👀 Think Like a Reviewer

Put yourself in the reviewer’s shoes. What would you want to know if reading this for the first time? Are there key decisions, goals, or constraints that need clarification? Does the PR assume knowledge that isn’t obvious? Are there related issues or previous PRs that should be linked?

### 🧵 Bring in Context from Private Channels

If the task originated from a private conversation (e.g., Slack), take a moment to extract the relevant details and include them in the GitHub issue or PR. Avoid sharing sensitive information, but make sure important reasoning is captured.

> Example:  
> “A user requested feature X to solve problem Y. I considered approaches A, B, and C, but chose C for the following reasons…”

### 📚 Treat It Like Documentation

GitHub is a shared source of truth. Every issue and PR contributes to the long-term understanding of the codebase. Write clearly enough that someone—possibly you—can revisit it months later and still understand what happened and why.

### ✅ Summarize Your PR at the Top

Even if the code changes are minor or self-explanatory, a short written summary helps reviewers quickly understand the intent. You can use GitHub Copilot’s auto-summarize feature, but make sure to verify it for accuracy and relevance.

### 🔗 Use GitHub Keywords to Auto-Link Issues

Use phrases like “Closes #123” or “Fixes #456” in your PR descriptions. This automatically links your PR to the related issue and closes it once merged—keeping everything traceable and organized.

### 🧪 Mention What Was Tested (and How)

Explain how you validated your changes. It doesn’t need to be exhaustive—just enough to give reviewers confidence that things were tested and work as expected.

> Example:  
> “Tested locally with mock data and confirmed the flow works on staging.”

### 🧠 Assume Future-You Won’t Remember

Write with the future in mind. If there are trade-offs, edge cases, or temporary workarounds, document them clearly so they don’t get lost or misinterpreted later.

## Priorities

<table>
  <tr>
    <td><strong>Type of Issue</strong></td>
    <td><strong>Priority</strong></td>
  </tr>
  <tr>
    <td>Minor improvements, non-core feature requests</td>
    <td>
      <a href="https://github.com/calcom/cal.diy/issues?q=is:issue+is:open+sort:updated-desc+label:%22Low+priority%22">
        <img src="https://img.shields.io/badge/-Low%20Priority-green">
      </a>
    </td>
  </tr>
  <tr>
    <td>Confusing UX (but still functional)</td>
    <td>
      <a href="https://github.com/calcom/cal.diy/issues?q=is:issue+is:open+sort:updated-desc+label:%22Medium+priority%22">
        <img src="https://img.shields.io/badge/-Medium%20Priority-yellow">
      </a>
    </td>
  </tr>
  <tr>
    <td>Core Features (Booking page, availability, timezone calculation)</td>
    <td>
      <a href="https://github.com/calcom/cal.diy/issues?q=is:issue+is:open+sort:updated-desc+label:%22High+priority%22">
        <img src="https://img.shields.io/badge/-High%20Priority-orange">
      </a>
    </td>
  </tr>
  <tr>
    <td>Core Bugs (Login, Booking page, Emails not working)</td>
    <td>
      <a href="https://github.com/calcom/cal.diy/issues?q=is:issue+is:open+sort:updated-desc+label:Urgent">
        <img src="https://img.shields.io/badge/-Urgent-red">
      </a>
    </td>
  </tr>
</table>

## File Naming Conventions

To ensure consistency and make files easy to fuzzy-find, we follow the naming conventions below for **services**, **repositories**, and other class-based files.

### Repository Files

- Repository class files must include the `Repository` suffix.
- If the repository is backed by a specific technology (e.g. Prisma), prefix the filename and class name with it.
- File name must match the exported class exactly (PascalCase).

**Pattern:**

`Prisma<Entity>Repository.ts`

**Examples:**

```ts
// File: PrismaAppRepository.ts
export class PrismaAppRepository { ... }

// File: PrismaMembershipRepository.ts
export class PrismaMembershipRepository { ... }
```

This avoids ambiguous filenames like app.ts and improves discoverability in editors.

### Service Files

- Service class files must include the Service suffix.
- File name should be in PascalCase, matching the exported class.
- Keep naming specific — avoid generic names like AppService.ts.

**Pattern:**

`<Entity>Service.ts`

**Examples:**

```ts
// File: MembershipService.ts
export class MembershipService { ... }

// File: HashedLinkService.ts
export class HashedLinkService { ... }
```

**Note:**

- New files must avoid dot-suffixes like .service.ts or .repository.ts; these will be migrated from the existing codebase progressively.
- We still reserve suffixes such as .test.ts, .spec.ts, and .types.ts for their respective use cases.

## Developing

[See README](https://github.com/calcom/cal.diy#development)

### React Version Standard

This monorepo has standardized on **React 19** (e.g., `react@19.2.4`, `@types/react@19.0.0`). We are using React 19 instead of React 18 because Next.js 16 does not support React 18. Please ensure any new apps, packages, or updates use React 19 to avoid version drift and hydration mismatches.

## Building

You can build the project with:

```bash
yarn build
```

Please ensure that you can make a full production build before pushing code.

## Testing

More info on how to add new tests coming soon.

### Running Tests

[See README](https://github.com/calcom/cal.diy#e2e-testing)

#### Resolving Issues

##### E2E Test Browsers Not Installed

Run `npx playwright install` to download test browsers and resolve the error below when running `yarn test-e2e`:

```
Executable doesn't exist at /Users/alice/Library/Caches/ms-playwright/chromium-1048/chrome-mac/Chromium.app/Contents/MacOS/Chromium
```

## Linting

To check the formatting of your code:

```sh
yarn lint
```

If you get errors, be sure to fix them before committing.

## Making a Pull Request

### Keep PRs Small and Focused

Large PRs are difficult to review and more prone to errors. We strongly encourage smaller, self-contained PRs:

- **Size limits**: Keep PRs under 500 lines of code changed and under 10 code files modified (excludes documentation, lock files, and auto-generated files)
- **Single responsibility**: Each PR should address one concern (one feature, one bug fix, or one refactor)
- **Split large changes**: If your task requires extensive changes, break it into multiple PRs that can be reviewed and merged independently

**How to split large changes:**
- Separate database/schema changes from application logic
- Split frontend and backend changes when possible
- Do preparatory refactoring in a separate PR before adding new features
- Create PRs in dependency order (infrastructure first, then features)

### PR Checklist

- Be sure to [check the "Allow edits from maintainers" option](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/allowing-changes-to-a-pull-request-branch-created-from-a-fork) when creating your PR. (This option isn't available if you're [contributing from a fork belonging to an organization](https://github.com/orgs/community/discussions/5634))
- If your PR refers to or fixes an issue, add `refs #XXX` or `fixes #XXX` to the PR description. Replace `XXX` with the respective issue number. See more about [linking a pull request to an issue](https://docs.github.com/en/issues/tracking-your-work-with-issues/linking-a-pull-request-to-an-issue).
- Fill out the PR template accordingly.
- Review the [App Contribution Guidelines](./packages/app-store/CONTRIBUTING.md) when building integrations.
- Lastly, make sure to keep your branches updated (e.g., click the `Update branch` button on the GitHub PR page).
