# API reference

All endpoints require a signed-in Supabase session cookie unless noted. Errors return `{ "error": string }` with an HTTP status.

## HTTP routes (`app/api`)

### `GET /api/time` (public, edge)
Server clock for latency-compensated sync. → `{ "now": 1731234567890 }`

### `GET /api/livekit/token?room=ABCD2345`
Issues a LiveKit access token for the room’s call. Requires membership in the room.
→ `{ "token": "<jwt>", "url": "wss://…livekit.cloud" }` · 401 not signed in · 403 not a member · 503 not configured. Limit: 20/min/user.

### `GET /api/youtube/search?q=lofi`
Embeddable, safe-search YouTube results.
→ `{ "items": [{ "id", "title", "channel", "thumbnail" }] }`. Limit: 30/min/user.

### `GET /api/gifs?q=cat`
GIPHY search (trending if `q` is empty), rated PG-13.
→ `{ "items": [{ "id", "title", "url", "preview" }] }`. Limit: 40/min/user.

### `GET /api/embed-check?url=https://example.com/video`
Checks whether a site allows framing (reads `X-Frame-Options` and CSP `frame-ancestors`; never bypasses them). Rejects non-https and private-network addresses.
→ `{ "embeddable": true, "kind": "iframe" | "html5" | "hls" }` or `{ "embeddable": false, "reason": string }`. Limit: 20/min/user.

### `GET /auth/callback?code=…&next=/path` · `POST /auth/signout`
OAuth / email-link exchange (validated same-site `next`), and sign-out.

## Database functions (call with `supabase.rpc(name, args)`)

| Function | Who | What |
|---|---|---|
| `create_room(p_name, p_is_public, p_password?, p_avatar_url?)` → `text` | signed in | Creates a room with an 8-char ID; caller becomes owner. 15/hour. |
| `room_preview(p_room)` → row | anyone | Name, avatar, password flag, member count, owner, `is_member`. |
| `join_room(p_room, p_password?)` → role | signed in | Joins (checks ban + bcrypt password, 5 tries / 10 min). |
| `leave_room(p_room)` | member | Leaves; owner hands off to next-highest role, last person closes the room. |
| `update_playback(p_room, p_is_playing, p_position, p_rate, p_sent_at?, p_source_type?, p_source_url?, p_source_title?)` → room | host, co-host (or everyone if enabled) | Authoritative playback/source change; bumps `state_version`. |
| `start_countdown(p_room, p_seconds=5)` → room | controllers | Schedules a synchronized start 3–10s ahead. |
| `update_room_settings(p_room, p_name, p_is_public, p_everyone_can_control, p_avatar_url?, p_password?, p_clear_password?)` | owner, co-host | Room settings and password. |
| `set_member_role(p_room, p_user, p_role)` | owner | `cohost` / `moderator` / `member`. |
| `transfer_host(p_room, p_user)` | owner | New owner; previous owner becomes co-host. |
| `kick_member(p_room, p_user, p_ban=false)` | moderator+ (outranking target) | Removes, optionally bans. |
| `delete_message(p_message)` | author or moderator+ | Soft-deletes a chat message. |
| `invite_friend(p_room, p_friend)` | member, friends only | Sends an in-app room invite notification. |
| `touch_presence(p_room?)` | signed in | Online-status heartbeat. |

## Direct table access (protected by RLS)

`messages` (insert own, read as member) · `message_reactions` (insert/delete own) · `friendships` (request, accept as addressee, delete) · `blocks` · `reports` (insert) · `direct_messages` (friends only, recipient marks read) · `notifications` (own) · `favorites` · `watch_history` · `profiles` (update own) · Storage bucket `avatars` (write only in `<user-id>/…`).

## Realtime

* **Channel `room:<ID>`** (private, members only): presence (`watching`, `in_call`), and broadcast events `sync`, `typing`, `reaction`, `members`, `kick`, `unreact`.
* **Database changes**: `rooms` (playback state), `messages`, `message_reactions`, `room_members` filtered by room; `notifications` and `direct_messages` filtered by user.
