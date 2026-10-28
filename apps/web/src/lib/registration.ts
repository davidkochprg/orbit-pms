import type { DocumentType, GuestBook, RegistrationField } from '@orbit/shared';

/** Suggestions for the nationality field; any two-letter code is accepted. */
export const countryOptions: { code: string; name: string }[] = [
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
  { code: 'US', name: 'United States' },
];

/** The hotel is in Czechia: guests from abroad also give a home address. */
export function needsAddress(nationality: string): boolean {
  const code = nationality.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) && code !== 'CZ';
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

/** "3 of 4 in the guest book" or "All 2 in the guest book". */
export function guestBookProgress(book: Pick<GuestBook, 'partySize' | 'missing'>): string {
  const done = book.partySize - book.missing;
  return book.missing === 0
    ? `All ${book.partySize} in the guest book`
    : `${done} of ${book.partySize} in the guest book`;
}
