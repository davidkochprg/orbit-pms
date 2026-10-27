# API

`apps/api` is a Hono server. Routes are thin: they validate input with zod schemas from `packages/shared` and call repositories or domain functions. In development the web app reaches it through the Vite proxy, so the browser only ever talks to its own origin.

All responses are JSON. Dates are `YYYY-MM-DD`, timestamps are ISO 8601 UTC, money is whole CZK.

## Errors

```json
{ "error": { "code": "not_found", "message": "Booking not found" } }
```

| Status | When                                                                                  |
| ------ | ------------------------------------------------------------------------------------- |
| 400    | Invalid query (`invalid_query`), body (`invalid_json`, `bad_request`), dates or party |
| 404    | Unknown resource or route (`not_found`)                                               |
| 409    | Room taken (`conflict`) or status change not allowed (`invalid_transition`)           |
| 422    | Party does not fit the room (`over_capacity`)                                         |
| 500    | Anything else (`internal`), logged server-side                                        |

## Endpoints

### `GET /health`

```json
{ "status": "ok", "ai": { "configured": false, "voice": false } }
```

`ai.configured` is true when `META_API_KEY` and `META_MODEL_AGENT` are set; `ai.voice` when `META_MODEL_VOICE` is set too.

### `GET /api/room-types`

`RoomType[]`: `id`, `name`, `maxAdults`, `maxChildren`, `basePrice` (adult rate per person per night), `description`.

### `GET /api/rooms`, `GET /api/rooms/:id`

`Room[]` ordered by floor and name, or one `Room`: `id`, `name`, `roomTypeId`, `kind`, `floor`, `status`.

### `GET /api/bookings`

`Booking[]` ordered by check-in: `id`, `guestId`, `roomId`, `checkIn`, `checkOut`, `adults`, `childAges`, `status`, `holdExpiresAt`, `source`, `addons` (`wellness`, `dogs`, `extraBeds`), `priceSnapshot` (the quote), `notes`.

Query parameters, all optional:

| Param        | Example                | Meaning                                          |
| ------------ | ---------------------- | ------------------------------------------------ |
| `from`, `to` | `2026-10-27`           | Bookings with at least one night in `[from, to)` |
| `status`     | `confirmed,checked_in` | Comma-separated booking statuses                 |
| `guestId`    | `gst_cs_01`            | One guest's bookings                             |
| `roomId`     | `rm_101`               | One room's bookings                              |

### `GET /api/bookings/:id`

`BookingDetail`, what the booking drawer shows:

```json
{
  "booking": { "id": "bk_001", "status": "confirmed", "...": "..." },
  "guest": { "id": "gst_cs_01", "name": "...", "...": "..." },
  "room": { "id": "rm_104", "name": "104", "...": "..." },
  "roomType": { "id": "rt_family", "...": "..." },
  "allowedActions": ["check_in", "cancel"]
}
```

### Booking mutations

