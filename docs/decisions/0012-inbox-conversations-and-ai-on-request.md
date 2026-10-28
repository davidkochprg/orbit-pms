# 12. Inbox conversations and AI on request

## Context

The inbox held one message per inquiry, with the reply as a text field, so a guest writing back started over and the history was lost. Opening a message ran the whole pipeline (extraction, room options, a draft), spending tokens on spam, thank-you notes and messages staff only wanted to read. Drafts were only in the guest's language, which a receptionist may not read.

## Decision

- An inquiry is a conversation: its messages are rows in `inbox_messages`, from the guest (`in`) or the hotel (`out`, signed by the staff member). A guest's new message brings the conversation back to the inbox, unread and needing a reply, and drops a prepared draft that no longer answers it. Conversations can be marked unread and archived; the web app lists them as a mailbox with folders, channel filters and search.
- Sending records the message in the conversation's channel. Orbit has no mail or OTA transport yet; a transport would deliver outgoing messages and add incoming ones through the same domain functions (`send`, `receive`, `create`).
- Nothing calls a model when a conversation is opened. Staff ask for a prepared reply ("Prepare a reply") or a translation, and each result is stored, so asking again costs nothing.
- Each staff member has a language. A prepared draft comes with its translation into that language, shown side by side with the guest-language text; staff can edit either side and translate it into the other, and only the guest's side is sent. A guest's message is translated into the reader's language on request and kept with the message.
- Translation runs on `META_MODEL_TRANSLATE` (the agent model when unset) at minimal reasoning. A translation that changes an amount is redone once and otherwise refused, like the draft price guard.

## Consequences

- Opening the inbox is free; spend follows what staff choose to do with a message. The daily brief still counts unanswered messages without any model call.
- Meta offers no cheaper Standard-tier text model than Muse Spark today, so translations cost Spark's rate (about $0.002 each); the separate setting lets a cheaper model take over later.
- A free, local guess of the guest's language (from common words) sets the side-by-side view before anything is prepared; the agent's reading replaces it once a reply is prepared.
- Migrations `0016_inbox_conversations` and `0017_drop_inquiry_text` turn each inquiry's text and sent reply into messages.
