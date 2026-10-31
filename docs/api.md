# API

`apps/api` is a Hono server. Routes are thin: they validate input with zod schemas from `packages/shared` and call repositories or domain functions. In development the web app reaches it through the Vite proxy, so the browser only ever talks to its own origin.

All responses are JSON and carry `Cache-Control: private, no-store`. Dates are `YYYY-MM-DD`, timestamps are ISO 8601 UTC, money is whole units of the hotel's currency (`PricingConfig.currency`).

## Errors

```json
{ "error": { "code": "not_found", "message": "Booking not found" } }
```

| Status | When                                                                                         |
| ------ | -------------------------------------------------------------------------------------------- |
| 400    | Invalid query (`invalid_query`), body (`invalid_json`, `bad_request`), dates or party        |
| 401    | Demo access code missing (`access_required`) or wrong (`invalid_code`)                       |
| 403    | The signed-in staff member may not do this (`forbidden`)                                     |
| 404    | Unknown resource or route (`not_found`)                                                      |
| 409    | Room taken or email in use (`conflict`), or status change not allowed (`invalid_transition`) |
| 422    | Party does not fit the room (`over_capacity`)                                                |
| 500    | Anything else (`internal`), logged server-side                                               |

## Demo access

With `DEMO_ACCESS_CODE` set, every `/api/*` route answers `401 access_required` until the browser has entered the code. The code sets an HttpOnly `orbit_access` cookie for 30 days: an HMAC keyed by the code, so changing the code signs every browser out. Open without the cookie: `/health`, `/api/access` and the phone scan routes `/api/scan/:scanId` and `/api/scan/:scanId/photo`, whose unguessable scan ID is the key. Without `DEMO_ACCESS_CODE` nothing is locked.

### `GET /api/access`

`{ "required": true, "granted": false }`: whether a code is needed, and whether this browser has entered it.

### `POST /api/access`

Body `{ "code": "…" }`. Sets the cookie and returns `{ "required": true, "granted": true }`, or `401 invalid_code`. After 10 wrong codes from one address in 15 minutes it answers `429 rate_limit`.

## Endpoints

### `GET /health`

```json
{
  "status": "ok",
  "ai": { "configured": false, "voice": false, "vision": false },
  "hotel": { "timezone": "America/Los_Angeles" }
}
```

`ai.configured` is true when `META_API_KEY` and `META_MODEL_AGENT` are set; `ai.voice` when `META_MODEL_VOICE` is set too, `ai.vision` when `META_MODEL_VISION` is. `hotel.timezone` is `HOTEL_TIMEZONE`, which decides what "today" is; the web app shows times in it.

### `GET /api/room-types`

