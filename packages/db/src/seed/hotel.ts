import type { HotelProfile } from '@orbit/shared';

/**
 * The demo property: synthetic, with contact details on reserved example domains. Amounts are
 * left out on purpose; prices come from `quote()`.
 */
export const seedHotelProfile: HotelProfile = {
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
      category: 'policy',
      title: 'Dogs',
      details:
        'Dogs are welcome in the apartments for a nightly fee. They may not enter the breakfast room or the wellness area.',
    },
    {
      id: 'children',
      category: 'policy',
      title: 'Children',
      details:
        'Children of every age are welcome. Children under 3 stay free and older children get a discount by age. Cots and high chairs are free on request.',
    },
    {
      id: 'cancellation',
      category: 'policy',
      title: 'Cancellation',
      details:
        'Free cancellation up to 7 days before arrival. Later cancellations and no-shows are charged the first night.',
    },
    {
      id: 'payment',
      category: 'policy',
      title: 'Payment',
      details: 'Payment on arrival by card or cash, in CZK or EUR.',
    },
    {
      id: 'quiet-hours',
      category: 'policy',
      title: 'Quiet hours',
      details: 'From 22:00 to 07:00.',
    },
    {
      id: 'smoking',
      category: 'policy',
      title: 'Smoking',
      details: 'The whole house is non-smoking. Smoking is allowed on the terrace.',
    },
    {
      id: 'late-checkout',
      category: 'policy',
      title: 'Late check-out',
      details: 'Until 12:00 on request, if the room is not needed for an arrival that day.',
    },
    {
      id: 'breakfast',
      category: 'amenity',
      title: 'Breakfast',
      details:
        'Buffet breakfast from 07:30 to 10:00 in the breakfast room, included in every stay.',
    },
    {
      id: 'wellness',
      category: 'amenity',
      title: 'Wellness',
      details:
        'Finnish sauna and outdoor whirlpool, open 16:00 to 21:00. Booked per guest per night as an add-on to the stay.',
    },
    {
      id: 'parking',
      category: 'amenity',
      title: 'Parking',
      details: 'Free private parking behind the house for about 25 cars.',
    },
    {
      id: 'wifi',
      category: 'amenity',
      title: 'Wi-Fi',
      details: 'Free Wi-Fi in every room and the common areas.',
    },
    {
      id: 'ski-room',
      category: 'amenity',
      title: 'Ski and bike room',
      details: 'Heated storage for skis and bikes, with boot dryers.',
    },
    {
      id: 'playroom',
      category: 'amenity',
      title: 'For children',
      details: 'A playroom with toys and board games, and a playground in the garden.',
    },
    {
      id: 'reception',
      category: 'info',
      title: 'Reception hours',
      details:
        'Reception is open from 07:00 to 21:00. Guests arriving later get a key code by email on the day of arrival.',
    },
    {
      id: 'getting-here',
      category: 'info',
      title: 'Getting here',
      details:
        'About two hours by car from Prague. The nearest train station is 4 km away; reception can order a taxi.',
    },
    {
      id: 'outdoors',
      category: 'info',
      title: 'Hiking and skiing',
      details:
        'Marked hiking and cycling trails start at the door. Cross-country ski trails and a small ski area are a 10-minute walk away. Free maps at reception.',
    },
  ],
};
