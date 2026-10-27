import type { IsoDate, Quote, QuoteAddons, QuoteLine, RoomType } from '@orbit/shared';
import { assertValidParty, fitsRoomType, type Party } from '../availability';
import { assertValidRange, type DateRange, eachNight } from '../dates';
import { DomainError } from '../errors';
import type { ChildDiscountTier, PricingConfig, Season } from './config';

export interface QuoteInput extends DateRange, Party {
  roomType: RoomType;
  addons?: Partial<QuoteAddons>;
}

const STANDARD = 'standard';

function inSeason(night: IsoDate, season: Season): boolean {
  const md = night.slice(5);
  return season.from <= season.to
    ? md >= season.from && md <= season.to
    : md >= season.from || md <= season.to;
}

export function seasonFor(night: IsoDate, config: PricingConfig): Season | undefined {
  return config.seasons.find((s) => inSeason(night, s));
}

export function childTier(age: number, config: PricingConfig): ChildDiscountTier | undefined {
  return config.childDiscounts.find((t) => age <= t.maxAge);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function percent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

function line(
  kind: QuoteLine['kind'],
  label: string,
  quantity: number,
  unitPrice: number,
): QuoteLine {
  return { kind, label, quantity, unitPrice, amount: quantity * unitPrice };
}

interface SeasonGroup {
  label: string;
  rate: number;
  nights: number;
}

function groupNightsBySeason(range: DateRange, basePrice: number, config: PricingConfig) {
  const groups = new Map<string, SeasonGroup>();
  for (const night of eachNight(range)) {
    const season = seasonFor(night, config);
    const key = season?.name ?? STANDARD;
    const group = groups.get(key) ?? {
      label: key.replaceAll('_', ' '),
      rate: Math.round(basePrice * (season?.multiplier ?? 1)),
      nights: 0,
    };
    group.nights += 1;
    groups.set(key, group);
  }
  return [...groups.values()];
}

/**
 * Prices a stay for one room type. Every amount is whole CZK and the total is the sum of the lines,
 * so the breakdown can be shown verbatim.
 */
export function quote(input: QuoteInput, config: PricingConfig): Quote {
  assertValidRange(input);
  assertValidParty(input);
  const addons: QuoteAddons = {
    wellness: input.addons?.wellness ?? false,
    dogs: input.addons?.dogs ?? 0,
    extraBeds: input.addons?.extraBeds ?? 0,
  };
  if (!fitsRoomType(input.roomType, input, addons.extraBeds)) {
    throw new DomainError('over_capacity', `Party does not fit room type ${input.roomType.name}`);
  }

  const nights = eachNight(input).length;
  const guests = input.adults + input.childAges.length;
  const lines: QuoteLine[] = [];

  for (const group of groupNightsBySeason(input, input.roomType.basePrice, config)) {
    lines.push(
      line(
        'accommodation',
        `Accommodation, ${plural(guests, 'guest')} × ${plural(group.nights, 'night')} (${group.label})`,
        guests * group.nights,
        group.rate,
      ),
    );
    for (const tier of config.childDiscounts) {
      const children = input.childAges.filter((age) => childTier(age, config) === tier).length;
      if (children === 0) continue;
      lines.push(
        line(
          'child_discount',
          `Child discount ${percent(tier.discount)} (age ≤ ${tier.maxAge}), ${plural(children, 'child')} × ${plural(group.nights, 'night')} (${group.label})`,
          children * group.nights,
          -Math.round(group.rate * tier.discount),
        ),
      );
    }
  }

  const longStay = config.longStay
    .filter((t) => nights >= t.minNights)
    .sort((a, b) => b.minNights - a.minNights)[0];
  if (longStay) {
    const accommodation = lines.reduce((sum, l) => sum + l.amount, 0);
    lines.push(
      line(
        'long_stay_discount',
        `Long-stay discount ${percent(longStay.discount)} (${longStay.minNights}+ nights)`,
        1,
        -Math.round(accommodation * longStay.discount),
      ),
    );
  }

  if (addons.wellness) {
    const eligible =
      input.adults + input.childAges.filter((age) => age >= config.wellness.minAge).length;
    if (eligible > 0) {
      lines.push(
        line(
          'wellness',
          `Wellness, ${plural(eligible, 'guest')} × ${plural(nights, 'night')}`,
          eligible * nights,
          config.wellness.perPersonPerNight,
        ),
      );
    }
  }
  if (addons.extraBeds > 0) {
    lines.push(
      line(
        'extra_bed',
        `Extra bed, ${plural(addons.extraBeds, 'bed')} × ${plural(nights, 'night')}`,
        addons.extraBeds * nights,
        config.extraBed.perNight,
      ),
    );
  }
  if (addons.dogs > 0) {
    lines.push(
      line(
        'dog',
        `Dog, ${plural(addons.dogs, 'dog')} × ${plural(nights, 'night')}`,
        addons.dogs * nights,
        config.dog.perNight,
      ),
    );
  }

  return {
    roomTypeId: input.roomType.id,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    nights,
    adults: input.adults,
    childAges: [...input.childAges],
    lines,
    total: lines.reduce((sum, l) => sum + l.amount, 0),
    currency: 'CZK',
  };
}
