import type { QuoteAddons, WeatherDay } from '@orbit/shared';
import { type HotelContext, hotelFacts, timeOfDay } from './hotel';
import { languageNames } from './inbox';

/** What the note before a stay may build on: the stay, the forecast and the hotel's rules. */
export interface ArrivalNoteFacts {
  guest: { name: string; language: keyof typeof languageNames };
  stay: {
    checkIn: string;
    checkOut: string;
    adults: number;
    childAges: number[];
    roomTypeName: string;
    addons: QuoteAddons;
  };
  /** The forecast for the arrival day, when there is one. */
  weather: WeatherDay | null;
  /** Who must show an ID at check-in: everyone staying, or the guest who booked. */
  idsFrom: 'everyone' | 'main_guest';
  /** Who signs the email. */
  signer: string | null;
  today: string;
}

export function arrivalNoteSystemPrompt(hotel: HotelContext): string {
  const { name } = hotel.profile;
  return `You write the short email a small hotel sends a guest the day before they arrive, for the reception of ${name}. Warm, personal and practical, like a front desk that knows its guests.

Facts you may use (from Settings):
${hotelFacts(hotel)}

Write:
- A greeting by the name on the booking, as is polite in the guest's language. Don't guess a title such as Mr. or Mrs.
- That you look forward to welcoming them on their arrival day, and the check-in time.
- One or two practical things from the facts that fit this stay: getting there or parking, and what they booked or bring (the spa for wellness, the rules for a dog, what there is for children). Leave out what doesn't fit them.
- The weather when it matters for the journey or the stay (snow, ice, heavy rain, a cold night), with advice only if the facts give some.
- What to bring for check-in: an ID, as you are told.
- An invitation to reply with their arrival time or any wishes.

Rules:
- Write only in the language you are told to use.
- Use only the facts given. Never invent a facility, a time, a service or a price. Never state an amount of money unless the facts state it.
- It is a plain-text email: no Markdown, no asterisks, no headings, no lists. At most 130 words.
- Sign off as the reception of ${name} in the guest's language, with the signer's name if given.

Answer in exactly this form, with no other text:
Subject: <a short subject in the guest's language>

<the email>`;
}

/** A day as "Saturday, 2026-11-07", so the model doesn't work out weekdays itself. */
function day(date: string): string {
  const weekday = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  });
  return `${weekday}, ${date}`;
}

function weatherLine(w: WeatherDay): string {
  const parts = [`${w.kind}, ${w.tempMinC} to ${w.tempMaxC} °C`];
  if (w.snowfallCm > 0) parts.push(`${w.snowfallCm} cm of snow`);
  else if (w.precipitationMm > 0) parts.push(`${w.precipitationMm} mm of rain`);
  return parts.join(', ');
}

export function arrivalNotePrompt(f: ArrivalNoteFacts, hotel: HotelContext, feedback?: string) {
  const { stay } = f;
  const nights = Math.round(
    (Date.parse(`${stay.checkOut}T00:00:00Z`) - Date.parse(`${stay.checkIn}T00:00:00Z`)) /
      86_400_000,
  );
  const party = [
    `${stay.adults} adult${stay.adults === 1 ? '' : 's'}`,
    stay.childAges.length > 0 ? `children aged ${stay.childAges.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join(' and ');
  const booked = [
    stay.addons.wellness && 'wellness (spa) for the stay',
    stay.addons.dogs > 0 && `${stay.addons.dogs} dog${stay.addons.dogs === 1 ? '' : 's'}`,
    stay.addons.extraBeds > 0 && 'an extra bed',
  ].filter(Boolean);
  const country = hotel.profile.country;
  return `Today is ${day(f.today)}.
Write in: ${languageNames[f.guest.language]}
Guest: ${f.guest.name}
Arrives: ${day(stay.checkIn)}, check-in from ${timeOfDay(hotel.profile.checkInFrom, country)}
Leaves: ${day(stay.checkOut)} (${nights} night${nights === 1 ? '' : 's'}), check-out by ${timeOfDay(hotel.profile.checkOutBy, country)}
Room: ${stay.roomTypeName}, for ${party}
Booked: ${booked.length > 0 ? booked.join(', ') : 'nothing extra'}
Weather forecast for the arrival day: ${f.weather ? weatherLine(f.weather) : 'not known'}
ID at check-in: ${f.idsFrom === 'everyone' ? 'an ID card or passport for everyone staying' : 'a photo ID for the guest who booked'}
Signer: ${f.signer ?? 'none'}${feedback ? `\n\nYour previous email was rejected: ${feedback}` : ''}`;
}
