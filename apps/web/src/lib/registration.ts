import type { DocumentType, GuestBook, RegistrationField } from '@orbit/shared';

/** Suggestions for the nationality field; any two-letter code is accepted. */
export const countryOptions: { code: string; name: string }[] = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'MX', name: 'Mexico' },
  { code: 'CZ', name: 'Czechia' },
  { code: 'SK', name: 'Slovakia' },
  { code: 'DE', name: 'Germany' },
  { code: 'PL', name: 'Poland' },
  { code: 'AT', name: 'Austria' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'DK', name: 'Denmark' },
  { code: 'HU', name: 'Hungary' },
  { code: 'UA', name: 'Ukraine' },
  { code: 'FR', name: 'France' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },
  { code: 'JP', name: 'Japan' },
  { code: 'AU', name: 'Australia' },
];

/**
 * Whether a guest of this nationality gives a home address: guests from abroad do, except in the
 * US, where the guest book doesn't record it (the domain's guest-book rules decide; this is the
 * hint while typing).
 */
export function needsAddress(nationality: string, hotelCountry: string): boolean {
  const code = nationality.trim().toUpperCase();
  return hotelCountry !== 'US' && /^[A-Z]{2}$/.test(code) && code !== hotelCountry;
}

export const registrationFieldLabels: Record<RegistrationField, string> = {
  nationality: 'nationality',
  dateOfBirth: 'date of birth',
  documentType: 'document type',
  documentNumber: 'document number',
  address: 'home address',
};

/** "Needs date of birth and document number" for a guest-book entry; null when complete. */
export function missingSummary(missing: RegistrationField[]): string | null {
  if (missing.length === 0) return null;
  // Document type and number are asked for together; naming both is noise.
  const names = missing
    .filter((f) => !(f === 'documentType' && missing.includes('documentNumber')))
    .map((f) => (f === 'documentNumber' ? 'ID document' : registrationFieldLabels[f]));
  const list =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return `Needs ${list}`;
}

export function countryName(code: string | null): string | null {
  if (!code) return null;
  return countryOptions.find((c) => c.code === code)?.name ?? code;
}

export const documentTypeLabels: Record<DocumentType, string> = {
  id_card: 'ID card',
  passport: 'Passport',
};

/**
 * How many people nobody has added yet the guest book still needs: all of them where the region
 * records everyone, none where only the guest who booked shows an ID. The domain counts them in
 * `missing` only in the first case.
 */
export function unaddedStillNeeded(
  book: Pick<GuestBook, 'guests' | 'partySize' | 'missing'>,
): number {
  const incomplete = book.guests.filter((g) => g.missing.length > 0).length;
  return Math.min(
    Math.max(0, book.missing - incomplete),
    Math.max(0, book.partySize - book.guests.length),
  );
}

/**
 * "3 of 4 in the guest book", "All 2 in the guest book" or "3 listed for a party of 2". Where only
 * the guest who booked shows an ID and not everyone is listed, a count of the party would be
 * wrong, so it says what is left to record: "Guest book complete" or "1 person still to record".
 */
export function guestBookProgress(
  book: Pick<GuestBook, 'guests' | 'partySize' | 'missing' | 'extra'>,
): string {
  if (book.extra > 0)
    return `${book.partySize + book.extra} listed for a party of ${book.partySize}`;
  if (book.guests.length < book.partySize && unaddedStillNeeded(book) === 0) {
    if (book.missing === 0) return 'Guest book complete';
    return `${book.missing} ${book.missing === 1 ? 'person' : 'people'} still to record`;
  }
  const done = book.partySize - book.missing;
  return book.missing === 0
    ? `All ${book.partySize} in the guest book`
    : `${done} of ${book.partySize} in the guest book`;
}
