/** Lowercase without accents, so "novak" finds "Novák" and "Kowalczyk" finds "kowalczyk". */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replaceAll('ł', 'l')
    .replaceAll('Ł', 'L')
    .toLowerCase()
    .trim();
}

export function containsText(haystack: string, needle: string): boolean {
  return normalizeText(haystack).includes(normalizeText(needle));
}
