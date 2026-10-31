# 25. Repair emails go through the hotel's mailbox

## Context

Contacts and repairs ([ADR 0020](0020-contacts-and-repairs-by-trade.md)) came before the mailbox ([ADR 0021](0021-a-mail-client-without-mail-delivery.md)). The drafted email to a contractor opened in the staff member's own mail app, so Orbit kept no copy: after emailing the electrician about a flickering light, opening the same repair showed who was asked but not what was said, and the electrician's answer, wherever it arrived, had no link back to the repair. Everything else the hotel writes (replies, forwards, notes before a stay) is already in the mailbox.

## Decision

- The email to a contractor is sent from the mailbox, like any other: a new conversation with the contact, linked to the repair by `Inquiry.taskId` (migration 0026; a plain ID, like task IDs in the audit log, since tasks can be cleared).
- Sending records the contact as asked and starts the task in the same transaction, as a call does.
- The repair lists its conversations with their latest message; a conversation about a repair shows "Open repair" instead of the booking actions, can't be declined, and isn't read as a booking request. Today's repair row says whether the contractor answered, and opens the repair.
- The agent drafts the same email (`draftRepairEmail`, through the drafter the repair card uses) and proposes sending it (`sendRepairEmail`, confirmed like any outgoing email).

## Consequences

- Nothing reaches a real contractor yet, the same as for guests: real delivery would plug in at the mailbox's `send`, and repair emails would go with it.
- The staff member's own mail app is no longer involved: no `mailto:` links, and the conversation history stays in one place for the whole team.
