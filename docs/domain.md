# Domain

Business logic lives in `packages/domain`. It is pure TypeScript: no network, no database driver, no env access. Entity shapes are zod schemas in `packages/shared`.

## Entities

| Entity           | Key fields                                                                                                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RoomType         | name, `maxAdults`, `maxChildren`, `basePrice` (adult rate per person per night, CZK), description                                                                                                               |
| Room             | name, room type, `kind` (`room` \| `apartment`), floor, `status` (`clean` \| `dirty` \| `inspected` \| `out_of_order`)                                                                                          |
| Guest            | name, email, phone, `language` (`cs` \| `de` \| `en` \| `pl`), notes                                                                                                                                            |
| Booking          | guest, room, `checkIn`, `checkOut`, adults, `childAges`, `status`, `holdExpiresAt`, `source`, `addons` (wellness, dogs, extra beds), `priceSnapshot` (a quote), notes                                           |
| Inquiry          | raw text, channel, received at, parsed extraction, `status`, linked booking                                                                                                                                     |
| HousekeepingTask | room, `type` (`turnover` \| `stayover` \| `maintenance`), `status` (`open` \| `in_progress` \| `done`), notes                                                                                                   |
| HotelProfile     | name, location, description, contact, `checkInFrom`, `checkOutBy`, `entries` (`policy` \| `amenity` \| `info`, title, details)                                                                                  |
| Charge           | booking, label, quantity, `unitPrice` (CZK, negative for a discount), amount, `vatBracket` (`standard` \| `reduced` \| `none`), `postedOn`                                                                      |
| Payment          | booking, `kind` (`payment` \| `refund`), `method` (`cash` \| `card` \| `bank_transfer`), amount (positive CZK), note, `paidOn`                                                                                  |
| StayGuest        | booking, guest profile (main guest only), name, `nationality` (ISO alpha-2), `dateOfBirth`, `documentType` (`id_card` \| `passport`), `documentNumber`, address, `registeredAt`, each ID field null until known |
| IdScan           | booking, stay guest (or none, for a companion still to add), `status` (`waiting` \| `reading` \| `done` \| `failed`), checked result, error, `readingSince`, `expiresAt`                                        |
| StaffMember      | name, email, `role` (`manager` \| `receptionist` \| `housekeeping`), `active`                                                                                                                                   |
| AuditLog         | `actor` (`user` \| `agent`), action, `subjectId` (e.g. a booking), payload, timestamp                                                                                                                           |

## Booking lifecycle

```mermaid
stateDiagram-v2
  [*] --> hold
  hold --> confirmed: confirm
  hold --> cancelled: cancel
  confirmed --> checked_in: check_in
  confirmed --> cancelled: cancel
  checked_in --> checked_out: check_out
```

`allowedActions(booking, today)` lists the actions the UI and agent may offer:

- `confirm` a hold. Fails with `conflict` if the room was taken after the hold expired.
- `check_in` a confirmed booking only on a day of the stay (`checkIn ≤ today < checkOut`). It doesn't wait for the guest book: missing IDs stay flagged on the booking ([Guest book](#guest-book)), see [ADR 0010](decisions/0010-guest-book-per-person-and-phone-id-scans.md).
- `check_out` a checked-in guest, any day. The room becomes `dirty`.
- `cancel` a hold or confirmed booking. Checked-in guests check out instead.

Anything else throws `invalid_transition`.

## Booking operations

Pure functions in `packages/domain/src/bookings.ts`, wrapped by `createHotelService` (`service.ts`), which loads data through the repositories, runs each mutation in a transaction and appends an audit entry (`actor`, `action`, `subjectId`, `payload`). Before a mutation reads a room's bookings to check for conflicts, it locks that room's row (`SELECT … FOR UPDATE`) until the transaction ends, so two requests for the same room are checked one after the other and can't both book it.

