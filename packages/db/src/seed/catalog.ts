import type { Guest, Language, Room, RoomType } from '@orbit/shared';

// TODO(David): replace placeholder base prices (adult rate per person per night, CZK).
export const seedRoomTypes: RoomType[] = [
  {
    id: 'rt_double',
    name: 'Double room',
    maxAdults: 2,
    maxChildren: 1,
    basePrice: 1000,
    description: 'Double or twin beds, shower, mountain view.',
  },
  {
    id: 'rt_family',
    name: 'Family room',
    maxAdults: 2,
    maxChildren: 2,
    basePrice: 1000,
    description: 'Double bed plus bunk beds, bath, balcony.',
  },
  {
    id: 'rt_single',
    name: 'Single room',
    maxAdults: 1,
    maxChildren: 0,
    basePrice: 1000,
    description: 'Single bed, desk, shower.',
  },
  {
    id: 'rt_superior',
    name: 'Superior double',
    maxAdults: 2,
    maxChildren: 1,
    basePrice: 1000,
    description: 'Larger double room with a balcony and bathtub.',
  },
  {
    id: 'rt_suite',
    name: 'Junior suite',
    maxAdults: 3,
    maxChildren: 1,
    basePrice: 1000,
    description: 'Attic suite with a seating area and sofa bed, valley view.',
  },
  {
    id: 'rt_apartment',
    name: 'Apartment',
    maxAdults: 4,
    maxChildren: 2,
    basePrice: 1000,
    description: 'Two bedrooms, kitchenette, private entrance. Dogs welcome.',
  },
];

function room(name: string, roomTypeId: string, floor: number): Room {
  return {
    id: `rm_${name.toLowerCase()}`,
    name,
    roomTypeId,
    kind: roomTypeId === 'rt_apartment' ? 'apartment' : 'room',
    floor,
    status: 'clean',
  };
}

/** Room numbers per floor and type. The ground floor holds the apartments. */
const layout: [floor: number, roomTypeId: string, names: string[]][] = [
  [1, 'rt_double', ['101', '102', '103']],
  [1, 'rt_family', ['104', '105']],
  [1, 'rt_double', ['106', '107']],
  [1, 'rt_single', ['108', '109']],
  [1, 'rt_family', ['110', '111']],
  [2, 'rt_double', ['201', '202', '203']],
  [2, 'rt_family', ['204', '205']],
  [2, 'rt_double', ['206', '207']],
  [2, 'rt_superior', ['208', '209']],
  [2, 'rt_family', ['210', '211']],
  [3, 'rt_double', ['301', '302', '303', '304']],
  [3, 'rt_superior', ['305', '306', '307']],
  [3, 'rt_family', ['308', '309']],
  [3, 'rt_single', ['310', '311']],
  [4, 'rt_suite', ['401', '402', '403', '404']],
  [4, 'rt_superior', ['405', '406', '407']],
  [4, 'rt_double', ['408', '409']],
  [4, 'rt_single', ['410', '411']],
  [0, 'rt_apartment', ['A1', 'A2', 'A3', 'A4', 'A5', 'A6']],
];

export const seedRooms: Room[] = layout.flatMap(([floor, roomTypeId, names]) =>
  names.map((name) => room(name, roomTypeId, floor)),
);

