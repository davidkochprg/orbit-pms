import { addDays } from '@orbit/domain';
import type { InquiryChannel, InquiryExtraction, IsoDate } from '@orbit/shared';
import { numericDate, spokenDate } from './format';

export interface InquiryFixture {
  id: string;
  channel: InquiryChannel;
  /** OTA the message came through, or null for direct messages. */
  partner: string | null;
  subject: string | null;
  senderName: string | null;
  senderAddress: string | null;
  /** Hours before "now" that the message arrived. */
  receivedHoursAgo: number;
  rawText: string;
  expected: InquiryExtraction;
}

interface Stay {
  checkIn: IsoDate;
  checkOut: IsoDate;
}

function stay(today: IsoDate, offset: number, nights: number): Stay {
  const checkIn = addDays(today, offset);
  return { checkIn, checkOut: addDays(checkIn, nights) };
}

const noWishes = { wellness: false, dog: false, apartment: false };
const noStay = { checkIn: null, checkOut: null, adults: null, childAges: [] };

function booking(
  fields: Omit<InquiryExtraction, 'kind' | 'question' | 'checkIn' | 'checkOut'> & Stay,
): InquiryExtraction {
  return { kind: 'booking_request', question: null, ...fields };
}

/**
 * Fourteen synthetic guest messages in Czech, German, English and Polish, dated relative to
 * `today` so the demo always has upcoming requests: ten direct inquiries and four messages
 * relayed by OTA partners. All names, addresses and reservation numbers are made up.
 */