| Operation                                                     | Rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `applyBookingAction(id, action, actor)`                       | See lifecycle above. Audit action `booking.<action>`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `moveBooking(id, roomId, actor)`                              | Same dates, different room. Booking must be `hold`, `confirmed` or `checked_in`. The target room must not be out of order, must fit the party (counting extra beds), and must be free. **The agreed price is kept**, even across room types.                                                                                                                                                                                                                                                                                                                                                     |
| `changeBookingDates(id, range, actor)`                        | Same room, new dates, **re-priced** with `quote()` and the booking's stored add-ons. Checked-in guests can only change their departure.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `rescheduleBooking(id, { roomId, checkIn, checkOut }, actor)` | Room and dates in one step (a tape chart drag). Same rules as a move plus a date change; a no-op throws `invalid_input`. The price is kept if only the room changes and re-quoted in the target room's type if the dates change.                                                                                                                                                                                                                                                                                                                                                                 |
| `updateBooking(id, patch, actor)`                             | Any of room, dates, party (`adults`, `childAges`), `addons`, `source`, `notes` in one step. Room and dates follow the move and date-change rules, the party must fit the target room (counting extra beds), and checked-in guests keep their arrival date. **Re-priced** when dates, party or add-ons change; a room change alone keeps the agreed price. Checked-out and cancelled bookings only take note changes; a patch that changes nothing throws `invalid_input`. Audit action `booking.update` with the changed fields and totals. `previewUpdate` runs the same checks without saving. |
| `getBookingDetail(id)`                                        | Booking with guest, room, room type and `allowedActions`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `getDayOverview(date)`                                        | `arrivals` (check-in that day: hold, confirmed or already checked in), `departures` (check-out that day: checked in or already checked out), `inHouse` (arrived earlier, leaving later). Defaults to today at the hotel.                                                                                                                                                                                                                                                                                                                                                                         |

## Holds and agent proposals

`createBooking(input, actor)` is what staff use: the same as a hold, or `status: 'confirmed'` straight away (a phone or walk-in booking), which never lapses (audit action `booking.create`). `roomOptions(query)` lists the free rooms for a stay, cheapest first, each with an exact quote including add-ons; `excludeBookingId` leaves out the booking being edited.

`createHold(input, actor)` creates a `hold` for an existing guest (`guestId`) or a new guest record, priced with `quote()` and stored add-ons. Rules: valid dates, check-in not in the past, room not out of order, party fits, room free. The hold expires after `hotelPolicy.holdHours` (placeholder: 48).

