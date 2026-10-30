import type { HotelProfile } from '@orbit/shared';

/**
 * The Czech guesthouse: synthetic, with contact details on reserved example domains. Amounts are
 * left out on purpose; prices come from `quote()`.
 */
export const czechHotelProfile: HotelProfile = {
  country: 'CZ',
  language: 'cs',
  coordinates: { latitude: 50.82, longitude: 15.25 },
  name: 'Orbit Demo Penzion',
  location: 'Jizera Mountains, Czech Republic',
  description:
    'A family-run mountain guesthouse with 44 rooms and 6 apartments at the edge of the forest, popular with families, hikers and skiers.',
  phone: null,
  email: 'reception@example.com',
  website: 'https://example.com',
  checkInFrom: '15:00',
  checkOutBy: '10:00',
  entries: [
    {
      id: 'pets',
      category: 'policies',
      title: 'Dogs',
      details:
        'Dogs are welcome in the apartments for a nightly fee. They may not enter the breakfast room or the [[Wellness]] area.',
      tags: ['pets', 'dogs'],
    },
    {
      id: 'children',
      category: 'policies',
      title: 'Children',
      details:
        'Children of every age are welcome. Children under 3 stay free and older children get a discount by age. Cots and high chairs are free on request; see [[For children]] for the playroom.',
      tags: ['children', 'families'],
    },
    {
      id: 'cancellation',
      category: 'policies',
      title: 'Cancellation',
      details:
        'Free cancellation up to 7 days before arrival. Later cancellations and no-shows are charged the first night.',
      tags: ['cancellation', 'booking'],
    },
    {
      id: 'payment',
      category: 'policies',
      title: 'Payment',
      details: 'Payment on arrival by card or cash, in CZK or EUR.',
      tags: ['payment'],
    },
    {
      id: 'quiet-hours',
      category: 'policies',
      title: 'Quiet hours',
      details: 'From 22:00 to 07:00.',
      tags: ['noise'],
    },
    {
      id: 'smoking',
      category: 'policies',
      title: 'Smoking',
      details: 'The whole house is non-smoking. Smoking is allowed on the terrace.',
      tags: ['smoking'],
    },
    {
      id: 'late-checkout',
      category: 'rooms',
      title: 'Late check-out',
      details: 'Until 12:00 on request, if the room is not needed for an arrival that day.',
      tags: ['check-out'],
    },
    {
      id: 'breakfast',
      category: 'food',
      title: 'Breakfast',
      details:
        'Buffet breakfast from 07:30 to 10:00 in the breakfast room, included in every stay.',
      tags: ['breakfast', 'included'],
    },
    {
      id: 'wellness',
      category: 'wellness',
      title: 'Wellness',
      details:
        'Finnish sauna and outdoor whirlpool, open 16:00 to 21:00. Booked per guest per night as an add-on to the stay.',
      tags: ['sauna', 'whirlpool', 'add-on'],
    },
    {
      id: 'parking',
      category: 'getting_here',
      title: 'Parking',
      details: 'Free private parking behind the house for about 25 cars.',
      tags: ['parking'],
    },
    {
      id: 'wifi',
      category: 'services',
      title: 'Wi-Fi',
      details: 'Free Wi-Fi in every room and the common areas.',
      tags: ['wi-fi'],
    },
    {
      id: 'ski-room',
      category: 'services',
      title: 'Ski and bike room',
      details: 'Heated storage for skis and bikes, with boot dryers.',
      tags: ['skiing', 'biking', 'storage'],
    },
    {
      id: 'playroom',
      category: 'activities',
      title: 'For children',
      details: 'A playroom with toys and board games, and a playground in the garden.',
      tags: ['children', 'games'],
    },
    {
      id: 'reception',
      category: 'services',
      title: 'Reception hours',
      details:
        'Reception is open from 07:00 to 21:00. Guests arriving later get a key code by email on the day of arrival.',
      tags: ['front desk', 'late arrival'],
    },
    {
      id: 'getting-here',
      category: 'getting_here',
      title: 'Getting here',
      details:
        'About two hours by car from Prague. The nearest train station is 4 km away; reception can order a taxi. Arriving late? See [[Reception hours]].',
      tags: ['directions', 'train', 'taxi'],
    },
    {
      id: 'outdoors',
      category: 'activities',
      title: 'Hiking and skiing',
      details:
        'Marked hiking and cycling trails start at the door. Cross-country ski trails and a small ski area are a 10-minute walk away. Free maps at reception; skis and bikes go in the [[Ski and bike room]].',
      tags: ['hiking', 'skiing', 'maps'],
    },
  ],
};

