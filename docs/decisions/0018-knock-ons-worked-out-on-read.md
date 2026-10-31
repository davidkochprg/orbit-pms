# 18. Knock-ons worked out from current data, on read

## Context

A change in one place often makes work somewhere else: a room taken out of service still has guests booked into it, a cancellation frees nights a guest asked for last week. Staff had to notice these themselves. The fix should appear right after the change, whichever screen made it (the housekeeping board, a voice note, the agent, the tape chart), and for whoever is signed in.

## Decision

- The domain works out knock-ons from current data each time they are asked for (`createKnockOnService`, `GET /api/knock-ons`); nothing is stored. Two kinds: stays in an out-of-order room in house or arriving within 7 days, each with a free room to move to (same type first, a ready room for today, the guest keeps their price); and requests read when nothing was free that a room is free for now.
- The web app refetches the list after every change and shows each knock-on as a small card in the corner of any page, with its fix one click away: move the stays, or look for rooms again and open the conversation. Hiding one is remembered in the browser by its ID, which changes when the situation does. (Superseded by [ADR 0023](0023-knock-ons-in-needs-attention.md): knock-ons now live in Today's "Needs attention" list.)
- Fixes are ordinary domain operations staff click (`moveBooking`, `refreshOptions`), checked as any move or search is. The agent hears about stays to move in `setRoomStatus`'s result and proposes `moveBooking` for each, which staff confirm.
- No model is involved in finding or fixing a knock-on.

## Consequences

- Correct after any change, from any source, with no events, queues or migration; a knock-on disappears once it is dealt with.
- Each list call reads rooms, bookings and waiting requests, and runs a room search per request read without rooms. Fine for a small hotel; a large one would cache or narrow it.
- Stays further out are left in the broken room, in case it is repaired by then; the out-of-order room has no end date to plan with.
