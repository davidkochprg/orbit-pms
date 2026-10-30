import {
  type HotelInfoCategory,
  hotelInfoCategories,
  type HotelInfoDraft,
  type HotelInfoEntry,
  type NoteRun,
  noteRuns,
  sameNoteTitle,
  withoutLinks,
} from '@orbit/shared';
import {
  BedDouble,
  CarFront,
  ConciergeBell,
  Coffee,
  type LucideIcon,
  Mountain,
  ScrollText,
  Waves,
} from 'lucide-react';

export const folderIcons: Record<HotelInfoCategory, LucideIcon> = {
  policies: ScrollText,
  rooms: BedDouble,
  food: Coffee,
  wellness: Waves,
  activities: Mountain,
  getting_here: CarFront,
  services: ConciergeBell,
};

/** Where a note opens in Knowledge. */
export const noteHref = (id: string) => `/knowledge?note=${encodeURIComponent(id)}`;
export const tagHref = (tag: string) => `/knowledge?tag=${encodeURIComponent(tag)}`;

/** A saved note as the editor starts from it. */
export const noteDraft = (note: HotelInfoEntry): HotelInfoDraft => ({
  category: note.category,
  title: note.title,
  details: note.details,
  tags: note.tags ?? [],
  until: note.until ?? null,
});

/** A paragraph of a note, or a list from its "- " lines. */
export type NoteBlock = { kind: 'text'; runs: NoteRun[] } | { kind: 'list'; items: NoteRun[][] };

/** A note's text as paragraphs and lists, with links, as Knowledge shows it. */
export function noteBlocks(details: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  for (const raw of details.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const item = /^[-*•]\s+(.*)$/.exec(line)?.[1];
    const last = blocks.at(-1);
    if (item === undefined) blocks.push({ kind: 'text', runs: noteRuns(line) });
    else if (last?.kind === 'list') last.items.push(noteRuns(item));
    else blocks.push({ kind: 'list', items: [noteRuns(item)] });
  }
  return blocks;
}

/** The note a link names, if there is one. */
export function findNote(notes: HotelInfoEntry[], title: string): HotelInfoEntry | undefined {
  return notes.find((n) => sameNoteTitle(n.title, title));
}

/** Whether a note matches a search: its title, text or tags. */
export function matchesNote(note: HotelInfoEntry, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/^#/, '');
  if (!q) return true;
  return [note.title, withoutLinks(note.details), ...(note.tags ?? [])].some((s) =>
    s.toLowerCase().includes(q),
  );
}

export interface VaultFolder {
  folder: HotelInfoCategory;
  notes: HotelInfoEntry[];
}

/** The folders that hold a note, in their fixed order, each sorted by title. */
export function vaultFolders(notes: HotelInfoEntry[]): VaultFolder[] {
  return hotelInfoCategories
    .map((folder) => ({
      folder,
      notes: notes
        .filter((n) => n.category === folder)
        .sort((a, b) => a.title.localeCompare(b.title)),
    }))
    .filter((f) => f.notes.length > 0);
}

/** Notices still in effect, ending soonest first. */
export function activeNotices(notes: HotelInfoEntry[], today: string): HotelInfoEntry[] {
  return notes
    .filter((n) => n.until && n.until >= today)
    .sort((a, b) => (a.until ?? '').localeCompare(b.until ?? ''));
}

/** Every tag in the vault with how many notes carry it, most used first. */
export function tagCounts(notes: HotelInfoEntry[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const tag of notes.flatMap((n) => n.tags ?? [])) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Tags as typed in the editor, e.g. "pets, #dogs". */
export function parseTags(text: string): string[] {
  return text
    .split(',')
    .map((t) => t.trim().replace(/^#/, ''))
    .filter(Boolean);
}