`RoomType[]`: `id`, `name`, `maxAdults`, `maxChildren`, `basePrice` (per room or per adult per night, see `pricingBasis`), `description`.

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
  "allowedActions": ["check_in", "cancel"],
  "registered": false
}
```

### `POST /api/availability`

Free rooms for a stay, cheapest first, each priced: body `{ checkIn, checkOut, adults, childAges, kind?, roomTypeId?, addons?, excludeBookingId? }` (leave out the booking being edited with `excludeBookingId`). Returns `RoomOption[]`: `roomId`, `roomName`, `kind`, `roomType`, `quote`.

### `POST /api/quote`

The exact price of a stay without booking it: body `{ roomId | roomTypeId, checkIn, checkOut, adults, childAges, addons? }`. Returns the `Quote` with line items.

### `POST /api/bookings`

A booking entered by staff: body as the agent's hold (`guest` as `{ guestId }` or `{ name, email, phone, language }`, `roomId`, `checkIn`, `checkOut`, `adults`, `childAges`, `addons`, `source`, `notes`, `inquiryId`) plus `status`: `hold` (default, lapses after the hold time) or `confirmed`. Returns 201 `BookingDetail`. Errors as for a hold: 400 for dates in the past or an invalid party, 409 `conflict`, 422 `over_capacity`.

### Booking mutations

All take JSON, act as `user` in the audit log, and return the updated `BookingDetail`. Rules are in [domain.md](domain.md#booking-operations).

| Endpoint                            | Body                                                                                       | Errors                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `PATCH /api/bookings/:id`           | Any of `roomId`, `checkIn`, `checkOut`, `adults`, `childAges`, `addons`, `source`, `notes` | 400 `invalid_input` (nothing changed), 409 `invalid_transition`, 409 `conflict`, 422 `over_capacity` |
| `POST /api/bookings/:id/actions`    | `{ "action": "confirm" \| "check_in" \| "check_out" \| "cancel" }`                         | 409 `invalid_transition`, 409 `conflict`                                                             |
| `POST /api/bookings/:id/move`       | `{ "roomId": "rm_201" }`                                                                   | 409 `conflict`, 422 `over_capacity`, 404 room                                                        |
| `POST /api/bookings/:id/dates`      | `{ "checkIn": "2026-10-27", "checkOut": "2026-10-30" }`                                    | 400 `invalid_date_range`, 409 `conflict`                                                             |
| `POST /api/bookings/:id/reschedule` | `{ "roomId": "rm_201", "checkIn": "2026-10-28", "checkOut": "2026-10-31" }`                | 400 `invalid_input` (nothing changed), 409 `conflict`, 422 `over_capacity`                           |

A body that fails validation returns 400 `invalid_json`; malformed JSON returns 400 `bad_request`.

`POST /api/bookings/:id/preview` takes the same body as `PATCH` and returns `{ booking, room }` as they would be after the edit, including the new price, without saving.

### `GET /api/bookings/:id/guests`, `POST`, `PATCH /api/bookings/:id/guests/:stayGuestId`, `DELETE`

The stay's guest book (`GuestBook`): `guests` (each a `StayGuest` with `primary` and `missing`, the guest-book fields it still needs), `partySize`, `missing` (people without a complete entry, counting ones not added yet), `extra` (people listed beyond the party size) and `previous` (the main guest's details from an earlier stay, or `null`). Every call returns it.

- `POST` adds a companion: `{ name, nationality?, dateOfBirth?, documentType?, documentNumber?, address?, scanId? }`, `201`. More people than the party is `409 over_capacity`.
- `PATCH` changes any of `name`, `nationality`, `dateOfBirth`, `documentType`, `documentNumber`, `address`; `null` or blank clears a field, the nationality is upper-cased. Renaming the main guest is `400 invalid_input` (edit the profile). `scanId` marks values from an ID scan and deletes it.
- `DELETE` removes a companion; the main guest can't be removed (`400`).

A cancelled booking answers `409 invalid_transition`. Check-in doesn't wait for the guest book; `BookingDetail.missingIds` counts what is missing. See [domain.md](domain.md#guest-book).

### ID scans

- `POST /api/bookings/:id/scans` takes `{ stayGuestId: string | null }` (`null` to add a companion from the scan) and returns `201` with the `IdScan`; its `id` goes in the phone link `/scan/<id>`. `503 ai_not_configured` without a vision model.
- `GET /api/bookings/:id/scans/:scanId` returns the `IdScan` for the desk to poll: `status` (`waiting`, `reading`, `done`, `failed`), `result` (`name`, the guest-book fields, `expiresOn`, `warnings`), `error` and `readingSince`. A read still running after 90 seconds comes back as `failed`, so the photo can be taken again.
- `GET /api/scan/:scanId` is the phone's view, with no sign-in: `{ status, firstName, roomName, error, expiresAt }`, never the result.
- `POST /api/scan/:scanId/photo` (phone) and `POST /api/bookings/:id/scans/:scanId/photo` (desk upload) take a multipart `photo` (JPEG, PNG or WebP, at most 8 MB; the web app sends a JPEG of at most 1600 px), read it with the vision model and return the phone's view. The photo is never stored. A failed model call returns `200` with `status: 'failed'` so the phone can retake. `400` for a file that is not an image, `413` too large, `429` over the demo limits, `409` while a photo is already being read.

An expired, unknown or saved scan is `404`. See [domain.md](domain.md#id-scans) and [ai.md](ai.md#id-scans).

### `GET /api/bookings/:id/folio`

The booking's bill (`Folio`): `lines` (`{ kind: 'stay' | 'city_tax' | 'extra' | 'tax', label, quantity, unitPrice, amount, vatBracket, vatRate, chargeId }`), `payments`, `charged`, `paid`, `balance`, `vat` (one `{ bracket, label, rate, gross, net, vat }` per bracket with charges), `taxMode` and `currency`. See [domain.md](domain.md#billing).

### `POST /api/bookings/:id/charges`, `PATCH` and `DELETE /api/bookings/:id/charges/:chargeId`

`POST` takes `{ label, quantity?, unitPrice, vatBracket? }` (whole units, non-zero; negative for a discount; `vatBracket` is `standard` (default), `reduced` or `none`) and returns `201` with the updated `Folio`. `PATCH` takes any of those fields (at least one) and returns the `Folio`. `DELETE` removes an extra and returns the `Folio`. Only on `confirmed` or `checked_in` bookings, otherwise `409 invalid_transition`.

### `POST /api/bookings/:id/payments`

Takes `{ kind?: 'payment' | 'refund', method: 'cash' | 'card' | 'bank_transfer', amount, note? }` (amount positive, whole units) and returns `201` with the updated `Folio`. A cancelled booking takes refunds only (`409`); a refund larger than what was paid is `400 invalid_input`.

### `GET /api/guests`, `GET /api/guests/:id`

`Guest[]` ordered by name, or one `Guest`: `id`, `name`, `email`, `phone`, `language`, `notes`.

### `POST /api/guests`, `PATCH /api/guests/:id`

`POST` takes `{ name, email?, phone?, language, notes? }` and returns 201 `Guest`; `PATCH` takes any of those fields. Empty strings become `null`. An email another guest has is 409 `conflict`.

### `GET /api/day?date=`

`DayOverview` for `date` (default: today in the hotel's time zone): `arrivals`, `departures` and `inHouse`, each a list of `{ booking, guestName, roomName }`.

### `GET /api/brief?date=`

`DailyBrief` for `date` (default: today): `occupancy` (`occupied`, `sellable`, `total` rooms tonight), `guestsTonight`, `arrivals` and `departures` counts, `turnovers`, `roomsToPrepare`, `holds` (`{ summary, expired }`), `outOfOrder`, `maintenance`, `unansweredMessages` and `gaps` (`{ roomId, roomName, from, to, nights }`). See [domain.md](domain.md#daily-brief).

### `GET /api/activity?actor=&subjectId=&limit=`

The hotel-wide audit log, newest first: `ActivityItem[]`, each an audit entry plus `subject` (`{ kind, id, label }` or `null`) and `byName` (the staff member who made the change, when recorded). `actor` is `user` or `agent`; `subjectId` keeps only changes to one booking, guest, room or conversation; `limit` 1–200, default 100. See [domain.md](domain.md#activity).

### `GET /api/reports?from=&to=`

A `Report` for the nights `[from, to)` (at most 366): `occupancy`, `adr`, `revpar`, `roomRevenue`, `addonRevenue`, `extrasRevenue`, `cityTax`, room nights, guest nights, `arrivals`, `averageStay`, `cancellations`, `bySource`, `byRoomType`, `payments` by method, `unpaidDepartures` and a daily series `days`. A reversed or missing period is `400`. See [domain.md](domain.md#reports).

### `GET /api/audit-log?subjectId=&limit=`

`AuditLogEntry[]`, newest first: `id`, `actor` (`user` | `agent`), `action` (e.g. `booking.check_in`), `subjectId`, `payload`, `createdAt`. `limit` defaults to 50, max 200.

## Inbox

Conversations with guests by email, web form, phone note and OTA messaging ([ADR 0012](decisions/0012-inbox-conversations-and-ai-on-request.md)). `Inquiry`: `id`, `channel` (`email`, `phone`, `web`, `ota`), `partner` (e.g. `Booking.com`), `subject`, `senderName`, `senderAddress` (the guest), `receivedAt`, `lastMessageAt`, `messages` (oldest first: `{ id, direction: 'in' | 'out', body, sentAt, author, translation: { language, text } | null }`), `unread`, `archivedAt`, `parsed` (the extraction), `suggestion` (`{ options: StayOption[], note, draft, draftLanguage, draftTranslation }`), `status` (`new`, `quoted`, `replied`, `converted`, `declined`), `bookingId`, `processedAt`, `processingError`. Nothing here calls a model except `read`, `draft`, `process` (both in one) and the two translate endpoints. Messages staff send are signed with the signed-in staff member (`x-staff-id`).

| Endpoint                                            | Body                                                                     | Returns                                                                                                                                                                                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/inbox`                                    |                                                                          | `Inquiry[]`, latest message first                                                                                                                                                                                                          |
| `POST /api/inbox`                                   | `{ body, channel?, partner?, subject?, senderName?, senderAddress? }`    | 201 `Inquiry`: a guest's first message                                                                                                                                                                                                     |
| `POST /api/inbox/compose`                           | `{ to, cc?, bcc?, subject, body, attachmentIds?, forwardOf?, draftId? }` | 201 `Inquiry`: a new email or a forward from the hotel, to the first `to`                                                                                                                                                                  |
| `GET /api/inbox/:id`                                |                                                                          | `Inquiry`                                                                                                                                                                                                                                  |
| `POST /api/inbox/:id/send`                          | `{ body, to?, cc?, bcc?, attachmentIds?, draftId? }`                     | `Inquiry` with the hotel's message added (copies only by email), `status: "replied"` (unless converted or declined) and the draft used up. Delivery happens outside Orbit.                                                                 |
| `POST /api/inbox/:id/receive`                       | `{ body }`                                                               | `Inquiry` with the guest's next message: unread, back in the inbox, `status: "new"` unless settled, the prepared reply cleared.                                                                                                            |
| `POST /api/inbox/:id/unread`                        | `{ unread }`                                                             | `Inquiry`                                                                                                                                                                                                                                  |
| `POST /api/inbox/:id/archive`                       | `{ archived }`                                                           | `Inquiry`                                                                                                                                                                                                                                  |
| `POST /api/inbox/:id/read`                          | `{ force?: boolean }`                                                    | `Inquiry` with `parsed` and `suggestion.options`, no draft: the request read and its rooms found. A conversation already read since the guest last wrote returns at no cost. 503 `ai_not_configured`, 429 `demo_limit`.                    |
| `POST /api/inbox/:id/draft`                         | `{ language?: Language }`                                                | `Inquiry` with `suggestion.draft` written from the stored reading and the room held now (reading the request first if needed), translated into `language` when it differs from the guest's. Rooms are looked up again. 503, 429 as above.  |
| `POST /api/inbox/:id/process`                       | `{ force?: boolean, language?: Language }`                               | `Inquiry` with `parsed` and `suggestion`, the draft translated into `language` when it differs from the guest's. Already prepared conversations return at no cost. 503 `ai_not_configured`, 429 `demo_limit`.                              |
| `POST /api/inbox/:id/messages/:messageId/translate` | `{ to: Language }`                                                       | `Inquiry` with the message's `translation`, kept so asking again is free. 404, 422 `translation_failed`, 503, 429.                                                                                                                         |
| `POST /api/inbox/translate`                         | `{ text, to: Language }`                                                 | `{ text }`: any text translated, e.g. a reply as staff edit it. Nothing is stored. 422 `translation_failed`, 503, 429.                                                                                                                     |
| `POST /api/inbox/:id/hold`                          | `{ roomId }`                                                             | 201 `BookingDetail` of the hold for the requested stay: a new one, or the message's hold moved to this room and re-quoted. 409 if the message has no complete stay request, that room is already held, or its booking is no longer a hold. |
| `POST /api/inbox/:id/hold-block`                    |                                                                          | 201 `Inquiry` with every room of its block held for the guest (`blockBookingIds`). 409 if it has no block or already has a hold.                                                                                                           |
| `POST /api/inbox/:id/rooms`                         |                                                                          | `Inquiry` with rooms looked up again for its request (`refreshOptions`) and the old draft dropped. 409 `invalid_transition` before it is read.                                                                                             |
| `POST /api/inbox/:id/learn`                         |                                                                          | The `PendingAction` (`save_hotel_info`) for a fact the latest reply states that the hotel information lacks, or `null`. One model call. 503 `ai_not_configured`, 429 `demo_limit`.                                                         |
| `POST /api/inbox/:id/decline`                       |                                                                          | `Inquiry` with `status: "declined"`. 409 `invalid_transition` if it already led to a booking.                                                                                                                                              |

