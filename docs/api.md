# API

`apps/api` is a Hono server. Routes are thin: they validate input with zod schemas from `packages/shared` and call repositories or domain functions. In development the web app reaches it through the Vite proxy, so the browser only ever talks to its own origin.

All responses are JSON. Dates are `YYYY-MM-DD`, timestamps are ISO 8601 UTC, money is whole CZK.

## Errors

```json
{ "error": { "code": "not_found", "message": "Booking not found" } }
```

| Status | When                                                                            |
| ------ | ------------------------------------------------------------------------------- |
| 400    | Invalid query or body (`invalid_query`), invalid dates or party from the domain |
| 404    | Unknown resource or route (`not_found`)                                         |
| 409    | Domain conflict (`conflict`)                                                    |
| 422    | Party does not fit the room (`over_capacity`)                                   |
| 500    | Anything else (`internal`), logged server-side                                  |

## Endpoints

### `GET /health`

```json
{ "status": "ok", "ai": { "configured": false } }
```

`ai.configured` is true when `META_API_KEY` and `META_MODEL_AGENT` are set.

### `GET /api/room-types`

`RoomType[]`: `id`, `name`, `maxAdults`, `maxChildren`, `basePrice` (adult rate per person per night), `description`.

### `GET /api/rooms`, `GET /api/rooms/:id`

`Room[]` ordered by floor and name, or one `Room`: `id`, `name`, `roomTypeId`, `kind`, `floor`, `status`.

### `GET /api/bookings`, `GET /api/bookings/:id`

`Booking[]` ordered by check-in, or one `Booking`: `id`, `guestId`, `roomId`, `checkIn`, `checkOut`, `adults`, `childAges`, `status`, `holdExpiresAt`, `source`, `priceSnapshot` (the quote at booking time), `notes`.

Query parameters for the list, all optional:

| Param        | Example                | Meaning                                          |
| ------------ | ---------------------- | ------------------------------------------------ |
| `from`, `to` | `2026-10-27`           | Bookings with at least one night in `[from, to)` |
| `status`     | `confirmed,checked_in` | Comma-separated booking statuses                 |
| `guestId`    | `gst_cs_01`            | One guest's bookings                             |
| `roomId`     | `rm_101`               | One room's bookings                              |

### `GET /api/guests`, `GET /api/guests/:id`

`Guest[]` ordered by name, or one `Guest`: `id`, `name`, `email`, `phone`, `language`, `notes`.
