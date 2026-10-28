# 10. Guest book per person and phone ID scans

## Context

The guest book held one entry per stay, for the main guest, and check-in waited for it. In practice a room holds several people, and guests arrive late or without their documents at hand, so reception checks them in and records the IDs later. Typing ID details is slow and error-prone; Muse Spark reads images, and every receptionist has a phone.

## Decision

- The guest book has one entry per person in the room (`stay_guests`). The main guest's entry has the fixed ID `sg_<bookingId>` and is linked to their profile; companions are named entries. ID fields are nullable and the domain computes what each entry still needs.
- Check-in no longer waits for the guest book. Missing entries are counted on the booking (`missingIds`), flagged in the inspector and mentioned in the agent's check-in proposal, and can be completed at any time before the booking is cancelled.
- IDs are scanned with a phone: the desk opens a short-lived scan (an unguessable 144-bit token, 15 minutes) and shows its link as a QR code; the phone page needs no sign-in, uploads one photo and never sees what was read. The API has the vision model read the photo in memory; the domain checks the values; staff review them on the desk and save. The photo is never stored, and a scan's result is deleted once saved or expired. Scans live in the database, so they work across serverless instances.

## Consequences

- Rooms can be checked in at any hour; the guest book can be incomplete for a while, which the hotel must catch up on before reporting foreign guests.
- The model never writes to the guest book, consistent with ADR 0004; a scan only fills a form.
- Anyone holding a scan link can upload a photo for that one person during 15 minutes, but can't read anything back. Results with personal data sit in the database only until they are saved or expire.
- Existing registrations were migrated to main-guest entries (`0013_stay_guests`); the old `registrations` table is dropped.
