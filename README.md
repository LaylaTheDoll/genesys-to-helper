# Genesis TO Helper
Discord bot for Genesys Yu-Gi-Oh! tournaments, with a localhost dashboard.

**Stack**: Bun + TypeScript + discord.js v14 + `Bun.serve` dashboard. Persistence: compact atomic JSON writes in `data/state.json` with a `.bak` backup. No database.

## Quick Start

1. Install Bun from <https://bun.sh/docs/installation#windows>.
2. `cp .env.example .env` — fill:
   - `DISCORD_TOKEN` — bot token
   - `ADMIN_DISCORD_USER_ID` — the single tournament-admin user
   - `GUILD_ID` — used for instant slash-command registration
   - `DASHBOARD_PORT` / `DASHBOARD_BIND` — default `6767` / `127.0.0.1`; binding must stay loopback
   - `TOURNEY_TIME_ZONE` — archive month grouping timezone, default `UTC`
    - `TOURNEY_SIGNUP_CHANNEL_ID` — registration announcement and signup reactions
   - `TOURNEY_FIND_OPPS_CHANNEL_ID` — round announcements and duel threads
   - `TOURNEY_DROPS_CHANNEL_ID` — drop reaction message
   - `TOURNEY_SIGNUP_ROLE_ID` — adds role to users when they singup to play.
   - `TOURNEY_MSG_*` / `TOURNEY_ERR_*` — editable bot announcements and validation messages
   - `TOURNEY_PLAYER_REPORTING_ENABLED` — default `false`; allow players to report results in Discord
3. Run `bun install` to install dependencies.
4. Lastly `bun run start` to initiate or `bun run dev` (watch)

If the env vars are missing, the bot is skipped and the dashboard still runs in test mode.

Message templates support placeholders such as `{name}`, `{label}`, `{lines}`, and `{player}`. Use `\n` for line breaks. Existing `.env` files should copy the message variables from `.env.example` when customizing text.

## Discord setup

- Invite the bot with the `bot` scope and these permissions: 
- **Send Messages**;
- **Manage Threads**;
- **Create Public Threads / Private Threads** (private threads need Manage Threads);
- **Embed Links** (optional);
- **Read Messages / View Channels**;
- **Add/Remove Reactions**;
- and **Manage Roles**.

- No privileged intents are required; the bot uses standard guild/reaction intents.
- Slash commands are registered into the guild at startup.

## Discord setup

- Invite the bot with the `bot` scope and these permissions: **Send Messages**, **Manage Threads**, **Create Public Threads / Private Threads** (private threads need Manage Threads), **Embed Links** (optional), **Read Messages / View Channels**, **Add/Remove Reactions**.
- No privileged intents are required; the bot uses standard guild/reaction intents.
- Slash commands are registered into the guild at startup.

##  Player's flow through discord

1. When tournament created, signup announcement is sent to the signup channel.
2. Players react ✅, then use `/decklist url`.
3. When it starts, reports players missing decklists.
4. When pairing, it creates threads and players receive a notification.
5. Play in the private thread; the TO reports through Dashboard or `/tourney-report`, unless player reporting is enabled.

## Features

- Tournament Management can be done entirely through the dashboard.

- `/tourney-create` — starts signups.
- Decklist collection via `/decklist url`, first URL is stored, further links are rejected.
- `/tourney-start` — closes signup and reports missing decklists.
- `/tourney-pair` — pairs the next Swiss round (seeded deterministic), creates a private thread per duel. Requires all active players to have decklists and the previous round to be reported.
- `/tourney-top-cut` — starts Top Cut after the planned Swiss rounds are complete.
- `/tourney-report` — optionally lets players report their own result when `TOURNEY_PLAYER_REPORTING_ENABLED=true`. First report is immutable. Also has `double_loss: true` that marks all pending duels of the round as double loss.
- `/tourney-drop` — drops a player between rounds.
- `/tourney-end` — deletes all match threads. Running rounds must be complete first.
- `/tourney-cancel` — deletes the active tournament without archiving it.
- Dashboard on `127.0.0.1` — live standings with all tiebreaker columns, per-round pairings, local-PC timestamps, meta representation, and archetype field editing.
- Dashboard tournament titles are editable while active or archived; sequential tournament numbers are assigned automatically and immutable.
- Monthly archive tournament names open a dashboard view with read-only standings, rounds, and meta details.
- New tournaments use Genesys with Swiss, with optional Top Cut. Can also be Single Elimination, Double Elimination, or Round Robin structures.
- History archive — finished tournaments are archived on disk; the dashboard's `/api/history?month=YYYY-MM` serves monthly summaries (tournament counts, reported duels, distinct players) and the meta report (archetype share / win rate per month).
- Failed Discord operations are written as individual `.txt` files under `error logs/`.

## Code layout

- `src/pairing` — shared pairing helpers plus swiss, single/double elimination and round-robin rules.
- `src/core` — tournament models, standings, history reports, and tests.
- `src/application` — tournament workflow and state-changing service methods.
- `src/discord` — discord commands, reactions, threads, announcements, and cleanup.
- `src/adapters` — dashboard HTTP server and browser-facing view model.
- `src/platform` — environment configuration only.
- `src/storage` — state normalization, atomic JSON persistence, and backups.
- `src/messages` — copies, edit through .env.
- `src/logging` — failure logs.
- `src/main.ts` — startup wiring only.

## Dashboard API

`POST /api/commands` — drive the bot without Discord (requires the three `TOURNEY_*_CHANNEL_ID` variables):

```bash
  curl -X POST http://127.0.0.1:6767/api/commands -H 'Content-Type: application/json' \
  -d '{"action":"create","name":"Friday Swiss"}'
# actions: create, start, pair, report, drop, end
```

`GET /api/history?month=YYYY-MM` — archived tournaments, monthly summary and meta report.

## Standings (Tournament Policy v2.5, Sept 2025)

Points → Opponents Match-Win % → Opponents- Opponents OMW% → DDD (sum of squares of lost round numbers, larger = better → later losses rank higher) → username asc.

- Win = 3 pts, loss = 0, **no draws**
- Bye = 3 pts, counts as a round played; byes are excluded from opponents' lists (thus from OMW).
- Match-Win % floored at 33% for opponents (both directions: your OMW vs winless players, and your own MWP in others' OMW).
- Final DDD semantics verified against the official v2.5 policy doc.

## Discord Commands

```
/tourney-create name structure [top_cut]  # start signups
/tourney-start                # close signup, report missing decklists
/decklist url                 # player to submit decklist URL
/tourney-pair                 # pair next round
/tourney-top-cut              # start Top Cut manually
/tourney-report winner_games loser_games [double_loss]  # Admin, or players only when enabled
/tourney-drop user            # between rounds; locked after elimination begins
/tourney-end                  # final standings + thread cleanup
/tourney-cancel               # discard active tournament without archiving
```

## Tests

```
bash
bun test       # pairing, service, messages, gateway + state migration
bun run typecheck
```

## Demo seed

```
bash
bun scripts/seed.ts
```

This replaces `data/state.json` with demo live/history tournaments. Use only for local dashboard testing.
