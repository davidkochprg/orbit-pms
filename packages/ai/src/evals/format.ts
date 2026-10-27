import type { IsoDate, Language } from '@orbit/shared';

const months: Record<Language, string[]> = {
  cs: [
    'ledna',
    'února',
    'března',
    'dubna',
    'května',
    'června',
    'července',
    'srpna',
    'září',
    'října',
    'listopadu',
    'prosince',
  ],
  de: [
    'Januar',
    'Februar',
    'März',
    'April',
    'Mai',
    'Juni',
    'Juli',
    'August',
    'September',
    'Oktober',
    'November',
    'Dezember',
  ],
  en: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
  pl: [
    'stycznia',
    'lutego',
    'marca',
    'kwietnia',
    'maja',
    'czerwca',
    'lipca',
    'sierpnia',
    'września',
    'października',
    'listopada',
    'grudnia',
  ],
};

/** A date the way a guest would write it in their language, without the year. */
export function spokenDate(date: IsoDate, language: Language): string {
  const day = Number(date.slice(8, 10));
  const month = months[language][Number(date.slice(5, 7)) - 1] ?? '';
  return language === 'en' ? `${month} ${day}` : `${day}. ${month}`;
}

/** Numeric `d.m.` form common in Czech, German and Polish mail. */
export function numericDate(date: IsoDate): string {
  return `${Number(date.slice(8, 10))}.${Number(date.slice(5, 7))}.`;
}
