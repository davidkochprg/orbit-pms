/** A link from one Knowledge note to another, written in its text as `[[Parking]]`. */
const linkPattern = /\[\[([^[\]\n]{1,80})\]\]/g;

/** Note titles are unique ignoring case and surrounding spaces. */
export const sameNoteTitle = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/** A note's text as plain runs and links, in order, for showing it. */
export type NoteRun = { text: string } | { link: string };

export function noteRuns(text: string): NoteRun[] {
  const runs: NoteRun[] = [];
  let at = 0;
  for (const match of text.matchAll(linkPattern)) {
    if (match.index > at) runs.push({ text: text.slice(at, match.index) });
    runs.push({ link: match[1]!.trim() });
    at = match.index + match[0].length;
  }
  if (at < text.length) runs.push({ text: text.slice(at) });
  return runs;
}

/** The titles a note links to, without repeats. */
export function noteLinks(text: string): string[] {
  const titles: string[] = [];
  for (const run of noteRuns(text)) {
    if ('link' in run && !titles.some((t) => sameNoteTitle(t, run.link))) titles.push(run.link);
  }
  return titles;
}

/** The text with links as plain words, as guests and the model read it. */
export function withoutLinks(text: string): string {
  return text.replace(linkPattern, (_, title: string) => title.trim());
}

/** The notes whose text links to the note called `title`. */
export function backlinks<T extends { title: string; details: string }>(
  notes: T[],
  title: string,
): T[] {
  return notes.filter(
    (n) =>
      !sameNoteTitle(n.title, title) && noteLinks(n.details).some((t) => sameNoteTitle(t, title)),
  );
}

/** The text with links to the note called `from` pointing at its new title `to`. */
export function renameLinks(text: string, from: string, to: string): string {
  return text.replace(linkPattern, (whole, title: string) =>
    sameNoteTitle(title, from) ? `[[${to.trim()}]]` : whole,
  );
}

/** The text with links kept only where `keep` says the title exists; others become plain words. */
export function keepLinks(text: string, keep: (title: string) => boolean): string {
  return text.replace(linkPattern, (whole, title: string) => (keep(title) ? whole : title.trim()));
}