/** Hand-picked names, listed first so their guest IDs stay stable. */
const curatedNames: Record<Language, string[]> = {
  cs: [
    'Tomáš Novák',
    'Eva Svobodová',
    'Jakub Dvořák',
    'Lenka Černá',
    'Martin Procházka',
    'Petra Kučerová',
    'Ondřej Veselý',
    'Kateřina Horáková',
    'Jiří Marek',
    'Barbora Pokorná',
    'Lukáš Král',
    'Tereza Růžičková',
    'Pavel Beneš',
    'Veronika Fialová',
    'David Sedláček',
    'Markéta Doležalová',
    'Radek Zeman',
    'Simona Kolářová',
    'Vojtěch Navrátil',
    'Zuzana Čermáková',
    'Filip Urban',
    'Klára Vaňková',
    'Adam Blažek',
    'Monika Kříková',
  ],
  de: [
    'Jonas Becker',
    'Lea Hoffmann',
    'Felix Schäfer',
    'Mia Wagner',
    'Lukas Schulz',
    'Hannah Richter',
    'Paul Neumann',
    'Emma Zimmermann',
    'Leon Krüger',
    'Sophie Hartmann',
    'Max Fischer',
    'Laura Weber',
    'Tim Schmitt',
    'Anna Meyer',
    'Ben Wolf',
    'Clara Braun',
    'Noah Lange',
    'Lina Vogel',
  ],
  en: [
    'Oliver Grant',
    'Chloe Bennett',
    'Harry Walsh',
    'Grace Fowler',
    'Jack Ellison',
    'Ruby Lane',
    'Thomas Reed',
    'Ella Marsh',
    'Sam Holloway',
    'Lucy Barker',
  ],
  pl: [
    'Piotr Kowalczyk',
    'Agnieszka Wójcik',
    'Michał Lewandowski',
    'Magdalena Kamińska',
    'Krzysztof Zieliński',
    'Joanna Szymańska',
    'Tomasz Wiśniewski',
    'Katarzyna Dąbrowska',
    'Paweł Mazur',
    'Natalia Krawczyk',
    'Marcin Pawlak',
    'Aleksandra Grabowska',
  ],
};

interface NameParts {
  male: string[];
  female: string[];
  /** Surname as [male form, female form]. */
  surnames: [string, string][];
}

const same = (names: string[]): [string, string][] => names.map((n) => [n, n]);

const nameParts: Record<Language, NameParts> = {
  cs: {
    male: [
      'Tomáš',
      'Jakub',
      'Martin',
      'Ondřej',
      'Jiří',
      'Lukáš',
      'Pavel',
      'David',
      'Radek',
      'Vojtěch',
      'Filip',
      'Adam',
      'Petr',
      'Jan',
      'Michal',
      'Karel',
      'Josef',
      'Milan',
      'Roman',
      'Daniel',
    ],
    female: [
      'Eva',
      'Lenka',
      'Petra',
      'Kateřina',
      'Barbora',
      'Tereza',
      'Veronika',
      'Markéta',
      'Simona',
      'Zuzana',
      'Klára',
      'Monika',
      'Jana',
      'Lucie',
      'Hana',
      'Alena',
      'Ivana',
      'Michaela',
      'Kristýna',
      'Šárka',
    ],
    surnames: [
      ['Novák', 'Nováková'],
      ['Svoboda', 'Svobodová'],
      ['Dvořák', 'Dvořáková'],
      ['Černý', 'Černá'],
      ['Procházka', 'Procházková'],
      ['Kučera', 'Kučerová'],
      ['Veselý', 'Veselá'],
      ['Horák', 'Horáková'],
      ['Marek', 'Marková'],
      ['Pokorný', 'Pokorná'],
      ['Král', 'Králová'],
      ['Růžička', 'Růžičková'],
      ['Beneš', 'Benešová'],
      ['Fiala', 'Fialová'],
      ['Sedláček', 'Sedláčková'],
      ['Doležal', 'Doležalová'],
      ['Zeman', 'Zemanová'],
      ['Kolář', 'Kolářová'],
      ['Navrátil', 'Navrátilová'],
      ['Čermák', 'Čermáková'],
      ['Urban', 'Urbanová'],
      ['Vaněk', 'Vaňková'],
      ['Blažek', 'Blažková'],
      ['Kříž', 'Křížová'],
      ['Jelínek', 'Jelínková'],
      ['Hájek', 'Hájková'],
      ['Mareš', 'Marešová'],
      ['Pospíšil', 'Pospíšilová'],
      ['Kopecký', 'Kopecká'],
      ['Bartoš', 'Bartošová'],
    ],
  },
  de: {
    male: [
      'Jonas',
      'Felix',
      'Lukas',
      'Paul',
      'Leon',
      'Max',
      'Tim',
      'Ben',
      'Noah',
      'Elias',
      'Finn',
      'Moritz',
      'Jan',
      'Simon',
    ],
    female: [
      'Lea',
      'Mia',
      'Hannah',
      'Emma',
      'Sophie',
      'Laura',
      'Anna',
      'Clara',
      'Lina',
      'Marie',
      'Lena',
      'Julia',
      'Sarah',
      'Johanna',
    ],
    surnames: same([
      'Becker',
      'Hoffmann',
      'Schäfer',
      'Wagner',
      'Schulz',
      'Richter',
      'Neumann',
      'Zimmermann',
      'Krüger',
      'Hartmann',
      'Fischer',
      'Weber',
      'Schmitt',
      'Meyer',
      'Wolf',
      'Braun',
      'Lange',
      'Vogel',
      'Bauer',
      'Keller',
      'Frank',
      'Berger',
      'Huber',
      'Kaiser',
      'Fuchs',
      'Peters',
      'Lehmann',
    ]),
  },
  en: {
    male: ['Oliver', 'Harry', 'Jack', 'Thomas', 'Sam', 'George', 'James', 'Henry', 'Leo', 'Oscar'],
    female: ['Chloe', 'Grace', 'Ruby', 'Ella', 'Lucy', 'Emily', 'Isla', 'Freya', 'Amelia', 'Daisy'],
    surnames: same([
      'Grant',
      'Bennett',
      'Walsh',
      'Fowler',
      'Ellison',
      'Lane',
      'Reed',
      'Marsh',
      'Holloway',
      'Barker',
      'Turner',
      'Hughes',
      'Carter',
      'Mills',
      'Palmer',
      'Fletcher',
    ]),
  },
  pl: {
    male: [
      'Piotr',
      'Michał',
      'Krzysztof',
      'Tomasz',
      'Paweł',
      'Marcin',
      'Jakub',
      'Mateusz',
      'Łukasz',
      'Adam',
      'Kamil',
      'Bartosz',
    ],
    female: [
      'Agnieszka',
      'Magdalena',
      'Joanna',
      'Katarzyna',
      'Natalia',
      'Aleksandra',
      'Anna',
      'Monika',
      'Ewa',
      'Karolina',
      'Marta',
      'Zofia',
    ],
    surnames: [
      ...same(['Kowalczyk', 'Wójcik', 'Mazur', 'Krawczyk', 'Pawlak', 'Nowak', 'Woźniak']),
      ['Lewandowski', 'Lewandowska'],
      ['Kamiński', 'Kamińska'],
      ['Zieliński', 'Zielińska'],
      ['Szymański', 'Szymańska'],
      ['Wiśniewski', 'Wiśniewska'],
      ['Dąbrowski', 'Dąbrowska'],
      ['Grabowski', 'Grabowska'],
      ['Kowalski', 'Kowalska'],
      ['Jankowski', 'Jankowska'],
      ['Kozłowski', 'Kozłowska'],
      ['Michalski', 'Michalska'],
    ],
  },
};

