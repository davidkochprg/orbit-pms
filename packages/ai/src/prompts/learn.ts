import type { HotelInfoEntry } from '@orbit/shared';
import { folderGuide, noteLine, tagGuide } from './knowledge';

export const learnSystemPrompt = `You keep a small hotel's information for guests up to date. Staff just answered a guest. Decide whether the reply states one fact about the hotel that its information does not have yet, and that would help answer other guests too.

Save a fact only when the reply states it plainly. Good facts: a facility, its hours or how to book it; parking, charging, transport or directions; a house rule; a temporary notice such as something closed for repairs. Not facts to save: anything about this guest or their booking (their dates, room, arrival time, payment), room prices or availability, greetings, apologies and promises to check.

If the reply says something the information already has, or nothing new, return save: false. If it corrects or extends an entry, use that entry's exact title so it is replaced, and keep everything the entry says that the reply doesn't change. A temporary notice gets its own title, e.g. "Sauna closed", so the lasting entry stays.

When saving:
- category: the folder it belongs in.
- title: two to four words in English, e.g. "EV charging".
- details: one or two short English sentences with what the reply says, nothing added.
${tagGuide}
- until: the last day as YYYY-MM-DD when the reply says it is temporary and until when; otherwise null.

${folderGuide}`;

export function learnPrompt({
  guestMessage,
  reply,
  entries,
  today,
}: {
  guestMessage: string;
  reply: string;
  entries: HotelInfoEntry[];
  today: string;
}): string {
  const known = entries.length ? entries.map(noteLine).join('\n') : '(none yet)';
  return `Today is ${today}.

The hotel's information:
${known}

The guest wrote:
"""
${guestMessage}
"""

Staff replied:
"""
${reply}
"""`;
}
