# Z × XOE Calendar

A shared scheduling app with two tabs:

- **Executive** (`/executive`, passcode-protected): Z fills in the week — Free time, Nursing, School,
  Production (music), Working, On duty for Mursezan, Personal. Drag blocks to move them, drag the bottom edge
  to resize, click or drag on empty space to create, click a block for details. Day / 3‑day / week / month
  views, weekly repeats, tasks, and a **brain dump** box that turns a messy paragraph into events and tasks.
- **Team** (`/team`, public): shows **only Z's free time**. Anyone on the team picks a window, a length
  (15–60 min) and a start time. The call is created in the connected Google Calendar with Z, XOE and the
  booker as attendees and a Google Meet link.

Built with Next.js 16 (App Router), React 19 and plain CSS. It works on phones (bottom dock, bottom sheets,
long‑press to drag, swipe to change days) and desktop.

## Run locally

```bash
cd zx-calendar
npm install
cp .env.example .env.local   # fill in what you have; everything is optional locally
npm run dev                  # http://localhost:3000
npm test                     # parser + availability unit tests
```

Without any env vars the app still works: data is kept in `.data/` on disk, the brain dump uses a built‑in
offline parser, and bookings are saved without a Google invite.

## Deploy to Vercel

1. **Import** this repository in Vercel and set **Root Directory** to `zx-calendar`.
2. **Storage:** Vercel → Storage → add **Upstash for Redis** and connect it to the project. It sets
   `KV_REST_API_URL` / `KV_REST_API_TOKEN` automatically. Without it, data resets whenever the server restarts.
3. **Environment variables** (Settings → Environment Variables):

   | Variable | Purpose |
   | --- | --- |
   | `EXECUTIVE_PASSCODE` | Passcode Z uses to unlock the Executive tab. **Set this.** |
   | `AUTH_SECRET` | Random string that signs the session cookie (`openssl rand -base64 32`). |
   | `Z_EMAIL`, `XOE_EMAIL` | Both get invited to every booked call. |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth client (see below). |
   | `GOOGLE_CALENDAR_ID` | Optional, defaults to `primary`. |
   | `ANTHROPIC_API_KEY` | Turns on Claude for the brain dump. `ANTHROPIC_MODEL` overrides the model. |

4. **Google Calendar:** in Google Cloud Console, enable the *Google Calendar API*, create an OAuth client of
   type *Web application*, and add the redirect URI `https://<your-domain>/api/google/callback`. While the
   OAuth consent screen is in *Testing*, add your Google account as a test user. Deploy, open
   `/executive` → **Connections → Connect**, and sign in with the Google account whose calendar should
   receive the bookings. The refresh token is stored server‑side in Redis (or set `GOOGLE_REFRESH_TOKEN`
   yourself).
5. Share `https://<your-domain>/team` with the team.

## How it fits together

```
app/
  executive/page.tsx     passcode check → ExecutiveApp
  team/page.tsx          TeamApp (public)
  api/blocks             Z's schedule (executive only)
  api/availability       free windows + anonymous booked ranges (public)
  api/bookings           create (public, validated against free time) / cancel (executive)
  api/tasks              tasks (executive only)
  api/brain-dump         Claude structured output; 503 → client uses the offline parser
  api/google/*           OAuth connect + callback
components/calendar      drag/resize/create time grid, month grid, overlap layout
lib/availability.ts      interval math: merge, subtract, open windows, slot starts
lib/offlineParser.ts     rule-based brain-dump fallback (runs in the browser)
```

Privacy: non‑free blocks never leave `/api/blocks`, which requires the executive cookie. The public
availability endpoint returns only free‑time ranges and the start/end of booked calls.

Keyboard shortcuts in the Executive tab: `n` new block, `t` today, `d` / `w` / `m` switch views,
`⌘/Ctrl + Enter` in the brain dump to structure it.

## Complementary open-source projects

- [calcom/cal.com](https://github.com/calcom/cal.com) — the scheduling platform this repository (cal.diy) is
  based on. Use it if you outgrow this app and need round‑robin teams, routing forms, payments, etc.
- [schedule-x/schedule-x](https://github.com/schedule-x/schedule-x) and
  [jquense/react-big-calendar](https://github.com/jquense/react-big-calendar) — drop‑in drag‑and‑drop
  calendar components if you'd rather not maintain the custom grid in `components/calendar`.
- [wanasit/chrono](https://github.com/wanasit/chrono) — natural‑language date parsing, a stronger
  replacement for `lib/offlineParser.ts` when no AI key is configured.
