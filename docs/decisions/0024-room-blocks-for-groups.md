# 24. Groups get a block of rooms, priced room by room

## Context

The inbox offered rooms only for a party that fits one room. A team of nine asking for eight rooms got "no room is free for this party" on a half-empty lodge, and the draft told them so. Groups (offsites, weddings, families travelling together) are a large share of a small hotel's email, and the most work to answer by hand: which rooms, who sleeps where, what it costs in total.

## Decision

- The extraction reads how many rooms the guest asks for (`rooms`, null when they don't say).
- When it is more than one, or the party fits no one free room, the domain plans a block: the party spread evenly with an adult in every room, each share in the cheapest free room that fits it, the fewest rooms when no number is given. Each room is quoted for its share with the normal pricing rules; the block's total and the subtotal per room type are sums of those quotes. The model never splits a party or adds up amounts.
- The draft states the total and the subtotals; the price guard requires the total and allows only quoted amounts and those sums. No group discount is offered: there is no group pricing rule, and the model may not invent one.
- "Hold all" holds every room in one transaction for one guest, with the note "Block of N rooms". The conversation keeps all the holds (`blockBookingIds`, migration 0024) and the first in `bookingId`, so the rest of the inbox treats it like a held request. The agent proposes the same through `holdFromConversation` without a room.

## Consequences

- The seeded team offsite now gets eight priced rooms and a reply, which the rate review's "block of rooms" signal already assumed.
- A block is held and then handled as separate bookings: confirming or cancelling is per booking (or several at once through the agent). There is no group master record, group rate or rooming list yet.
- Only a whole block can be held; to change one room, staff move that booking afterwards.