All take JSON, act as `user` in the audit log, and return the updated `BookingDetail`. Rules are in [domain.md](domain.md#booking-operations).

| Endpoint                            | Body                                                                        | Errors                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `POST /api/bookings/:id/actions`    | `{ "action": "confirm" \| "check_in" \| "check_out" \| "cancel" }`          | 409 `invalid_transition`, 409 `conflict`                                   |
| `POST /api/bookings/:id/move`       | `{ "roomId": "rm_201" }`                                                    | 409 `conflict`, 422 `over_capacity`, 404 room                              |
| `POST /api/bookings/:id/dates`      | `{ "checkIn": "2026-10-27", "checkOut": "2026-10-30" }`                     | 400 `invalid_date_range`, 409 `conflict`                                   |
| `POST /api/bookings/:id/reschedule` | `{ "roomId": "rm_201", "checkIn": "2026-10-28", "checkOut": "2026-10-31" }` | 400 `invalid_input` (nothing changed), 409 `conflict`, 422 `over_capacity` |

A body that fails validation returns 400 `invalid_json`; malformed JSON returns 400 `bad_request`.

### `GET /api/guests`, `GET /api/guests/:id`

`Guest[]` ordered by name, or one `Guest`: `id`, `name`, `email`, `phone`, `language`, `notes`.

### `GET /api/day?date=`

`DayOverview` for `date` (default: today in `Europe/Prague`): `arrivals`, `departures` and `inHouse`, each a list of `{ booking, guestName, roomName }`.

### `GET /api/brief?date=`

`DailyBrief` for `date` (default: today): `occupancy` (`occupied`, `sellable`, `total` rooms tonight), `guestsTonight`, `arrivals` and `departures` counts, `turnovers`, `roomsToPrepare`, `holds` (`{ summary, expired }`), `outOfOrder`, `maintenance`, `unansweredMessages` and `gaps` (`{ roomId, roomName, from, to, nights }`). See [domain.md](domain.md#daily-brief).

### `GET /api/audit-log?subjectId=&limit=`

`AuditLogEntry[]`, newest first: `id`, `actor` (`user` | `agent`), `action` (e.g. `booking.check_in`), `subjectId`, `payload`, `createdAt`. `limit` defaults to 50, max 200.

## Inbox

Direct emails, web and phone messages, and messages relayed by OTA partners in one stream. `Inquiry`: `id`, `rawText`, `channel` (`email`, `phone`, `web`, `ota`), `partner` (e.g. `Booking.com`), `subject`, `senderName`, `senderAddress`, `receivedAt`, `parsed` (the extraction), `suggestion` (`{ options: StayOption[], note, draft, draftLanguage }`), `reply`, `status` (`new`, `quoted`, `replied`, `converted`, `declined`), `bookingId`, `processedAt`, `processingError`.

| Endpoint                      | Body                                                                     | Returns                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/inbox`              |                                                                          | `Inquiry[]`, newest first                                                                                                                      |
| `POST /api/inbox`             | `{ rawText, channel?, partner?, subject?, senderName?, senderAddress? }` | 201 `Inquiry`                                                                                                                                  |
| `GET /api/inbox/:id`          |                                                                          | `Inquiry`                                                                                                                                      |
| `POST /api/inbox/:id/process` | `{ force?: boolean }`                                                    | `Inquiry` with `parsed` and `suggestion`. Already processed messages return immediately at no cost. 503 `ai_not_configured`, 429 `demo_limit`. |
| `POST /api/inbox/:id/hold`    | `{ roomId }`                                                             | 201 `BookingDetail` of a new hold for the requested stay. 409 if the message has no complete stay request or already has a hold.               |
| `POST /api/inbox/:id/replied` | `{ reply }`                                                              | `Inquiry` with `status: "replied"` and the reply text (sending happens outside Orbit).                                                         |

## Housekeeping

| Endpoint                                  | Body                                                            | Returns                                                                                                                                                                                               |
| ----------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/housekeeping`                   |                                                                 | `{ date, rooms: HousekeepingRoom[] }`: each room with `roomTypeName`, `occupancy` (`turnover`, `arriving`, `departing`, `staying`, `vacant`), `guestName`, `urgent`, `openTasks`. Urgent rooms first. |
| `POST /api/rooms/:id/status`              | `{ status }`                                                    | `Room`. 409 `invalid_transition` from `out_of_order` straight to `clean` or `inspected`.                                                                                                              |
| `POST /api/housekeeping/tasks`            | `{ roomId, type, notes }`                                       | 201 `HousekeepingTask`. 400 `invalid_input` for a maintenance task without notes.                                                                                                                     |
| `POST /api/housekeeping/tasks/:id/status` | `{ status }`                                                    | `HousekeepingTask`                                                                                                                                                                                    |
| `POST /api/housekeeping/notes`            | `{ text }`                                                      | `HousekeepingNoteResult`: `{ transcript, changes, skipped, unclear }`. Changes are already applied, as the agent. 503 `ai_not_configured`, 429 `demo_limit`.                                          |
| `POST /api/housekeeping/voice`            | multipart, `audio`: WAV (mono 16-bit PCM, 16 kHz), at most 5 MB | `HousekeepingNoteResult` with the transcript. 400 if not WAV, 413 if too large, 502 `transcription_failed`, 503 when voice is not configured.                                                         |

## Agent

### `POST /api/agent`

Body: `{ "messages": UIMessage[] }`, the chat so far in AI SDK UI message format. Responds with an AI SDK UI message stream (`text/event-stream`): text deltas, tool calls and tool results. Proposal tools stream a result of `{ pendingActionId, summary, status: "awaiting_confirmation" }`. See [ai.md](ai.md).

| Status | Code                               | When                                                                          |
| ------ | ---------------------------------- | ----------------------------------------------------------------------------- |
| 400    | `invalid_json`, `invalid_messages` | Missing or malformed messages                                                 |
| 429    | `demo_limit`                       | Per-IP hourly limit or daily token budget reached; `message` is ready to show |
| 503    | `ai_not_configured`                | `META_API_KEY` or `META_MODEL_AGENT` not set                                  |

### `GET /api/pending-actions/:id`

`PendingAction`: `id`, `kind` (`create_hold`, `confirm_booking`, `cancel_booking`, `move_booking`, `change_dates`), `input` (the stored arguments), `summary`, `status` (`pending`, `confirmed`, `rejected`, `failed`), `bookingId`, `error`, `createdAt`, `resolvedAt`.

### `POST /api/pending-actions/:id/confirm`

Runs the stored action through the domain service as the `agent` actor and returns the resolved `PendingAction` (`bookingId` set to the booking created or changed). If the action is no longer valid, it comes back with `status: "failed"`, an `error`, and HTTP 409. Resolving an action twice returns 409 `invalid_transition`.

### `POST /api/pending-actions/:id/reject`

Marks the action `rejected` without running it.

### `GET /api/ai-usage`

This month's real Meta spend: `{ month: "2026-10", budgetMicroUsd, spentMicroUsd, byFeature: [{ feature, calls, inputTokens, cachedInputTokens, outputTokens, audioSeconds, costMicroUsd }] }`. Money is in micro-dollars (1e-6 USD) as integers.
