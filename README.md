# Consistency Tracker

Lightweight React SPA for tracking UUID-based person IDs at hour resolution on a 1-7 Bristol scale with Supabase auth and simple insights.

## Stack

- Vite + React + TypeScript
- Supabase (Postgres + Auth)
- Recharts for person timeline insights
- Husky + lint-staged for commit hooks
- GitHub Actions for lint/test/build and Cloudflare Pages deploy

## Setup

1. Install dependencies

```bash
npm install
```

2. Start local Supabase stack (Docker required)

```bash
npm run supabase:start
```

3. Write local app env vars from running Supabase

```bash
npm run supabase:env:write
```

4. Create the two allowed local auth users

```bash
SUPABASE_LOCAL_USER_PASSWORD='your-local-password' npm run supabase:seed:auth-users
```

If `SUPABASE_LOCAL_USER_PASSWORD` is omitted, the default local password is `localdevpassword123`.

5. Run dev server

```bash
npm run dev
```

Then open `http://localhost:3000`.

After initial setup, you can also use:

```bash
npm run dev:local
```

Or for first-time local setup + run in one command:

```bash
SUPABASE_LOCAL_USER_PASSWORD='your-local-password' npm run dev:local:init
```

6. Run checks

```bash
npm run check
```

7. Run Playwright regression tests

```bash
npx playwright install chromium
npm run test:e2e
```

8. Install local git hooks

```bash
npm run prepare
```

Then run `git commit` normally and `lint-staged` will check staged files.

## Database (Supabase)

Migrations are handled by the local Supabase workflow:

```bash
npm run supabase:reset
```

This applies:

- `supabase/migrations/0001_init.sql`
- `supabase/migrations/0002_comment_limit_1000.sql`

Schema includes:

- `people` table (UUID only, with `is_default`)
- `consistency_entries` table storing UTC-hour entries with Bristol score 1-7
- unique enforcement of one entry per person per hour
- simple authenticated RLS policies

Useful local Supabase commands:

```bash
npm run supabase:start
npm run supabase:status
npm run supabase:env
npm run supabase:reset
npm run supabase:stop
npm run test:e2e
```

### Hosted Supabase credentials (deploy)

For hosted environments, set:

- `Project URL` → `VITE_SUPABASE_URL`
- `anon public API key` → `VITE_SUPABASE_ANON_KEY`

Find both in:

`Project Settings` → `API`.

Then in Supabase:

- Enable Email auth and disable public signups if you want only manual account creation.
- Configure redirect URLs for password reset to:
  - `http://localhost:3000`
  - `https://consistency-tracker-dwb.pages.dev`
- Add `google` OAuth credentials if you want to use the OAuth client later.
- Create two users:
  - `johnlee3@gmail.com`
  - `emily.langhorne@gmail.com`
- Set a password for each user and share access.
- Keep these two emails in the backend admin allowlist migration so RLS enforcement and UI rules stay aligned.

### Local postgres helper

A simple `docker-compose.yml` is included for local DB experimentation:

```bash
npm run db:compose:up
```

Useful commands:

```bash
npm run db:compose:psql      # open psql shell against the local container
npm run db:compose:logs      # tail postgres logs
npm run db:compose:down      # stop container + remove
```

Use it for local SQL checks or ad-hoc manual data experiments.
It does **not** provide full Supabase Auth behavior because it is a plain Postgres container.
For auth/session/RLS parity use a local Supabase stack (`supabase start`) or hosted Supabase.

## Operational flow

- App shows your default person and a quick add form.
- Default view is last 5 days.
- Use Back/Forward and day-range selector for zoom.
- Chart shows:
  - daily entry counts
  - 3-day rolling average consistency
- Persons are keyed only by UUID values.

## GitHub hooks

Husky pre-commit hook runs `lint-staged` (eslint + prettier on changed files).

## Deployment

GitHub Action `.github/workflows/deploy.yml` deploys to Cloudflare Pages.

Required repo secret:

- `CF_API_KEY` (Cloudflare API token for Pages)
- `VITE_SUPABASE_URL` (hosted Supabase project URL)
- `VITE_SUPABASE_ANON_KEY` (hosted Supabase anon key)

Set your project name in workflow env `PROJECT_NAME`.

Deploy to main branch only; preview deployment on PRs is disabled by design.

## Notes on password reset

- Login accepts only:
  - `johnlee3@gmail.com`
  - `emily.langhorne@gmail.com`
- Use `Forgot password?` from the login form to receive a reset email.
- The reset link opens `http://localhost:3000` in local mode and `https://consistency-tracker-dwb.pages.dev` in production.
- For local Supabase, reset emails are visible in Mailpit at `http://127.0.0.1:54324`.