Every mutation also has a `preview*` variant that runs the same rules against current data without saving. `createPendingActionService` uses these to validate agent proposals, store them as pending actions, and execute them only on confirmation. See [ai.md](ai.md#approval-pattern).

`searchBookings` matches guest names ignoring case and accents (`novak` finds `Novák`).

## Inbox

`createInboxService` (`inbox-service.ts`) keeps guest messages from every channel in one stream.

- `inboxOptions(analysis)`: for a complete booking request, up to three free rooms, one per room type, cheapest first, each with an exact quote. An apartment is required if the guest asks for one, or brings a dog (`hotelPolicy.dogsAllowedIn`, placeholder: apartments only). Wellness and a dog become quote add-ons.
- `saveProcessing(id, result)`: stores the agent's extraction and suggestion; a `new` message with options becomes `quoted`.
- `createHold(id, roomId, actor)`: a hold for the requested stay in the chosen room. Reuses a guest whose email matches the sender (case-insensitive), otherwise creates one. The hold and the message's `bookingId` are saved in one transaction.
- `markReplied(id, reply, actor)`: stores the sent reply and marks the message `replied`.
- `decline(id, actor)`: marks a message `declined`, unless it already led to a booking (`invalid_transition`).

## Guests

`createGuestService` (`guests.ts`) creates and edits guest records (`name`, `email`, `phone`, `language`, `notes`). An email may belong to only one guest, ignoring case (`conflict`), because the inbox recognises returning guests by email. Changes are audited as `guest.create` and `guest.update` with the guest as subject.

## Housekeeping

`packages/domain/src/housekeeping.ts` and `housekeeping-service.ts`.

- **Room status** is `dirty`, `clean`, `inspected` or `out_of_order`. Staff may set any status, except straight from `out_of_order` to `clean` or `inspected`: a repaired room is marked `dirty` and cleaned first.
- **Tasks** are `turnover`, `stayover` or `maintenance`, each `open`, `in_progress` or `done`. A maintenance task needs a description. Setting a room `clean` or `inspected` completes its open turnover and stayover tasks.
- **Board**: every room with what happens in it today, from the bookings: `turnover` (one guest leaves, another arrives), `arriving`, `departing`, `staying` or `vacant`. A room is **urgent** when a guest arrives today and it is not `inspected`. Urgent rooms come first, then by occupancy, then by name.
- **Notes**: a housekeeping note (voice or typed) is read by the model into room/status/issue updates. The domain resolves the room names (whole words: "pokoj 104", "A 1"), applies status changes and creates maintenance tasks in one transaction, and skips updates for unknown rooms or forbidden changes with a reason. A note saying a room is clean leaves an already inspected room inspected.
- Every change is written to the audit log (`room.status`, `task.create`, `task.status`), with the room as subject.

## Daily brief

`buildDailyBrief` (`packages/domain/src/brief.ts`), via `getDailyBrief(date)` on the hotel service, sums up a day for the staff. It is computed from current data on every request; no model is involved.

| Field                       | Meaning                                                                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `occupancy`                 | Rooms taken tonight (`occupied`) out of rooms not out of order (`sellable`) and all rooms (`total`). A lapsed hold does not count.                                                          |
| `guestsTonight`             | Adults and children in the rooms taken tonight.                                                                                                                                             |
| `arrivals`, `departures`    | Counts, as in the day overview.                                                                                                                                                             |
| `turnovers`                 | Rooms where one guest leaves and another arrives today, with the room status.                                                                                                               |
| `roomsToPrepare`            | Rooms a guest arrives in today (not yet checked in) that are not `inspected`.                                                                                                               |
| `holds`                     | Unconfirmed holds that lapsed, lapse within 24 hours, or arrive within 7 days, by check-in.                                                                                                 |
| `outOfOrder`, `maintenance` | Out-of-order rooms and open maintenance tasks.                                                                                                                                              |
| `unansweredMessages`        | Inbox messages that are `new` or `quoted`.                                                                                                                                                  |
| `gaps`                      | Runs of 1–2 empty nights between two stays in the same room, starting within the next 14 days, worth a discount. A run already under way counts from today. Out-of-order rooms are skipped. |

## Hotel profile

`createSettingsService` (`settings.ts`) keeps the hotel profile: the property's name, location, description, contact details, check-in and check-out times, and a list of entries, each a `policy`, `amenity` or `info` (anything else guests ask, such as directions or reception hours). The agent's prompts are built from it ([ai.md](ai.md#prompts)).

- Until a profile is saved, `getProfile()` returns an empty one (`emptyHotelProfile`).
- `updateProfile(profile, by)` replaces the whole profile; only an active manager may (`forbidden`). Entry IDs must be unique and check-out must be earlier in the day than check-in, so rooms can be turned over (`invalid_input`). It writes `settings.profile` to the audit log with who saved it (`by`) and the names of the changed fields; a save that changes nothing writes nothing.
- Rules the system enforces (hold length, which room kinds take dogs, prices) stay in `hotelPolicy` and the rates, not in the profile.

## Activity

`createActivityService` (`activity.ts`) lists the audit log hotel-wide, newest first, optionally only the agent's or only staff changes. `describeActivity` names each entry's subject from its action prefix (`booking.*` and `folio.*` → the booking as "guest, room"; `room.*` and `task.*` → the room; `room_type.*`, `guest.*`, `staff.*`, `inquiry.*`) and the staff member recorded as `by` in its payload. A subject that no longer exists is left unnamed.

## Guest book

`createRegistrationService` (`registration.ts`) keeps the guest book: one entry per person staying in the room (`StayGuest`). The main guest's entry has the fixed ID `sg_<bookingId>` and takes its name from their profile; it exists in the book before anything is recorded. Companions are added by name, with ID details if known.

`missingFields(person, today, policy)` lists what an entry still needs:

- nationality and date of birth, always;
- document type and number, from `idDocumentMinAge` (15: Czech ID cards are compulsory from 15) or when the age is unknown;
- a home address when the nationality is not the hotel's `homeCountry` (`CZ`).

`buildGuestBook` returns everyone (main guest first, then companions in the order they were added), the party size (adults plus children) and `missing`: people with an incomplete entry plus people the party counts that nobody added yet. `BookingDetail.missingIds` is the same number.

- `getGuestBook(bookingId)` also returns the main guest's details from their latest earlier stay, to prefill.
- `addGuest(bookingId, body, actor)` adds a companion, up to the party size (`over_capacity`).
- `updateGuest(bookingId, stayGuestId, patch, actor)` changes a name or ID fields; `null` clears one. The main guest's name is changed on their profile (`invalid_input`).
- `removeGuest(bookingId, stayGuestId, actor)` takes a companion off; the main guest stays (`invalid_input`).
- Any status but `cancelled` may change (`invalid_transition`), so a missing ID can be added after check-in or check-out. A date of birth must be in the past (`invalid_input`).
- Audited on the booking as `booking.add_guest`, `booking.update_guest` and `booking.remove_guest` with the stay guest ID and the names of the changed fields, never their values. `scanned: true` marks values from an ID scan; saving them deletes the scan in the same transaction.
- Check-in does not wait for the guest book, and the agent's check-in proposal says how many guests still need an ID.

## ID scans

`createIdScanService` (`id-scan.ts`) runs phone scans of ID documents. The domain never sees the photo: the API has the vision model read it and passes the reading in.

1. `start(bookingId, stayGuestId | null)` opens a scan for one person, or for a companion still to add, and deletes expired scans. Its ID is an unguessable token (144 random bits from the API) and the only key to the phone link; it expires after `idScanMinutes` (15).
2. `getForPhone(id)` returns only the status, the person's first name and the room, never the result.
3. `beginReading(id)` marks a photo as being read and when (`conflict` while one already is); a retake after `done` or `failed` is fine. A read still running after 90 seconds (`ID_SCAN_READ_TIMEOUT_MS`) was cut off, e.g. by a server timeout, and counts as `failed` with a retake message, so it can't block the link until it expires. `complete(id, reading)` stores the checked result, or fails with a retake message when the model says the photo shows no readable ID. `fail(id, message)` records a failed model call.
4. `getForDesk(bookingId, id)` returns the result to the booking that opened the scan. Staff review and save it to the guest book; nothing is saved before that.

`checkReading(reading, today)` turns the model's reading into reviewable values: names printed in capitals are title-cased (`tidyName`), the nationality must be two letters, dates must be real `YYYY-MM-DD` days and a birth date in the past, the document number loses spaces and must be 3 to 30 characters. Anything malformed is dropped rather than guessed. An expired document, an impossible birth date and a document that is not an ID card or passport become warnings for staff.

An unknown, expired or already saved scan is `not_found`.

## Billing

`createBillingService` (`billing.ts`) keeps each booking's bill (folio). `buildFolio(booking, charges, payments, pricing)` builds it:

1. **Stay**: the booking's `priceSnapshot` lines, verbatim. A cancelled booking has no stay lines.
2. **City tax**: `cityTax.perPersonPerNight` × paying guests × nights, at the current rate. Every adult pays; children pay from `cityTax.minAge` (default 18, so children don't). No line when the rate is 0. It is billed on the folio, not in `quote()`.
3. **Extras**: charges staff or the agent posted, e.g. sauna or minibar.

`charged` is the sum of the lines, `paid` is payments minus refunds, and `balance = charged - paid` (negative: the guest is owed money).

**VAT.** Prices include VAT. Every line carries a `vatBracket` and its `vatRate` from the rates' `vat` (`standard` 21 %, `reduced` 12 %, the Czech rates since 2024). Stay lines take their bracket from `stayVatBrackets`: accommodation, child and long-stay discounts and extra beds are `reduced`; wellness and dogs `standard` (to be confirmed). City tax is `none`, outside VAT. Extras carry the bracket staff chose, `standard` by default. `vatSummary` gives one line per bracket with charges: `gross` (the bracket's total), `vat = round(gross × rate / (100 + rate))` and `net = gross − vat`, rounded once per bracket in whole CZK, half away from zero so a discount's VAT mirrors a charge's.

- `addCharge` / `updateCharge` / `removeCharge` need a `confirmed` or `checked_in` booking (`invalid_transition`): a hold isn't a sale yet, and a checked-out bill is closed. A charge is posted on the hotel's today. `updateCharge` changes the label, quantity, unit price or VAT bracket in place and recomputes the amount.
- `recordPayment` takes payments in any status except `cancelled`, where only refunds are possible. A refund can't exceed what was paid (`invalid_input`).
- `previewCharge` / `previewPayment` run the same checks without saving and return the balance after, for agent proposals.
- Audited on the booking as `folio.charge`, `folio.update_charge` (with the changed fields), `folio.remove_charge`, `folio.payment` and `folio.refund`.

## Reports

`buildReport({ from, to }, data)` (`reports.ts`) measures the nights `[from, to)`, at most 366. `createReportService` loads the data for it.

- **Sold** stays are `confirmed`, `checked_in` and `checked_out`; holds and cancellations don't count.
- **Room nights**: available = rooms × nights; sold = nights of sold stays inside the period. Occupancy = sold / available, as a fraction.
- **Revenue** comes from each booking's `priceSnapshot`, spread evenly over its nights in whole CZK so the nightly shares add up exactly (`nightlyShare`). A stay that crosses the period's edge counts only its nights inside. Room revenue is accommodation after child and long-stay discounts; add-on revenue is wellness, extra beds and dogs. Extras are the charges posted in the period. City tax is reported apart: it is collected for the town.
- **ADR** = room revenue / room nights sold; **RevPAR** = room revenue / room nights available. Both rounded to whole CZK.
- Guest nights, arrivals in the period and their average stay, and cancellations with a night in the period.
- Room nights and room revenue by booking source and by room type (with each type's occupancy), payments minus refunds by method on days in the period, departed guests (check-out inside the period) who still owe, and a daily series of rooms sold, occupancy and room revenue.
- `previousPeriod(query)` is the same length right before, for comparisons.

## Rates and rooms

`createRatesService` (`rates.ts`) keeps the rates (the `PricingConfig` that `quote()` reads), room types and rooms. Anyone may read them; every change needs an active manager (`forbidden`) and is audited with `by` in the payload.

- The rates include `cityTax` (`perPersonPerNight`, `minAge`), billed on the folio. Rates saved before it existed read it as 0.
- The rates include `vat` (`standard`, `reduced`, in percent); both 0 for a hotel that is not a VAT payer. Rates saved before it existed read the Czech rates, 21 and 12.
- Until rates are saved, `getPricing()` returns the defaults from `pricing/config.ts` (placeholders). The demo seed saves those defaults.
- `updatePricing(config, by)` replaces the rates. Season days must be real `MM-DD` days (29 February counts) and season names unique, child tiers must go up in age, and there is one long-stay tier per length (`invalid_input`). Audited as `settings.pricing` with the changed fields; a save that changes nothing writes nothing.
- `createRoomType` / `updateRoomType` set the name, capacity, base price and description (`room_type.create`, `room_type.update`; a price change logs the old and new base price).
- `createRoom` / `updateRoom` set the name, room type, kind and floor. Room names are unique, ignoring case (`conflict`), and the room type must exist (`not_found`). New rooms start `clean`; an edit keeps the housekeeping status (`room.create`, `room.update`).
- The hotel service reads the saved rates inside each operation's transaction. Existing bookings keep their `priceSnapshot`; only new quotes and re-pricing (date or party changes) use new rates.

## Staff

`createStaffService` (`staff.ts`) keeps the team. See [ADR 0009](decisions/0009-staff-roles-and-demo-sign-in.md).

- `identify(id)` returns the active staff member with that ID, or null. It is how a request is signed in.
- `create(input, by)` and `update(id, patch, by)` need `by` to be an active manager (`forbidden`). Emails are unique, ignoring case (`conflict`). No change may leave the team without an active manager (`invalid_input`). Members are deactivated, never deleted.
- Changes are audited as `staff.create` and `staff.update`, with the member as subject and `by` in the payload.

## Availability rules

`checkAvailability(query, { rooms, roomTypes, bookings, now })` returns rooms that can take the whole stay, cheapest room type first.

- Stays overlap only if they share a night. Checking in on another guest's check-out day is fine (same-day turnover).
- `confirmed` and `checked_in` bookings block a room. A `hold` blocks it until `holdExpiresAt`. `cancelled` and `checked_out` never block.
- `out_of_order` rooms are never offered.
- Capacity: adults ≤ `maxAdults`, and adults + children ≤ `maxAdults + maxChildren` (children may use adult beds). Extra beds raise both limits by one each.
- Optional filters: `kind`, `roomTypeId`, and `excludeBookingId` (to move or extend an existing booking).
- Invalid input throws `DomainError`: zero-night or reversed ranges, no adults, child ages outside 0–17.

## Pricing rules

`quote(input, pricing)` returns a line-item breakdown whose amounts sum to `total`. The rates are edited in Settings → Rates ([Rates and rooms](#rates-and-rooms)); the defaults in `packages/domain/src/pricing/config.ts` and the seeded base prices **are placeholders until replaced with real prices.**

1. **Accommodation** is per person per night: `basePrice × season multiplier`, rounded to whole CZK. One line per season the stay touches.
2. **Seasons** are `MM-DD` ranges, inclusive of both nights, and may wrap the new year (`12-20` → `03-15`). The first matching season wins; other nights use multiplier 1.
3. **Child discounts**: each child gets the first tier with `age ≤ maxAge`; the discount is a fraction of that night's adult rate (1 = free). Older children pay the adult rate.
4. **Long stay**: the tier with the highest `minNights` the stay reaches takes a fraction off accommodation, after child discounts. Add-ons are not discounted.
5. **Add-ons**: wellness (per eligible guest per night, from `wellness.minAge`), extra bed (per bed per night), dog (per dog per night).
6. Parties that don't fit the room type (counting extra beds) throw `over_capacity`.

## Conventions

- Stays are half-open date ranges `[checkIn, checkOut)`. Dates are stored as `YYYY-MM-DD`.
- Hotel timezone is `Europe/Prague`. `hotelToday(now)` gives the hotel's calendar date.
- Money is integer whole CZK. No floats.
- Domain functions take `now` as an argument instead of reading the clock.
- I/O goes through repository interfaces (`packages/domain/src/repositories.ts`) implemented in `packages/db`.
