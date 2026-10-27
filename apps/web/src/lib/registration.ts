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
