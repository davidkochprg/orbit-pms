import type { Language } from '@orbit/shared';
import { sameAmounts } from '../translate';

export interface TranslationFixture {
  id: string;
  text: string;
  to: Language;
  /** Problems with the translation; empty when it is right. */
  check: (translation: string) => string[];
}

/** Problems unless the translation has every amount, a word showing its language, and no preamble. */
function expect(source: string, words: RegExp, keep: string[] = []) {
  return (t: string) => [
    ...(sameAmounts(source, t) ? [] : ['amounts changed']),
    ...(words.test(t) ? [] : [`not in the expected language (${words.source})`]),
    ...keep.filter((k) => !t.includes(k)).map((k) => `lost "${k}"`),
    ...(/^(here is|hier ist|tady je|oto)/i.test(t.trim()) ? ['adds a preamble'] : []),
  ];
}

const draftCs = `Dobrý den, paní Lange,

děkujeme za Váš dotaz. Pro 2 dospělé od 12. do 14. listopadu Vám můžeme nabídnout dvoulůžkový pokoj za 5 000 CZK celkem, včetně wellness. Rádi Vám pokoj podržíme 48 hodin.

S pozdravem
recepce Penzionu Orbit`;

const guestDe = `Guten Tag,
wir kommen am Freitag gegen 22 Uhr an. Ist die Rezeption dann noch besetzt? Und können wir den Hund (ca. 8 kg) mitbringen?
Viele Grüße, Hannah Lange`;

const guestPl = `Dzień dobry, czy w pokoju 204 jest łóżeczko dla dziecka? Zapłaciliśmy już zaliczkę 1 500 CZK. Pozdrawiam, Joanna Michalska`;

/**
 * Synthetic messages and drafts to translate between the guest's and the staff member's
 * language: a Czech draft with prices for a German guest and an English-speaking colleague, and
 * guest messages into Czech for the desk.
 */
export const translationFixtures: TranslationFixture[] = [
  {
    id: 'draft-cs-de',
    text: draftCs,
    to: 'de',
    check: expect(draftCs, /\b(Zimmer|Ihnen|Grüßen)\b/, ['Lange', '5 000 CZK']),
  },
  {
    id: 'draft-cs-en',
    text: draftCs,
    to: 'en',
    check: expect(draftCs, /\b(room|regards|thank)/i, ['Lange', '5 000 CZK']),
  },
  {
    id: 'guest-de-cs',
    text: guestDe,
    to: 'cs',
    check: expect(guestDe, /\b(recepce|pes|psa|přijedeme|přijedem)/i, ['Hannah Lange', '22']),
  },
  {
    id: 'guest-pl-cs',
    text: guestPl,
    to: 'cs',
    check: expect(guestPl, /\b(pokoji|postýlka|postýlku|zálohu)/i, [
      '204',
      '1 500 CZK',
      'Joanna Michalska',
    ]),
  },
];