export function buildInquiryFixtures(today: IsoDate): InquiryFixture[] {
  const s1 = stay(today, 3, 2);
  const s2 = stay(today, 10, 4);
  const s3 = stay(today, 7, 3);
  const s4 = stay(today, 14, 5);
  const s5 = stay(today, 5, 7);
  const s6 = stay(today, 20, 2);
  const s7 = stay(today, 12, 4);
  const s8 = stay(today, 2, 3);
  const s9 = stay(today, 25, 3);
  const s10 = stay(today, 30, 7);
  const s13 = stay(today, 17, 2);

  return [
    {
      id: 'inq_01',
      channel: 'email',
      partner: null,
      subject: 'Volný pokoj?',
      senderName: 'Jana Testová',
      senderAddress: 'jana.testova@example.com',
      receivedHoursAgo: 2,
      rawText: `Dobrý den,
chtěli bychom si u Vás rezervovat pokoj pro 2 osoby od ${spokenDate(s1.checkIn, 'cs')} do ${spokenDate(s1.checkOut, 'cs')}. Máte ještě volno? Rádi bychom využili i wellness.

Děkuji a přeji hezký den,
Jana Testová`,
      expected: booking({
        language: 'cs',
        guestName: 'Jana Testová',
        ...s1,
        adults: 2,
        childAges: [],
        wishes: { ...noWishes, wellness: true },
      }),
    },
    {
      id: 'inq_02',
      channel: 'email',
      partner: null,
      subject: 'Anfrage Ferienwohnung',
      senderName: 'Familie Beispiel',
      senderAddress: 'familie.beispiel@example.com',
      receivedHoursAgo: 5,
      rawText: `Guten Tag,
wir sind eine Familie mit zwei Kindern (4 und 8 Jahre) und suchen eine Ferienwohnung vom ${spokenDate(s2.checkIn, 'de')} bis ${spokenDate(s2.checkOut, 'de')}. Ist da etwas frei und was würde es kosten?

Viele Grüße
Familie Beispiel`,
      expected: booking({
        language: 'de',
        guestName: 'Familie Beispiel',
        ...s2,
        adults: 2,
        childAges: [4, 8],
        wishes: { ...noWishes, apartment: true },
      }),
    },
    {
      id: 'inq_03',
      channel: 'web',
      partner: null,
      subject: 'Booking enquiry',
      senderName: 'Alex Sample',
      senderAddress: 'alex.sample@example.com',
      receivedHoursAgo: 9,
      rawText: `Hi there,
my partner and I would love to stay from ${spokenDate(s3.checkIn, 'en')} to ${spokenDate(s3.checkOut, 'en')} (3 nights). We'd be bringing our dog, a calm medium-sized retriever. Is that OK, and do you have a room?

Thanks,
Alex Sample`,
      expected: booking({
        language: 'en',
        guestName: 'Alex Sample',
        ...s3,
        adults: 2,
        childAges: [],
        wishes: { ...noWishes, dog: true },
      }),
    },
    {
      id: 'inq_04',
      channel: 'email',
      partner: null,
      subject: 'Rezerwacja',
      senderName: 'Anna Przykładowa',
      senderAddress: 'anna.przykladowa@example.com',
      receivedHoursAgo: 14,
      rawText: `Dzień dobry,
chcielibyśmy zarezerwować pokój dla dwóch osób dorosłych i dziecka (1 rok) w terminie ${spokenDate(s4.checkIn, 'pl')} – ${spokenDate(s4.checkOut, 'pl')}. Interesuje nas również strefa wellness. Czy można dostawić łóżeczko dla dziecka?

Pozdrawiam serdecznie,
Anna Przykładowa`,
      expected: booking({
        language: 'pl',
        guestName: 'Anna Przykładowa',
        ...s4,
        adults: 2,
        childAges: [1],
        wishes: { ...noWishes, wellness: true },
      }),
    },
    {
      id: 'inq_05',
      channel: 'email',
      partner: null,
      subject: 'Apartmán na týden',
      senderName: 'Petr Ukázka',
      senderAddress: 'petr.ukazka@example.com',
      receivedHoursAgo: 20,
      rawText: `Dobrý den,
sháníme apartmán na týden, ${numericDate(s5.checkIn)}–${numericDate(s5.checkOut)}, pro 2 dospělé a 2 děti (3 a 6 let). Jezdíme se psem, je to u Vás možné?

S pozdravem
Petr Ukázka
tel. +420 600 000 005`,
      expected: booking({
        language: 'cs',
        guestName: 'Petr Ukázka',
        ...s5,
        adults: 2,
        childAges: [3, 6],
        wishes: { ...noWishes, dog: true, apartment: true },
      }),
    },
    {
      id: 'inq_06',
      channel: 'web',
      partner: null,
      subject: 'Einzelzimmer',
      senderName: 'M. Muster',
      senderAddress: 'm.muster@example.com',
      receivedHoursAgo: 26,
      rawText: `Hallo,
ich bin beruflich in der Gegend und bräuchte ein Einzelzimmer, Anreise am ${numericDate(s6.checkIn)}, Abreise am ${numericDate(s6.checkOut)}.

Danke und Gruß
M. Muster`,
      expected: booking({
        language: 'de',
        guestName: 'M. Muster',
        ...s6,
        adults: 1,
        childAges: [],
        wishes: noWishes,
      }),
    },
    {
      id: 'inq_07',
      channel: 'email',
      partner: null,
      subject: `Group of four, ${spokenDate(s7.checkIn, 'en')}`,
      senderName: 'Sam Placeholder',
      senderAddress: 'sam.placeholder@example.com',
      receivedHoursAgo: 30,
      rawText: `Hello,
two couples (4 adults) looking for accommodation, checking in ${spokenDate(s7.checkIn, 'en')} and leaving ${spokenDate(s7.checkOut, 'en')}. Ideally all together in one apartment. What would the total be?

Best regards,
Sam Placeholder`,
      expected: booking({
        language: 'en',
        guestName: 'Sam Placeholder',
        ...s7,
        adults: 4,
        childAges: [],
        wishes: { ...noWishes, apartment: true },
      }),
    },
    {
      id: 'inq_08',
      channel: 'phone',
      partner: null,
      subject: 'Telefon',
      senderName: 'Tomasz Testowy',
      senderAddress: 'tomasz.testowy@example.com',
      receivedHoursAgo: 34,
      rawText: `Notatka z rozmowy telefonicznej:
Pan Tomasz Testowy, 2 osoby dorosłe + syn 10 lat + pies. Przyjazd ${numericDate(s8.checkIn)}, wyjazd ${numericDate(s8.checkOut)}. Prosi o potwierdzenie e-mailem: tomasz.testowy@example.com`,
      expected: booking({
        language: 'pl',
        guestName: 'Tomasz Testowy',
        ...s8,
        adults: 2,
        childAges: [10],
        wishes: { ...noWishes, dog: true },
      }),
    },
    {
      id: 'inq_09',
      channel: 'email',
      partner: null,
      subject: 'Víkend s wellness',
      senderName: 'Lucie Vzorová',
      senderAddress: 'lucie.vzorova@example.com',
      receivedHoursAgo: 40,
      rawText: `Dobrý den,
rádi bychom přijeli ${spokenDate(s9.checkIn, 'cs')} na 3 noci, jsme dva. Je možné si dopřát saunu a masáž?

Díky,
Lucie Vzorová`,
      expected: booking({
        language: 'cs',
        guestName: 'Lucie Vzorová',
        ...s9,
        adults: 2,
        childAges: [],
        wishes: { ...noWishes, wellness: true },
      }),
    },
    {
      id: 'inq_10',
      channel: 'ota',
      partner: 'Booking.com',
      subject: 'Guest message',
      senderName: 'Familie Testmann',
      senderAddress: null,
      receivedHoursAgo: 46,
      rawText: `Guten Abend,
wir möchten eine Woche Urlaub machen: ${spokenDate(s10.checkIn, 'de')} bis ${spokenDate(s10.checkOut, 'de')}, zwei Erwachsene und zwei Kinder (12 und 14). Haben Sie ein Familienzimmer?

Freundliche Grüße
Familie Testmann`,
      expected: booking({
        language: 'de',
        guestName: 'Familie Testmann',
        ...s10,
        adults: 2,
        childAges: [12, 14],
        wishes: noWishes,
      }),
    },
    {
      id: 'inq_11',
      channel: 'ota',
      partner: 'Booking.com',
      subject: 'Guest message about reservation 4000000011',
      senderName: 'Jonas Beispielmann',
      senderAddress: null,
      receivedHoursAgo: 1,
      rawText: `Hallo, wir kommen leider erst gegen 22 Uhr an, weil wir lange arbeiten. Ist ein später Check-in möglich? Gibt es einen Schlüsselsafe?

Jonas`,
      expected: {
        kind: 'question',
        language: 'de',
        guestName: 'Jonas',
        ...noStay,
        wishes: noWishes,
        question: 'Is a late check-in around 22:00 possible, and is there a key safe?',
      },
    },
    {
      id: 'inq_12',
      channel: 'ota',
      partner: 'Booking.com',
      subject: 'Guest message about reservation 4000000012',
      senderName: 'Chris Example',
      senderAddress: null,
      receivedHoursAgo: 7,
      rawText: `Hello! Is there parking at the property? We are coming by electric car, is there anywhere to charge it?

Cheers, Chris`,
      expected: {
        kind: 'question',
        language: 'en',
        guestName: 'Chris',
        ...noStay,
        wishes: noWishes,
        question: 'Is there parking, and can they charge an electric car?',
      },
    },
    {
      id: 'inq_13',
      channel: 'ota',
      partner: 'Booking.com',
      subject: 'Pre-booking question',
      senderName: 'Katarzyna Próbna',
      senderAddress: null,
      receivedHoursAgo: 12,
      rawText: `Dzień dobry, czy mają Państwo wolny pokój dla 2 osób od ${spokenDate(s13.checkIn, 'pl')} do ${spokenDate(s13.checkOut, 'pl')}? W serwisie nie widzę dostępności.

Katarzyna`,
      expected: booking({
        language: 'pl',
        guestName: 'Katarzyna',
        ...s13,
        adults: 2,
        childAges: [],
        wishes: noWishes,
      }),
    },
    {
      id: 'inq_14',
      channel: 'ota',
      partner: 'Booking.com',
      subject: 'Guest message about reservation 4000000014',
      senderName: 'Martina Zkušební',
      senderAddress: null,
      receivedHoursAgo: 18,
      rawText: `Dobrý den, můžeme s sebou vzít psa? Je malý (jezevčík) a je zvyklý na hotely. Děkuji, Martina`,
      expected: {
        kind: 'question',
        language: 'cs',
        guestName: 'Martina',
        ...noStay,
        wishes: { ...noWishes, dog: true },
        question: 'May they bring a small dog?',
      },
    },
  ];
}
