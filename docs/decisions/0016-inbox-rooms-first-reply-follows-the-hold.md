# 16. Inbox: rooms first, the reply follows the hold

## Context

"Draft reply" read the request, found the rooms and wrote a reply offering all of them in one step. Staff saw the rooms only after a draft existed, and holding one made that draft wrong: they had to remember to redraft so the reply told the guest the room was held.

## Decision

- The inbox pipeline has two steps. `read` extracts the request and finds its rooms (one model call); `draft` writes the reply from the stored reading and the room held now (one model call). `process` still runs both.
- "Prepare reply" reads, shows the rooms at once, then drafts. Holding a room drafts again, so the reply says the room is held until the hold ends.
- A hold never overwrites what staff wrote: if they edited the reply, the reply box says the reply doesn't mention the held room yet and offers to rewrite it.
- The reading counts until the guest writes again; drafting again reuses it and only looks up the rooms anew.

## Consequences

- Holding a room costs one more draft (about $0.002), triggered by the staff member's own click, in line with [ADR 0012](0012-inbox-conversations-and-ai-on-request.md): nothing runs on opening a conversation.
- A redraft no longer reads the request again, so it is cheaper than before.
