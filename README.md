# Nightcap: Watch Together

Create a room, invite friends, and watch YouTube, video files, HLS streams and embeddable sites in sync, with live chat, reactions, and group voice/video calls.

**Stack:** Next.js 14 (App Router) · TypeScript · Tailwind CSS · Framer Motion · Supabase (Postgres, Auth, Realtime, Storage) · LiveKit (WebRTC SFU) · YouTube IFrame API · hls.js

---

## Architecture

```
Browser ──HTTPS──► Next.js on Vercel ──► API routes (LiveKit tokens, YouTube search, GIFs, embed checks)
   │                                         │
   │◄──── WebSocket (Supabase Realtime) ─────┼──► Postgres (authoritative room state, chat, RLS)
   │                                         │
   └──── WebRTC ────► LiveKit Cloud SFU (includes TURN)
```

**Why Supabase Realtime instead of Socket.IO?** Vercel serverless functions can’t hold long‑lived WebSocket connections, so a Socket.IO server can’t run there. Supabase Realtime provides the WebSocket layer (broadcast, presence, database change feeds) as a managed service, so the entire app deploys to Vercel with nothing else to host. If you later want Socket.IO, the sync engine (`hooks/useSync.ts`) only depends on a `broadcast()` function and an `applyRemote()` callback, so the transport is swappable.

### How sync works

* The **`rooms` row is the source of truth**: `is_playing`, `position`, `playback_rate`, `state_updated_at` (server time), `state_version`.
* When a host plays/pauses/seeks, the client **broadcasts** the new state immediately (lowest latency) and calls the `update_playback` RPC. The database checks the caller’s role, compensates for request latency, stamps server time and bumps the version. The resulting row reaches everyone through Realtime and overrides the broadcast if they differ.
* Each client estimates its **clock offset** to the server (NTP-style sampling of `/api/time`), so everyone computes the same "expected position" = `position + (serverNow − state_updated_at) × rate`.
* Every second, each client compares its player to the expected position. HTML5/HLS players **nudge playback rate** (±6%) to correct small drift without a visible jump and seek only beyond 2s. YouTube (which has no fine-grained rate control) seeks beyond 0.9s.
* Late joiners load the current row and land on the right second. Reconnects trigger a full re-fetch.
* Echo loops are prevented by suppressing player events for a short window after programmatic changes, debouncing host events (150ms), and version ordering.
* **Countdown**: the server sets the start time 5 seconds in the future; every client starts at that exact server instant without another round trip.
* Browsers block autoplay with sound. If that happens, the video plays muted and shows “Tap to turn on sound”.

### Video sources

| Source | How it plays | Sync |
|---|---|---|
| YouTube (search or URL) | YouTube IFrame Player API | Full |
| MP4 / WebM / Ogg URL | HTML5 `<video>` | Full + drift nudging + PiP |
| HLS `.m3u8` | hls.js (native on Safari) | Full + quality selection |
| Other websites | `<iframe>` if the site permits framing (checked server-side via `X-Frame-Options`/CSP) | Shared clock + countdown |
| Netflix | Each person opens Netflix in their own account | Shared clock + countdown |

Nightcap never bypasses DRM, paywalls, logins, or embedding restrictions. Netflix exposes no public API for controlling its player from another site, so full Netflix sync would require a browser extension that runs on netflix.com; that’s outside this repo.

---

## Project structure

```
app/
  page.tsx                 Homepage
  login/                   Email/password + Google sign-in, password reset
  auth/callback|signout    OAuth/email callback, sign out
  rooms/new/               Create room
  join/[id]/               Invite landing (preview + password)
  room/[id]/               The watch room
  browse/                  YouTube search + public rooms
  friends/  messages/      Friends list, private messaging
  profile/                 Edit profile, avatar, password, history, favorites
  api/                     time, livekit/token, youtube/search, gifs, embed-check
components/room/           RoomClient, players, chat, participants, call, modals
hooks/useSync.ts           Synchronization engine
lib/                       Supabase clients, clock sync, URL parsing, types
supabase/schema.sql        Tables, RLS, RPCs, triggers, realtime, storage
docs/API.md                API and RPC reference
```

---

## 1. Set up the services (about 15 minutes)