### Notes before a stay

| Endpoint                                   | Body                        | Returns                                                                                                                                                                                                                            |
| ------------------------------------------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/arrival-notes`                   | `?date=` (default tomorrow) | `{ date, due }`: confirmed arrivals on that day whose guest has an email and hasn't heard from the hotel about the stay, with name, email, language, room, room type, party and add-ons.                                           |
| `POST /api/arrival-notes/:bookingId/draft` |                             | `{ subject, body }` written by the model in the guest's language; nothing is saved. 422 `draft_failed` when it can't be written without an unstated amount, 503 `ai_not_configured`, 429 `demo_limit`, 404 for an unknown booking. |
| `POST /api/arrival-notes/:bookingId/send`  | `{ subject, body }`         | 201 `Inquiry`: the note sent as an email linked to the booking, signed by the signed-in staff member. 400 for an empty subject or body or a guest without an email.                                                                |

### Mailbox

Registered before `/api/inbox/:id`, so these paths win. Nothing here calls a model.

| Endpoint                                                               | Body                                                                          | Returns                                                                                                                                          |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/inbox/labels`, `POST`, `PUT /api/inbox/labels/:id`, `DELETE` | `{ name, color? }`                                                            | `MailLabel[]`, `MailLabel`, 204. 409 for a name already taken.                                                                                   |
| `GET /api/inbox/drafts`                                                |                                                                               | `MailDraft[]`, latest first                                                                                                                      |
| `PUT /api/inbox/drafts/:id`                                            | `{ inquiryId?, forwardOf?, to?, cc?, bcc?, subject?, body?, attachmentIds? }` | `MailDraft`, created or replaced. 400 for an ID not shaped `drf_…`.                                                                              |
| `DELETE /api/inbox/drafts/:id`                                         |                                                                               | 204                                                                                                                                              |
| `POST /api/inbox/attachments`                                          | multipart, `file`, at most 4 MB                                               | 201 `Attachment` (`{ id, name, contentType, size }`). 400 without a file, 413 too large.                                                         |
| `GET /api/inbox/attachments/:id`                                       | `?download` to force a download                                               | The file. PDFs and PNG, JPEG, GIF and WebP images open in place; anything else downloads as `application/octet-stream`, sandboxed and `nosniff`. |
| `POST /api/inbox/bulk`                                                 | `{ ids, action, labelId? }`                                                   | `Inquiry[]`. `labelId` with `label` and `unlabel` only.                                                                                          |
| `POST /api/inbox/:id/star`                                             | `{ starred }`                                                                 | `Inquiry`                                                                                                                                        |
| `POST /api/inbox/:id/labels`                                           | `{ labelIds }`                                                                | `Inquiry`, its labels replaced                                                                                                                   |
| `POST /api/inbox/:id/trash`                                            | `{ trashed }`                                                                 | `Inquiry`                                                                                                                                        |
| `DELETE /api/inbox/:id`                                                |                                                                               | 204. 409 unless it is in the trash.                                                                                                              |

