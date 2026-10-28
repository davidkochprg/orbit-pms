import type { HotelPolicy } from '@orbit/domain';
import {
  type Currency,
  type HotelInfoCategory,
  type HotelProfile,
  type PricingConfig,
  type RoomKind,
  roomKinds,
} from '@orbit/shared';

/**
 * Everything prompts may say about the property: the profile from Settings, the enforced rules,
 * and how prices are stated (currency, per room or person, taxes).
 */
export interface HotelContext {
  profile: HotelProfile;
  policy: HotelPolicy;
  pricing: Pick<PricingConfig, 'currency' | 'pricingBasis' | 'tax'>;
}

const currencyNames: Record<Currency, string> = {
  USD: 'US dollars',
  EUR: 'euros',
  CZK: 'Czech crowns (CZK)',
};

/** "15:00" as guests in the hotel's country write it: "3 PM" in the US. */
export function timeOfDay(time: string, country: string): string {
  if (country !== 'US') return time;
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  return `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, '0')}` : ''} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** "Prices are in US dollars per room per night, before tax: the bill adds …". */
export function pricesSentence({ currency, pricingBasis, tax }: HotelContext['pricing']): string {
  const basis = pricingBasis === 'per_room' ? 'per room' : 'per person';
  const rates = `${tax.reduced.label} ${tax.reduced.rate}% on accommodation and ${tax.standard.label} ${tax.standard.rate}% on everything else`;
  return tax.mode === 'exclusive'
    ? `Prices are in whole ${currencyNames[currency]}, ${basis} per night, before tax: the bill adds ${rates}.`
    : `Prices are in whole ${currencyNames[currency]}, ${basis} per night, including ${rates}.`;
}

const sections: [HotelInfoCategory, string][] = [
  ['policy', 'House policies'],
  ['amenity', 'Amenities'],
  ['info', 'Guest information'],
];

const kindNames: Record<RoomKind, string> = { room: 'rooms', apartment: 'apartments' };

/** The rules Orbit enforces, in words, so the model never contradicts the domain. */
export function enforcedRules(policy: Pick<HotelPolicy, 'holdHours' | 'dogsAllowedIn'>): string[] {
  const allowed = policy.dogsAllowedIn;
  const dogs =
    allowed.length === 0
      ? 'Dogs are not allowed.'
      : roomKinds.every((k) => allowed.includes(k))
        ? 'Dogs may stay in every room and apartment.'
        : `Dogs may stay only in ${allowed.map((k) => kindNames[k]).join(' and ')}.`;
  return [`A hold keeps a room for ${policy.holdHours} hours, then lapses.`, dogs];
}

/**
 * The hotel facts block shared by the agent and the reply drafts. Built only from the profile and
 * the policy, with no dates, so it stays identical between calls and Meta's prefix cache applies.
 */
export function hotelFacts({ profile, policy, pricing }: HotelContext): string {
  const contact = [
    profile.phone && `phone ${profile.phone}`,
    profile.email && `email ${profile.email}`,
    profile.website && `website ${profile.website}`,
  ].filter(Boolean);
  const lines = [
    `${profile.name}, ${profile.location}.${profile.description ? ` ${profile.description}` : ''}`,
    ...(contact.length > 0 ? [`Contact: ${contact.join(', ')}.`] : []),
    `Check-in from ${timeOfDay(profile.checkInFrom, profile.country)}, check-out by ${timeOfDay(profile.checkOutBy, profile.country)}.`,
    pricesSentence(pricing),
  ];
  for (const [category, heading] of sections) {
    const entries = profile.entries.filter((e) => e.category === category);
    if (entries.length === 0) continue;
    lines.push('', `${heading}:`, ...entries.map((e) => `- ${e.title}: ${e.details}`));
  }
  lines.push('', 'Rules Orbit enforces:', ...enforcedRules(policy).map((r) => `- ${r}`));
  return lines.join('\n');
}
