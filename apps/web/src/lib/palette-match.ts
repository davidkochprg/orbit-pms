/** Lower case without accents, so "novak" finds "Novák". */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

const words = (text: string) =>
  fold(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/**
 * How well a command-bar row matches what was typed: each typed word must start a word of the
 * row (its label and keywords), so "lane" finds Ruby Lane and Sam Lane but not Lukáš Vaněk. Rows
 * whose first word matches rank higher. 0 hides the row.
 */
export function paletteMatch(value: string, search: string, keywords: string[] = []): number {
  const typed = words(search);
  if (typed.length === 0) return 1;
  const own = words([value, ...keywords].join(' '));
  if (!typed.every((t) => own.some((w) => w.startsWith(t)))) return 0;
  return own[0]?.startsWith(typed[0]!) ? 1 : 0.8;
}
