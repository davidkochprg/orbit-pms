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

export const seedRooms: Room[] = [
  room('101', 'rt_double', 1),
  room('102', 'rt_double', 1),
  room('103', 'rt_double', 1),
  room('104', 'rt_family', 1),
  room('105', 'rt_family', 1),
  room('201', 'rt_double', 2),
  room('202', 'rt_double', 2),
  room('203', 'rt_double', 2),
  room('204', 'rt_family', 2),
  room('205', 'rt_family', 2),
  room('A1', 'rt_apartment', 0),
  room('A2', 'rt_apartment', 0),
];

const names: Record<Language, string[]> = {
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
  ],
  en: ['Oliver Grant', 'Chloe Bennett', 'Harry Walsh', 'Grace Fowler', 'Jack Ellison', 'Ruby Lane'],
  pl: [
    'Piotr Kowalczyk',
    'Agnieszka Wójcik',
    'Michał Lewandowski',
    'Magdalena Kamińska',
    'Krzysztof Zieliński',
    'Joanna Szymańska',
  ],
};

const phonePrefix: Record<Language, string> = {
  cs: '+420 600 000',
  de: '+49 1500 0000',
  en: '+44 7700 900',
  pl: '+48 500 000',
};

function emailFor(name: string): string {
  const ascii = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replaceAll('ł', 'l')
    .toLowerCase()
    .replace(/\s+/g, '.');
  return `${ascii}@example.com`;
}

/** Synthetic guests. Emails use the reserved example.com domain and phones use unassigned ranges. */
export const seedGuests: Guest[] = (Object.keys(names) as Language[]).flatMap((language) =>
  (names[language] ?? []).map((name, i) => ({
    id: `gst_${language}_${String(i + 1).padStart(2, '0')}`,
    name,
    email: emailFor(name),
    phone: `${phonePrefix[language]} ${String(100 + i).padStart(3, '0')}`,
    language,
    notes: null,
  })),
);
