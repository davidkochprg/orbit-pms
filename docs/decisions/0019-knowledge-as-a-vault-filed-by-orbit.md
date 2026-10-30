# 19. Knowledge as a vault of notes, filed by Orbit

## Context

Knowledge was a flat list of entries, each a policy, an amenity or guest info, chosen by staff in a dialog. The three kinds didn't say much (most facts were "amenity" or "info"), staff had to pick one for every entry, and nothing connected related facts such as dogs and the spa. Staff should be able to say what they know in their own words, and find it again as easily as the agent does.

## Decision

- Each entry is a note: a title, a text of up to 1000 characters with `- ` lists and `[[Title]]` links to other notes, up to six tags, and an optional end date. The web app shows them as a vault: a tree of folders, notices and tags, the open note with the notes that link to it, and editing in place.
- Notes are filed in a fixed set of seven folders (Policies, Rooms & stays, Food & drink, Wellness, Things to do, Getting here, Services), not folders staff or the model invent. Tags are free.
- Staff add a note by describing it. One model call titles, files, tags and links it, or folds it into the note that already covers it; `toFiledNote` checks the result, and staff see it before saving. Writing a note by hand stays possible.
- Renaming a note rewrites links to it. The agent's prompt lists notes folder by folder with links as plain words.
- Entries stored with the old categories read as folders (`policy` → Policies, `amenity` and `info` → Services); no migration.

## Consequences

- The folder list is part of the prompts (`folderGuide`), the agent's tool description and the evals, so the agent's view of the hotel and the filing stay predictable. Adding a folder means changing all of them.
- Old Services notes may belong elsewhere; staff move them by editing, or the next description folds into them.
- Links are by title, so a deleted note leaves plain-looking dangling links (shown muted).
- Filing costs one model call per new note, on staff request only.
