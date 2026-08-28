# IBP — Installation Booking Program

Windovert's internal team-scheduling tool: a day/week calendar for booking
install/measure/service jobs against install teams, plus admin tabs for
Teams, Status, and Sales People.

This is a from-scratch rebuild of the old `BrianTool` scheduler
(`glenxmac.github.io/BrianTool`), reimplemented on infrastructure Windovert
owns outright — no dependency on anyone else's GitHub or Supabase account.
It's a static site (plain HTML/CSS/JS, ES modules, no build step) backed by
Supabase (Postgres + Auth), deployable to GitHub Pages for free.

## Stack

- **Frontend:** static HTML/CSS/JS, Bootstrap 5 (CDN), no build step
- **Backend:** [Supabase](https://supabase.com) (Postgres + Auth), free tier
- **Hosting:** GitHub Pages

## One-time setup

1. **Create a Supabase project** under a Windovert-owned account/org.
2. In the Supabase SQL editor, run `supabase/schema.sql` to create the
   tables, then (optionally) `supabase/seed.sql` for a quick starter set of
   salespeople and placeholder teams — or just enter that data through the
   app's Teams / Sales People tabs instead.
3. In Supabase → Authentication → Users, create an account for each person
   who needs to sign in (this app gates its whole UI behind Supabase Auth
   email/password sign-in — there's no self-service signup). Every new
   user defaults to **read-only** access. To make someone an editor
   (can create/change/delete), run in the SQL editor:
   ```sql
   update profiles set role = 'editor'
   where id = (select id from auth.users where email = 'person@example.com');
   ```
4. Copy the project's URL and anon/publishable key (Project Settings → API)
   into `config.js` at the repo root.
5. Enable GitHub Pages for this repo (Settings → Pages → deploy from the
   default branch, root folder). No build step is required.

The anon key in `config.js` is safe to commit — it's meant to be public.
**Row Level Security is the real access control** (see `supabase/schema.sql`);
double check it's enabled on every table in the Supabase dashboard before
relying on it.

### Upgrading an existing project

Run these once in the SQL editor if your project predates the feature —
both are idempotent, safe to run more than once. New projects created
from the current `schema.sql` already have both.

- `supabase/add_status_and_products_arrived.sql` — adds the `statuses`
  table and the two new `bookings` columns (Status tab, "products
  arrived" checkbox). Seeds two starter statuses so the tab isn't empty.
- `supabase/add_user_roles.sql` — adds read-only vs editing users (see
  below). Every existing login user is backfilled as an editor, so
  nobody who can already use the app loses access; only users created
  *after* this runs default to read-only.

### Read-only vs editing users

Every login user is either an **editor** (full access) or a **viewer**
(read-only — can see the schedule, admin tabs, and open bookings, but
every create/edit/delete control is hidden). This is enforced by the
database itself (Row Level Security), not just hidden in the browser, so
it holds even if someone pokes at the API directly. New users default to
viewer; flip someone to editor with the SQL snippet in the setup section
above.

### Troubleshooting: 403 on every data load after signing in

If the auth banner shows you're signed in but Teams/Sales People/Bookings
all fail to load with 403s, your project was provisioned from an
older copy of `schema.sql` whose RLS policies used a fragile
`auth.role() = 'authenticated'` check instead of scoping to the
`authenticated` Postgres role. Run `supabase/fix_403_permissions.sql` once
in the SQL editor — it's idempotent — to patch the grants and policies on
an existing project. New projects created from the current `schema.sql`
don't need this.

## Local development

No build step — just serve the folder statically, e.g.:

```sh
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## What's here (v1)

- Day/week team scheduling calendar, colour-coded by status — the status
  list (name + colour) is fully user-managed on the Status tab, nothing is
  hardcoded in the app
- Click a slot to create a booking, click a booking to edit it, drag to
  move, drag the bottom edge to resize — the team a booking belongs to is
  set entirely by which column/slot you act on, there's no team picker
  inside the booking modal itself
- Booking modal: date, team (read-only, shown for context), start time,
  duration, customer name/phone/email, status, salesperson (mandatory),
  order number(s), address, products/notes (free text), a "products
  arrived in store" checkbox that shows a 📦 badge on the block
- One-click WhatsApp (`wa.me`) and Email (`mailto:`) links pre-filled from
  the booking — manual send, no automation yet (see Phase 2 below)
- Job search by customer name, order number, or client cell, sorted by
  closest date to today
- Print day → per-team job cards, one team per printed page
- Teams (name only), Status (name + colour), and Sales People (name + cell)
  admin tabs
- Supabase Auth email/password sign-in gating the whole app

## Phase 2 (not built yet): WhatsApp automation

Automated booking confirmations, day-before reminders, and inbound reply
logging via Meta's WhatsApp Cloud API are a deliberately separate project,
layered on top of this once the core scheduler is live and stable. The full
build spec for that (schema additions, Edge Functions, message templates)
already exists — hand it to Claude Code as the next phase when ready. The
manual `wa.me` button above stays either way; it's free and still useful as
a fallback.

## Rollout

1. Re-enter current teams/salespeople (short list, quick — or import if
   an export from the old Supabase project is obtained)
2. Run in parallel with the old BrianTool for a few days on real bookings
3. Update bookmarks/shares to the new URL, retire the old one
4. Move to Phase 2 (WhatsApp automation) once stable