### Supabase
1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query**, paste all of `supabase/schema.sql`, and run it.
3. **Project Settings → API**: copy the Project URL and the `anon` public key.
4. **Authentication → URL Configuration**: set Site URL to your deployed URL and add redirect URLs:
   `http://localhost:3000/auth/callback` and `https://YOUR-APP.vercel.app/auth/callback`.
5. **Authentication → Providers → Google**: enable it and paste a Google OAuth client ID/secret (create one in Google Cloud Console → APIs & Services → Credentials; authorized redirect URI is `https://YOUR-PROJECT.supabase.co/auth/v1/callback`).
6. **Realtime → Settings**: make sure private channels are allowed (the schema adds the policies that restrict room channels to members).

### LiveKit (voice & video)
1. Create a project at [cloud.livekit.io](https://cloud.livekit.io). LiveKit Cloud includes TURN servers, so calls work behind strict NATs and firewalls.
2. **Settings → Keys**: create an API key; note the key, secret, and `wss://…livekit.cloud` URL.

### YouTube search (optional but recommended)
Google Cloud Console → enable **YouTube Data API v3** → create an API key (restrict it to that API). Without it, pasting YouTube links still works.

### GIFs (optional)
Create an app at [developers.giphy.com](https://developers.giphy.com) and copy the API key.

---

## 2. Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Where it’s used | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + server (RLS protects data) | No |
| `NEXT_PUBLIC_SITE_URL` | Invite links, metadata | No |
| `NEXT_PUBLIC_LIVEKIT_URL` | Call connection | No |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | `/api/livekit/token` only | **Yes** |
| `YOUTUBE_API_KEY` | `/api/youtube/search` only | **Yes** |
| `GIPHY_API_KEY` | `/api/gifs` only | **Yes** |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Contact page (optional) | No |

Secret keys are only read in server route handlers and never shipped to the browser. The Supabase service-role key is not needed at all.

---

## 3. Run locally

```bash
npm install
npm run dev
# open http://localhost:3000
```

To test sync, open the room in two browsers (or one normal and one private window) signed in as different users.

---

## 4. Push to GitHub

```bash
git init
git add .
git commit -m "Nightcap watch-together app"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/nightcap.git
git push -u origin main
```

`.env.local` is git-ignored, so your keys stay out of the repo. A GitHub Actions workflow runs type-checking and lint on every push.

## 5. Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and import the GitHub repo. Vercel detects Next.js automatically.
2. Under **Environment Variables**, add every variable from the table above, with `NEXT_PUBLIC_SITE_URL` set to your production URL (e.g. `https://nightcap.vercel.app`).
3. Click **Deploy**. Every later `git push` redeploys automatically.
4. Back in Supabase, add `https://YOUR-APP.vercel.app/auth/callback` to the redirect URLs (step 1.4) if you haven’t.

Or with the CLI: `npm i -g vercel && vercel` then `vercel --prod`.

---

## Security summary

* **Row Level Security** on every table. Room data, chat and members are visible only to members; DMs only to the two people involved and only between friends who haven’t blocked each other.
* **All privileged actions are database functions** that check the caller’s role: playback control, role changes, host transfer, kicks/bans, message moderation, settings.
* **Room passwords** are bcrypt-hashed (`pgcrypto`) in a table with no client access; 5 wrong attempts lock the user out of that room for 10 minutes.
* **Private Realtime channels**: only members can send or receive on `room:<ID>`. Sync broadcasts are additionally ignored unless the sender is a host/co-host, and the database update is authoritative.
* **Rate limits**: chat (8 msgs / 10s), DMs, room creation (15/hour), password attempts in Postgres; API routes have per-user limits.
* **Content Security Policy**, HSTS, `X-Frame-Options: DENY`, `nosniff`, a strict Referrer Policy and Permissions Policy (`next.config.mjs`).
* **Safe URLs**: only `https://` sources; the embed checker blocks private/internal IPs (SSRF protection); third-party iframes are sandboxed; redirect targets after login are validated.
* Reporting and blocking for users and messages.

## Limits worth knowing

* API-route rate limiting is per serverless instance. For global limits, swap `lib/ratelimit.ts` for Upstash Redis.
* Free tiers: Supabase (200 concurrent Realtime connections), LiveKit Cloud (limited free minutes), YouTube Data API (10,000 units/day ≈ 100 searches). Plan upgrades before a big launch.
* Sync accuracy is typically within a few hundred milliseconds on decent connections, and depends on network, device, and the video provider.

See `docs/API.md` for every endpoint and database function.
