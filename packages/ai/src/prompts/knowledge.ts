import type { HotelInfoEntry } from '@orbit/shared';

/** The folders of Knowledge as the model chooses between them, shared by every prompt that files. */
export const folderGuide = `Folders (pick exactly one):
- policies: house rules and terms: cancellation, payment, deposits, pets, children, quiet hours, smoking.
- rooms: rooms and apartments, beds, cots, what is in the room, check-in and check-out times, late check-out, housekeeping.
- food: breakfast, restaurant, bar, room service, dietary needs.
- wellness: sauna, spa, hot tub, pool, gym, massages.
- activities: hiking, skiing, biking, sights, tours, rentals, things to do nearby.
- getting_here: directions, parking, EV charging, trains, buses, shuttles, taxis, arriving after hours.
- services: front desk, Wi-Fi, laundry, luggage, storage, anything else.`;

export const tagGuide = `- tags: two to four short lowercase words for what the note is about, e.g. "pets", "late arrival". Reuse tags the hotel already uses when they fit.`;

export const fileNoteSystemPrompt = `You keep the notes a small hotel's staff and its assistant use to answer guests, like a tidy wiki. A staff member describes something in their own words. Turn it into one note.

${folderGuide}

If an existing note already covers the same thing, fold the description into it: set update to that note's exact title, keep everything the note says that the description doesn't change, and change or add only what is new. Otherwise update is null and the note is new, with a title no existing note has. A temporary notice (something closed or changed until a date) is its own note, e.g. "Sauna closed", never folded into a lasting note.

- folder: one of the folders above.
- title: two to four words, the heading a guest's question would be found under, e.g. "EV charging".
- details: the note in short, clear English sentences, whatever language the staff member wrote in. Only what they said or the note already says: never invent hours, prices or rules. Use "- " lines for a list of several items. Where the note mentions something another note covers, link it once by writing that note's exact title in double brackets, e.g. "Dogs may not enter the [[Spa]]." Only link titles from the list, never the note itself.
${tagGuide}
- until: the last day as YYYY-MM-DD when it is temporary and the description says until when; otherwise null.`;

/** One existing note as the model sees it, with its folder and tags. */
export function noteLine(note: Pick<HotelInfoEntry, 'title' | 'category' | 'details' | 'tags'>) {
  const tags = note.tags?.length ? `; ${note.tags.map((t) => `#${t}`).join(' ')}` : '';
  return `- ${note.title} (${note.category}${tags}): ${note.details}`;
}

export function fileNotePrompt({
  text,
  notes,
  today,
}: {
  text: string;
  notes: HotelInfoEntry[];
  today: string;
}): string {
  const tags = [...new Set(notes.flatMap((n) => n.tags ?? []))];
  return `Today is ${today}.

The hotel's notes:
${notes.length ? notes.map(noteLine).join('\n') : '(none yet)'}

Tags in use: ${tags.length ? tags.join(', ') : '(none yet)'}

The staff member wrote:
"""
${text}
"""`;
}