## Housekeeping

| Endpoint                                  | Body                                                            | Returns                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/housekeeping`                   |                                                                 | `{ date, rooms: HousekeepingRoom[] }`: each room with `roomTypeName`, `occupancy` (`turnover`, `arriving`, `departing`, `staying`, `vacant`), `guestName`, `urgent`, `effort` (`light`, `standard`, `heavy` or null), `cues`, `openTasks`; and `unreadStays`. Urgent rooms first, heavier cleans first within the same occupancy. |
| `POST /api/housekeeping/read-stays`       |                                                                 | The board, after the model read up to 12 unread stays' notes. Returns at once, without a model call, when none are unread. 503 `ai_not_configured`, 429 `demo_limit`.                                                                                                                                                             |
| `POST /api/rooms/:id/status`              | `{ status }`                                                    | `Room`. 409 `invalid_transition` from `out_of_order` straight to `clean` or `inspected`.                                                                                                                                                                                                                                          |
| `POST /api/housekeeping/tasks`            | `{ roomId, type, notes, trade? }`                               | 201 `HousekeepingTask`. A repair without `trade` gets one from the model when AI is on and within the limit, else null. 400 `invalid_input` for a maintenance task without notes.                                                                                                                                                 |
| `POST /api/housekeeping/tasks/:id/status` | `{ status }`                                                    | `HousekeepingTask`                                                                                                                                                                                                                                                                                                                |
| `POST /api/housekeeping/notes`            | `{ text }`                                                      | `HousekeepingNoteResult`: `{ transcript, changes, skipped, unclear }`. Changes are already applied, as the agent. 503 `ai_not_configured`, 429 `demo_limit`.                                                                                                                                                                      |
| `POST /api/housekeeping/voice`            | multipart, `audio`: WAV (mono 16-bit PCM, 16 kHz), at most 5 MB | `HousekeepingNoteResult` with the transcript. 400 if not WAV, 413 if too large, 502 `transcription_failed`, 503 when voice is not configured.                                                                                                                                                                                     |

## Contacts and repairs

### `GET /api/contacts`, `POST /api/contacts`, `PUT /api/contacts/:id`, `DELETE /api/contacts/:id`

Suppliers and contractors, by name. The body is `contactBodySchema`: `name`, `person`, `trades` (1 to 4), `phone`, `email`, `language`, `notes`; empty strings save as null. `DELETE` answers 204.

### `GET /api/housekeeping/tasks/:id/repair`

A maintenance task as a `Repair`: the task, its room name, `access` (`guestName`, `freeFrom`, `freeUntil`), the contacts for its trade and the contact already asked. 400 for a cleaning task.

### `POST /api/housekeeping/tasks/:id/contact`

`{ contactId }`. Records that the contact was asked to fix the repair and starts the task. Returns the task.

### `POST /api/housekeeping/tasks/:id/work-order`

`{ contactId }`. Drafts the email asking the contact to come (Muse Spark Open, falling back to Muse Spark), in the contact's language, signed by the staff member in `x-staff-id`. Returns `{ to, subject, body }`; nothing is sent. 503 without AI, 429 over the demo limit.

## Knock-ons

What a change made worth doing next, worked out from current data ([ADR 0018](decisions/0018-knock-ons-worked-out-on-read.md), [domain.md](domain.md#knock-ons)).

### `GET /api/knock-ons`

`KnockOn[]`: `{ kind: 'relocate', id, roomId, roomName, moves: [{ bookingId, guestName, checkIn, checkOut, status, toRoomId, toRoomName, sameType }] }` for an out-of-order room with stays to move (`toRoomId` null when no room is free), and `{ kind: 'opening', id, inquiryId, guestName, checkIn, checkOut, rooms, fromTotal }` for a request a room is free for again. `id` stays the same while the situation does.

### `POST /api/knock-ons/relocate`

`{ moves: [{ bookingId, roomId }] }` (1 to 20). Moves each stay, as `POST /api/bookings/:id/move` would; returns the moved `Booking[]`. Stops at the first move that is no longer valid (409).

## Settings and staff

Requests are signed in with the `x-staff-id` header: the ID of an active staff member ([ADR 0009](decisions/0009-staff-roles-and-demo-sign-in.md)). Reads need no header; changes need an active manager, otherwise `403 forbidden`.

### `GET /api/settings/profile`, `PUT /api/settings/profile`

`HotelProfile`: `name`, `location`, `description`, `phone`, `email`, `website`, `checkInFrom` and `checkOutBy` (`HH:MM`), `country` (ISO alpha-2; sets the guest-book rules), `language` (the working language new staff and guests start with), `coordinates` (`{ latitude, longitude }` or null; where the weather forecast is for), and `entries`, the notes in Knowledge (`{ id, category, title, details, tags?, until?, source?, updatedAt? }`, at most 100; `category` is the folder: `policies`, `rooms`, `food`, `wellness`, `activities`, `getting_here` or `services`, and entries stored with the old `policy`, `amenity` or `info` read as `policies`, `services` and `services`). `PUT` replaces the profile except its entries, which stay as stored (they change through `/api/hotel-info`), and returns it; empty strings become `null`. Check-out must be earlier than check-in (`400 invalid_input`). See [domain.md](domain.md#hotel-profile).

### `GET /api/hotel-info`, `POST /api/hotel-info`, `PUT /api/hotel-info/:id`, `DELETE /api/hotel-info/:id`

Knowledge: the profile's entries, as notes. `GET` returns them; `POST` (201) and `PUT` take `{ category, title, details, tags, until }` (`details` up to 1000 characters, with `[[Title]]` links to other notes and `- ` list lines; `tags` up to six, tidied to lowercase without `#` or repeats, default `[]`; `until` a date or null) and return the entry with `source: "staff"` and `updatedAt`; `DELETE` returns 204. Any active staff member (`x-staff-id`), otherwise 403 `forbidden`. 409 `conflict` for a title another entry has, 400 `invalid_input` for a new end date in the past or a 101st entry, 404 for an unknown ID. Renaming a note points the links to it in other notes at the new title.

