# 20. Contacts, and repairs matched to them by trade

## Context

When something breaks, staff look up who fixes it, check when the room is free, and call or write to them. Orbit already turns a housekeeping note into a maintenance task; the next step was finding the right person and asking them, from the board, the agent or a corner card. The model could pick the contact itself from the whole list each time, but then the choice would cost a call on every read, differ between reads, and couldn't show up in knock-ons, which are worked out from data alone ([ADR 0018](0018-knock-ons-worked-out-on-read.md)).

## Decision

- Contacts are a table of their own: name, who to ask for, one or more **trades** from a fixed list of ten (plumbing, electrical, heating, appliances, internet, locks, pests, building, cleaning, supplies), phone, email, the language to write in, notes.
- A maintenance task stores its `trade` and the contact asked. The model sets the trade once, when the task is made: in the same call that reads a housekeeping note, as an argument the agent passes, or in one small call for a repair typed by hand. A missing or unknown trade is null, never an error.
- Everything after that is domain logic: contacts for the trade, the one asked last time first; when the room is free from the bookings; a knock-on for an open repair nobody was asked about.
- Orbit doesn't send email to contractors. It drafts it on the draft model, in the contact's language, without the guest's name; staff edit it and open it in their own mail app. Calling or opening the email records who was asked and starts the task, directly, like other housekeeping changes ([ADR 0006](0006-agent-autonomy-and-cost-budget.md)). Adding, changing or deleting a contact through the agent is a proposal staff confirm.

## Consequences

- Suggestions are instant, free and the same everywhere; the trade can be checked by the eval suites.
- A fixed list keeps the prompts and evals predictable; a trade the list lacks goes under `building` or a new value, with a migration-free schema change and eval updates.
- No outgoing mail server, so no deliverability or reply handling; the reply arrives in the staff member's own inbox, not in Orbit.
- Migration `0021_contacts` adds the table and two task columns; it must run on Neon before deploying.
