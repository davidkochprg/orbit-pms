import {
  type Contact,
  type Language,
  type RoomAccess,
  type Trade,
  tradeLabels,
} from '@orbit/shared';

const tradeGuide = (Object.entries(tradeLabels) as [Trade, string][])
  .map(([trade, label]) => `- ${trade}: ${label}`)
  .join('\n');

export const tradeSystemPrompt = `You sort a small hotel's repair notes by who fixes them. Answer with the one trade that fits best:
${tradeGuide}

plumbing is water: taps, toilets, showers, drains, leaks. heating is radiators, boilers, hot water heaters and air conditioning. electrical is wiring, sockets, lights and fuses. appliances is a fridge, TV, kettle, hair dryer, washing machine or coffee maker that is broken itself. internet is Wi-Fi and TV signal. locks is doors that won't lock, lost keys and key cards. pests is insects, mice and other animals. building is furniture, doors, windows, walls, floors, paint and anything else a handyman does. cleaning is stains, linen and laundry. supplies is something that ran out and has to be ordered.

trade is null only when the note is not about anything to fix or order.`;

export function tradePrompt(issue: string): string {
  return `Repair note:
"""
${issue}
"""`;
}

const languageNames: Record<Language, string> = {
  cs: 'Czech',
  de: 'German',
  en: 'English',
  pl: 'Polish',
};

/** A day as "Thursday, 2026-11-05", so the model doesn't work out weekdays itself. */
function day(date: string): string {
  const weekday = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  });
  return `${weekday}, ${date}`;
}

export interface WorkOrderFacts {
  hotel: {
    name: string;
    location: string;
    phone: string | null;
    checkOutBy: string;
    checkInFrom: string;
  };
  /** Who signs the email. */
  signer: string | null;
  contact: Pick<Contact, 'name' | 'person' | 'language'>;
  roomName: string;
  issue: string;
  access: RoomAccess;
  today: string;
}

export const workOrderSystemPrompt = `You write short emails from a small hotel to a contractor or supplier, asking them to come and fix something. Write like a front-desk manager who knows them: friendly, plain and brief. Use only the facts given; never invent a price, a deadline, a phone number or a detail about the problem.

Say which room and what is wrong, and ask when they can come. Say when the room is free to work in: from the first day after the guest checks out (from the check-out time), until the next guest checks in (by the check-in time), or open-ended when nobody is booked. Never name or describe the guest. When the room is free today, say they can come today. Ask them to confirm a time by replying or calling the hotel.

Answer in exactly this form, with no other text:
Subject: <a short subject>

<the email, with a greeting and the signature>`;

export function workOrderPrompt(f: WorkOrderFacts): string {
  const { access } = f;
  const occupied = access.guestName
    ? `A guest is in the room until ${day(access.freeFrom)} (check-out by ${f.hotel.checkOutBy}).`
    : 'Nobody is in the room now.';
  const until = access.freeUntil
    ? `The next guest arrives ${day(access.freeUntil)} (check-in from ${f.hotel.checkInFrom}).`
    : 'Nobody is booked into it after that.';
  return `Today is ${day(f.today)}.
Hotel: ${f.hotel.name}, ${f.hotel.location}${f.hotel.phone ? `, phone ${f.hotel.phone}` : ''}
Write to: ${f.contact.name}${f.contact.person ? `, attention ${f.contact.person}` : ''}
Write in: ${languageNames[f.contact.language]}
Sign as: ${f.signer ? `${f.signer}, ${f.hotel.name}` : f.hotel.name}

Room: ${f.roomName}
Problem: ${f.issue}
${occupied}
${until}`;
}