/** Guests per language: mostly Czech, then German, Polish and English, like a hotel near both borders. */
const guestCounts: Record<Language, number> = { cs: 90, de: 60, pl: 50, en: 40 };

/** The curated names, then first name and surname combinations until each language has its count. */
function namesFor(language: Language): string[] {
  const { male, female, surnames } = nameParts[language];
  const result = new Set(curatedNames[language]);
  for (let i = 0; result.size < guestCounts[language]; i++) {
    const isFemale = i % 2 === 1;
    const firsts = isFemale ? female : male;
    const first = firsts[Math.floor(i / 2) % firsts.length];
    const surname = surnames[(i * 7 + Math.floor(i / surnames.length)) % surnames.length];
    if (first && surname) result.add(`${first} ${surname[isFemale ? 1 : 0]}`);
  }
  return [...result];
}

const phonePrefix: Record<Language, string> = {
  cs: '+420 600 000',
  de: '+49 1500 0000',
  en: '+44 7700 900',
  pl: '+48 500 000',
};

function emailFor(name: string): string {
  const ascii = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replaceAll('ł', 'l')
    .replace(/\s+/g, '.');
  return `${ascii}@example.com`;
}

/** Synthetic guests. Emails use the reserved example.com domain and phones use unassigned ranges. */
export const seedGuests: Guest[] = (Object.keys(curatedNames) as Language[]).flatMap((language) =>
  namesFor(language).map((name, i) => ({
    id: `gst_${language}_${String(i + 1).padStart(2, '0')}`,
    name,
    email: emailFor(name),
    phone: `${phonePrefix[language]} ${String(100 + i).padStart(3, '0')}`,
    language,
    notes: null,
  })),
);