### `POST /api/hotel-info/file`

Body `{ text }` (1–1500 characters): a note described in staff's own words. Returns `{ id, draft }`: the note as Orbit titled, filed, tagged and linked it, either new (`id` null) or folded into the existing note `id` covers, with that note's text kept. Saves nothing: staff save `draft` with `POST /api/hotel-info` or `PUT /api/hotel-info/:id`. One model call. 503 `ai_not_configured`, 429 `demo_limit`, 422 `not_filed` when the model's note doesn't fit one (empty, too long, or a title another note has).

### `GET /api/settings/pricing`, `PUT /api/settings/pricing`

`PricingConfig`: `currency` (`USD`, `EUR`, `CZK`), `pricingBasis` (`per_room`, `per_person`), `tax` (`{ mode: 'inclusive' | 'exclusive', standard: { label, rate }, reduced: { label, rate } }`, rates in percent with up to two decimals), `seasons` (`{ name, from, to, multiplier }`, days as `MM-DD`), `childDiscounts` (`{ maxAge, discount }`, ascending age), `longStay` (`{ minNights, discount }`), `wellness` (`{ perPersonPerNight, minAge }`), `extraBed` (`{ perNight }`) and `dog` (`{ perNight }`), `cityTax` (`{ label, perPersonPerNight, minAge }`) and `adjustments` (`{ date, percent }`, one per night). Discounts are fractions (0.5 = half); money is whole units of `currency`. `PUT` replaces the rates and returns them; new quotes use them right away, existing bookings keep their price. An impossible day, a duplicate season or out-of-order child tiers are `400 invalid_input`. See [domain.md](domain.md#rates-and-rooms).

### `POST /api/rates/adjust`

Body `{ nights: [{ date, percent }] }` (1 to 120 nights, −50 to +100; 0 goes back to the season rate). Returns the `PricingConfig`. A night given twice is `400 invalid_input`. See [domain.md](domain.md#rate-outlook).

### `GET /api/revenue/outlook?days=`

`RevenueOutlook` for `days` nights from today (7 to 90, default 60): `today`, `nights` (`{ date, roomsSold, roomsTotal, typicalOccupancy, currentPercent, suggestedPercent, rates: [{ roomType, current, suggested }], factors: [{ kind: 'demand' | 'event' | 'weather' | 'insight', label, percent, detail? }], events, weather, expectedNoShows }`), `events` in the period, `arrivalRisks` (`{ bookingId, guestName, roomName, checkIn, source, chance, reasons }`), `weatherAvailable`, and `review` (`{ basis, reviewedAt, current }`: the fingerprint of what a review would read now, when the stored review was made, and whether it read that). The forecast comes from Open-Meteo for the profile's `coordinates`, cached for three hours; without coordinates, or when it fails within 4 s, the nights have no weather. Reads need no header.

### `POST /api/revenue/brief`

Body `{ days? }`. `{ text }`: a few sentences from Muse Spark on the outlook. 503 `ai_not_configured`, 429 `demo_limit`, 502 `brief_failed` when the text twice stated a percent the outlook doesn't have.

### `POST /api/revenue/review`

Body `{ days? }`. Reviews the outlook with Muse Spark when what it reads changed since the stored review, then returns the `RevenueOutlook` for `days` nights with the review's signals; when nothing changed it returns at once without a model call. Concurrent requests for the same outlook share one review. 503 `ai_not_configured`, 429 `demo_limit`, 502 `review_failed`.

### `GET /api/events`, `POST /api/events`, `DELETE /api/events/:id`

`LocalEvent[]` by first night. `POST` body `{ name, firstNight, lastNight, impact }` returns `201` with the event; a last night before the first is `400`. `DELETE` returns `204`, `404` for an unknown event.

### `POST /api/room-types`, `PUT /api/room-types/:id`

Body `{ name, maxAdults, maxChildren, basePrice, description }`. `POST` returns `201` with the new `RoomType`; `PUT` replaces the fields and returns it.

### `POST /api/rooms`, `PUT /api/rooms/:id`

Body `{ name, roomTypeId, kind, floor }`. `POST` returns `201` with the new `Room`, status `clean`; `PUT` keeps the room's status. A name another room has is `409 conflict`; an unknown room type is `404`.

### `GET /api/staff`

`StaffMember[]`, active members first, then by name: `id`, `name`, `email`, `role` (`manager` | `receptionist` | `housekeeping`), `active`.

### `POST /api/staff`, `PATCH /api/staff/:id`

`POST` takes `{ name, email?, role }` and returns `201` with the new member. `PATCH` takes any of `name`, `email`, `role`, `active`. A used email is `409 conflict`; removing the last active manager is `400 invalid_input`.

## Agent

### `POST /api/agent`

Body: `{ "messages": UIMessage[] }`, the chat so far in AI SDK UI message format. A staff member's message may carry `metadata.context`: `{ kind: "booking" | "guest" | "inquiry", id }`, what they were looking at. The server reads that record itself and puts a one-line note before the message for the model; an unknown kind is a 400, a record that no longer exists is left out. Responds with an AI SDK UI message stream (`text/event-stream`): text deltas, tool calls and tool results. Proposal tools stream a result of `{ pendingActionId, summary, status: "awaiting_confirmation" }`. See [ai.md](ai.md).

| Status | Code                               | When                                                                          |
| ------ | ---------------------------------- | ----------------------------------------------------------------------------- |
| 400    | `invalid_json`, `invalid_messages` | Missing or malformed messages                                                 |
| 429    | `demo_limit`                       | Per-IP hourly limit or daily token budget reached; `message` is ready to show |
| 503    | `ai_not_configured`                | `META_API_KEY` or `META_MODEL_AGENT` not set                                  |

### `POST /api/agent/transcribe`

A question asked out loud, as the multipart field `audio`: a WAV recording (mono 16-bit PCM, 16 kHz, at most 5 MB). Returns `{ text }`, transcribed by Meta's speech-to-text listening for the names of guests staying from yesterday to two weeks out and room names that aren't plain numbers. The app sends the text to `POST /api/agent` as a typed question. 400 `invalid_input` for a missing file or one that isn't WAV, 413 `too_large`, 429 `demo_limit`, 502 `transcription_failed`, 503 `ai_not_configured` without `META_MODEL_VOICE`.

### `GET /api/pending-actions/:id`

`PendingAction`: `id`, `kind` (`create_hold`, `confirm_booking`, `cancel_booking`, `check_in`, `check_out`, `move_booking`, `change_dates`, `update_booking`, `add_charge`, `record_payment`, `update_charge`, `remove_charge`, `add_stay_guest`, `update_stay_guest`, `remove_stay_guest`, `update_guest`, `adjust_rates`, `save_hotel_info`, `remove_hotel_info`, `send_reply`, `hold_inquiry`, `hold_block`, `decline_inquiry`, `add_local_event`, `remove_local_event`, `update_room`), `input` (the stored arguments), `summary`, `details` (`changes`: `{ label, before, after }` where each side is `{ text }`, `{ checkIn, checkOut }` or null; `amount`: `{ label, before, after }` or null; `note`; null for actions proposed before details were recorded), `status` (`pending`, `confirmed`, `rejected`, `failed`), `bookingId`, `error`, `createdAt`, `resolvedAt`.

### `POST /api/pending-actions/:id/confirm`

Runs the stored action through the domain service as the `agent` actor, confirmed by the signed-in staff member (`x-staff-id`), and returns the resolved `PendingAction`. A reply is signed with their name; adding or removing a local event and changing a room fail (409, `failed`) unless they are an active manager. It returns `bookingId` set to the booking created or changed. If the action is no longer valid, it comes back with `status: "failed"`, an `error`, and HTTP 409. Resolving an action twice returns 409 `invalid_transition`.

### `POST /api/pending-actions/:id/reject`

Marks the action `rejected` without running it.

### `GET /api/ai-usage`

This month's real Meta spend: `{ month: "2026-10", budgetMicroUsd, spentMicroUsd, byFeature: [{ feature, calls, inputTokens, cachedInputTokens, outputTokens, audioSeconds, costMicroUsd }] }`. Money is in micro-dollars (1e-6 USD) as integers.
