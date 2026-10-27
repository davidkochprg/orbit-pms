import type { HotelPolicy } from '@orbit/domain';
import { type HotelInfoCategory, type HotelProfile, type RoomKind, roomKinds } from '@orbit/shared';

/** Everything prompts may say about the property: the profile from Settings and the enforced rules. */
export interface HotelContext {
  profile: HotelProfile;
  policy: HotelPolicy;
}

const sections: [HotelInfoCategory, string][] = [
  ['policy', 'House policies'],
  ['amenity', 'Amenities'],
  ['info', 'Guest information'],
];

const kindNames: Record<RoomKind, string> = { room: 'rooms', apartment: 'apartments' };

/** The rules Orbit enforces, in words, so the model never contradicts the domain. */
export function enforcedRules(policy: HotelPolicy): string[] {
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
export function hotelFacts({ profile, policy }: HotelContext): string {
  const contact = [
    profile.phone && `phone ${profile.phone}`,
    profile.email && `email ${profile.email}`,
    profile.website && `website ${profile.website}`,
  ].filter(Boolean);
  const lines = [
    `${profile.name}, ${profile.location}.${profile.description ? ` ${profile.description}` : ''}`,
    ...(contact.length > 0 ? [`Contact: ${contact.join(', ')}.`] : []),
    `Check-in from ${profile.checkInFrom}, check-out by ${profile.checkOutBy}. Prices are in whole CZK.`,
  ];
  for (const [category, heading] of sections) {
    const entries = profile.entries.filter((e) => e.category === category);
    if (entries.length === 0) continue;
    lines.push('', `${heading}:`, ...entries.map((e) => `- ${e.title}: ${e.details}`));
  }
  lines.push('', 'Rules Orbit enforces:', ...enforcedRules(policy).map((r) => `- ${r}`));
  return lines.join('\n');
}
