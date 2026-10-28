# 11. Structured agent answers

## Context

The agent answered in plain text: lists of bookings as lines like "Adam Procházka, room 104, 28.10. - 31.10.", prices and bills copied out line by line, and every tool step listed with the model's running commentary. Nothing in an answer could be opened or acted on, prices were only as exact as the model's copy, and a multi-step question filled the thread with steps.

## Decision

- The agent mentions bookings, rooms and guests by ID in double brackets (`[[bk_147]]`, `[[rm_104]]`, `[[gst_12]]`), as the system prompt asks. The web app renders each as a chip, and a list item that leads with a booking as a row with the guest, room, dates and status. Chips and rows open the booking (closing the command bar) and carry the booking's right-click menu.
- What a chip shows comes from the agent's own tool outputs in the conversation (`collectEntities`), so no extra requests are needed; a booking mentioned without that data is fetched.
- Quotes and bills the agent fetched are shown as cards built from the tool output, and the agent states only the total or balance. The amounts on screen are exactly what the domain computed.
- Each answer's steps fold into one line ("Checked availability and calculated the price") that opens into a timeline with a short result per step and the raw data one more click away. While the agent works, a thinking orb and the current step replace the steps, and a beam runs round the command bar.

## Consequences

- The prompt and the UI share a small contract: the token syntax and the "- [[bk_…]] detail" list form. The agent eval checks that answers use tokens and no bare IDs.
- Answers are shorter, since the chips, rows and cards carry the names, dates and amounts.
- An ID the model invents shows as an unknown chip instead of a name, which makes the mistake visible.
