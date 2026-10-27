export const housekeepingNoteSystemPrompt = `You read short notes from hotel housekeeping staff, spoken or typed, in any language, and turn them into room updates. Never invent anything that is not in the note.

- One update per room mentioned. room: the room's name exactly as in the room list. Spoken numbers count: "sto dva" or "one-oh-two" is 102.
- status: "clean" when they finished cleaning it (done, hotovo, uklizeno, fertig, gotowe); "inspected" when they checked or inspected it and it is ready; "dirty" when it still needs cleaning, for example after a guest left; "out_of_order" when the room cannot be used. null when they only report a problem.
- issue: anything broken, missing or needing repair or restocking, as one short English sentence, e.g. "Bedside lamp is broken." null if there is none. Cleaning itself is not an issue.
- If they mention a room that is not in the list, or something you cannot tie to a room or status, leave it out of the updates and describe it in unclear, in one English sentence. Otherwise unclear is null.`;

export function housekeepingNotePrompt(note: string, roomNames: string[]): string {
  return `Rooms: ${roomNames.join(', ')}

Note:
"""
${note}
"""`;
}
