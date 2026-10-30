# 21. A full mail client, without mail delivery

## Context

The inbox handled guest requests well but was not a mail client: nothing showed what the hotel had sent, a reply left half-written was lost, and there were no stars, labels, trash, copies, forwards or attachments. Staff live in their mailbox, so Orbit's has to work like Gmail. Real delivery (an email API with an inbound webhook, or IMAP and SMTP to the hotel's mailbox) needs a domain, DNS, credentials and a public URL, which judges running the repo locally won't have.

## Decision

- Orbit is a full mail client over its own stored conversations: Inbox, Starred, Needs a reply, Sent, Drafts, Archive and Trash; labels; stars; bulk changes; reply, reply all and forward; To, Cc and Bcc with addresses suggested from guests, contacts and past mail; attachments up to 4 MB; Gmail's keyboard shortcuts. Sending still records the message, as in [ADR 0012](0012-inbox-conversations-and-ai-on-request.md); a transport can plug in later through `compose`, `send` and `receive`.
- Folders are views worked out from each conversation (`inMailFolder`), not stored places: a conversation has `archivedAt`, `trashedAt`, `starred` and `labelIds`. The trash hides a conversation from every other folder; deleting for good only works from there.
- Drafts are saved as staff type, under an ID the browser makes, so saving needs no round trip and a reload opens the same draft. Orbit's own prepared reply isn't a draft until staff change it.
- A forward starts a new conversation with the person it goes to, quoting the whole thread and carrying its files, since Orbit's conversations are each with one guest or supplier.
- Files are stored in Postgres (`mail_attachments`), referenced by ID from messages and drafts, and served sandboxed; only PDFs and common images open in place.
- The agent can list any folder or label and file conversations (archive, trash, star, label, read) directly, like housekeeping changes ([ADR 0006](0006-agent-autonomy-and-cost-budget.md)): all of it is reversible from the trash or the same action.

## Consequences

- The demo works anywhere with no mail setup, and every mailbox feature is real in the app; nothing reaches a guest's real inbox.
- Files in the database are fine for a small hotel; a busy one would move the bytes to object storage behind the same repository.
- Migration `0022_mailbox` adds the columns and three tables; it must run on Neon before deploying.
