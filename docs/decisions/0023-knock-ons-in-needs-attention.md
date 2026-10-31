# 23. Knock-ons live in Today's "Needs attention", not in a corner card

## Context

Knock-ons were shown as cards floating in the corner of every page ([ADR 0018](0018-knock-ons-worked-out-on-read.md)). They looked like toasts but behaved like nothing else in the app: they didn't go away by themselves, covered content (lists on Rates, the inbox's reply box, so they were hidden there), and in the demo nearly always showed one repair. Toasts in Orbit mean "this just happened", with Undo. Today already had a list of what needs attention, with rows for out-of-order rooms and repairs, the same things knock-ons are about.

## Decision

- No corner cards. A knock-on joins the "Needs attention" row it is about and makes the row the fix: an out-of-order room with stays to move opens a dialog listing them with their new rooms and one Move button; a repair nobody was asked about names the contractor, with a call button, and opens its contacts on the email. A room free again for a request has no row of its own in the brief, so it gets one that looks for rooms again and opens the conversation.
- The sidebar shows how many knock-ons there are on Today, so they are visible from any page without covering it.
- Where the change is made, the fix is offered in place: marking a room out of order on the housekeeping board opens the stays to move as soon as the knock-ons are worked out again.
- No "Not now": a row goes when the situation is dealt with, like every other row in the list.

## Consequences

- One place for what needs doing, and toasts keep one meaning.
- A knock-on caused on another page is noticed through the sidebar count, not in the middle of the screen.
- The command bar's brief lists the same rows without the fixes.