/**
 * The US demo lodge: a fictional mountain inn in the Sierra Nevada, on Pacific time, with contact
 * details on reserved example domains. Amounts are left out on purpose; prices come from
 * `quote()`.
 */
export const usHotelProfile: HotelProfile = {
  country: 'US',
  language: 'en',
  coordinates: { latitude: 37.65, longitude: -118.97 },
  name: 'Orbit Demo Lodge',
  location: 'Sierra Nevada, California',
  description:
    'A family-run mountain lodge with 44 rooms and 6 cabin suites at the edge of the forest, popular with families, hikers and skiers.',
  phone: '(530) 555-0100',
  email: 'frontdesk@example.com',
  website: 'https://example.com',
  checkInFrom: '15:00',
  checkOutBy: '11:00',
  entries: [
    {
      id: 'pets',
      category: 'policies',
      title: 'Dogs',
      details:
        'Dogs are welcome in the cabin suites for a nightly fee. They may not enter the breakfast room or the [[Spa]].',
      tags: ['pets', 'dogs'],
    },
    {
      id: 'children',
      category: 'policies',
      title: 'Kids',
      details:
        'Kids of every age are welcome and stay free in their parents’ room. Cribs and high chairs are free on request; see [[For kids]] for the game room.',
      tags: ['kids', 'families'],
    },
    {
      id: 'cancellation',
      category: 'policies',
      title: 'Cancellation',
      details:
        'Free cancellation up to 72 hours before arrival. Later cancellations and no-shows are charged the first night.',
      tags: ['cancellation', 'booking'],
    },
    {
      id: 'payment',
      category: 'policies',
      title: 'Payment',
      details:
        'A credit card is needed to hold a reservation. Room rates are before the occupancy tax, which is added at check-out.',
      tags: ['payment', 'tax'],
    },
    {
      id: 'quiet-hours',
      category: 'policies',
      title: 'Quiet hours',
      details: 'From 10 PM to 7 AM.',
      tags: ['noise'],
    },
    {
      id: 'smoking',
      category: 'policies',
      title: 'Smoking',
      details: 'The whole lodge is non-smoking, including vaping.',
      tags: ['smoking'],
    },
    {
      id: 'late-checkout',
      category: 'rooms',
      title: 'Late check-out',
      details:
        'Until 1 PM on request for a fee, if the room is not needed for an arrival that day.',
      tags: ['check-out'],
    },
    {
      id: 'breakfast',
      category: 'food',
      title: 'Breakfast',
      details: 'Continental breakfast from 7 to 10 AM in the lodge room, included in every stay.',
      tags: ['breakfast', 'included'],
    },
    {
      id: 'wellness',
      category: 'wellness',
      title: 'Spa',
      details:
        'Sauna and outdoor hot tub, open 4 to 9 PM. Spa access is booked per guest per night as an add-on.',
      tags: ['sauna', 'hot tub', 'add-on'],
    },
    {
      id: 'parking',
      category: 'getting_here',
      title: 'Parking',
      details: 'Free self-parking for about 40 cars, with four EV chargers.',
      tags: ['parking', 'ev'],
    },
    {
      id: 'wifi',
      category: 'services',
      title: 'Wi-Fi',
      details: 'Free Wi-Fi in every room and the common areas.',
      tags: ['wi-fi'],
    },
    {
      id: 'ski-room',
      category: 'services',
      title: 'Ski and bike room',
      details: 'Heated storage for skis and bikes, with boot dryers.',
      tags: ['skiing', 'biking', 'storage'],
    },
    {
      id: 'playroom',
      category: 'activities',
      title: 'For kids',
      details: 'A game room with toys and board games, and a playground by the creek.',
      tags: ['kids', 'games'],
    },
    {
      id: 'reception',
      category: 'services',
      title: 'Front desk hours',
      details:
        'The front desk is open from 7 AM to 10 PM. Guests arriving later get a door code by email on the day of arrival.',
      tags: ['front desk', 'late arrival'],
    },
    {
      id: 'getting-here',
      category: 'getting_here',
      title: 'Getting here',
      details:
        'About an hour by car from Reno–Tahoe International Airport. Chains may be required on mountain roads in winter. Arriving late? See [[Front desk hours]].',
      tags: ['directions', 'airport', 'winter'],
    },
    {
      id: 'outdoors',
      category: 'activities',
      title: 'Hiking and skiing',
      details:
        'Hiking and biking trails start at the door. Cross-country trails and a small ski area are a 10-minute walk away. Free maps at the front desk; skis and bikes go in the [[Ski and bike room]].',
      tags: ['hiking', 'skiing', 'maps'],
    },
  ],
};
