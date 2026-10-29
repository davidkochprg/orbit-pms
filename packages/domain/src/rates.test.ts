import type { PricingConfig, RoomBody, StaffMember } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { pricingConfig } from './pricing';
import {
  applyAdjustments,
  assertUniqueRoomName,
  assertValidPricing,
  changedPricingFields,
  createRatesService,
  isMonthDay,
} from './rates';
import { double, room } from './test-fixtures';
import { createMemoryRepositories } from './testing';

const manager: StaffMember = {
  id: 'stf_m',
  name: 'Test Manager',
  email: null,
  role: 'manager',
  language: 'cs',
  active: true,
};
const receptionist: StaffMember = { ...manager, id: 'stf_r', role: 'receptionist' };

function setup() {
  const repos = createMemoryRepositories({
    roomTypes: [double],
    rooms: [room('rm_1', { name: '101' })],
  });
  let n = 0;
  const service = createRatesService({
    repos,
    defaults: pricingConfig,
    newId: (prefix) => `${prefix}_new${++n}`,
  });
  return { repos, service };
}

describe('isMonthDay', () => {
  it('accepts real days of the year, including 29 February', () => {
    expect(isMonthDay('01-01')).toBe(true);
    expect(isMonthDay('02-29')).toBe(true);
    expect(isMonthDay('12-31')).toBe(true);
  });

  it('rejects impossible days and other formats', () => {
    expect(isMonthDay('02-30')).toBe(false);
    expect(isMonthDay('04-31')).toBe(false);
    expect(isMonthDay('13-01')).toBe(false);
    expect(isMonthDay('00-10')).toBe(false);
    expect(isMonthDay('1-01')).toBe(false);
  });
});

describe('assertValidPricing', () => {
  it('accepts the default rates', () => {
    expect(() => assertValidPricing(pricingConfig)).not.toThrow();
  });

  it('accepts a season that wraps the new year', () => {
    const wrap = {
      ...pricingConfig,
      seasons: [{ name: 'winter', from: '12-20', to: '01-06', multiplier: 1.2 }],
    };
    expect(() => assertValidPricing(wrap)).not.toThrow();
  });

  it('rejects duplicate season names and impossible days', () => {
    const season = pricingConfig.seasons[0]!;
    expect(() => assertValidPricing({ ...pricingConfig, seasons: [season, season] })).toThrow(
      /Duplicate season/,
    );
    expect(() =>
      assertValidPricing({ ...pricingConfig, seasons: [{ ...season, to: '02-30' }] }),
    ).toThrow(/02-30 is not a day/);
  });

  it('needs child tiers in ascending age order', () => {
    const tiers: PricingConfig['childDiscounts'] = [
      { maxAge: 11, discount: 0.5 },
      { maxAge: 2, discount: 1 },
    ];
    expect(() => assertValidPricing({ ...pricingConfig, childDiscounts: tiers })).toThrow(
      /go up in age/,
    );
    const same = [tiers[0]!, tiers[0]!];
    expect(() => assertValidPricing({ ...pricingConfig, childDiscounts: same })).toThrow();
  });

  it('allows one adjustment per night', () => {
    const night = { date: '2026-05-10', percent: 10 };
    expect(() =>
      assertValidPricing({ ...pricingConfig, adjustments: [night, { ...night, percent: 5 }] }),
    ).toThrow('Two rate changes');
  });

  it('allows one long-stay discount per length', () => {
    const longStay = [
      { minNights: 7, discount: 0.1 },
      { minNights: 7, discount: 0.2 },
    ];
    expect(() => assertValidPricing({ ...pricingConfig, longStay })).toThrow(/7 nights/);
  });
});

describe('applyAdjustments', () => {
  const current = [
    { date: '2026-05-10', percent: 10 },
    { date: '2026-05-12', percent: -5 },
  ];

  it('sets, replaces and removes nights, sorted by date', () => {
    expect(
      applyAdjustments(current, [
        { date: '2026-05-11', percent: 15 },
        { date: '2026-05-12', percent: 0 },
        { date: '2026-05-10', percent: 20 },
      ]),
    ).toEqual([
      { date: '2026-05-10', percent: 20 },
      { date: '2026-05-11', percent: 15 },
    ]);
  });

  it('refuses a night given twice', () => {
    expect(() =>
      applyAdjustments(current, [
        { date: '2026-05-11', percent: 15 },
        { date: '2026-05-11', percent: 5 },
      ]),
    ).toThrow('set twice');
  });
});

describe('changedPricingFields', () => {
  it('names the top-level fields that changed', () => {
    expect(changedPricingFields(pricingConfig, pricingConfig)).toEqual([]);
    expect(
      changedPricingFields(pricingConfig, { ...pricingConfig, dog: { perNight: 1 }, longStay: [] }),
    ).toEqual(['longStay', 'dog']);
  });
});

describe('assertUniqueRoomName', () => {
  const rooms = [room('rm_1', { name: 'A1' })];

  it('rejects a taken name, ignoring case and spaces', () => {
    expect(() => assertUniqueRoomName(rooms, ' a1 ')).toThrow(/already a room/);
  });

  it('lets a room keep its own name', () => {
    expect(() => assertUniqueRoomName(rooms, 'A1', 'rm_1')).not.toThrow();
  });
});

describe('createRatesService', () => {
  it('returns the defaults until rates are saved', async () => {
    const { service } = setup();
    expect(await service.getPricing()).toEqual(pricingConfig);
  });

  it('saves rates and audits which fields changed', async () => {
    const { repos, service } = setup();
    const next = { ...pricingConfig, wellness: { perPersonPerNight: 250, minAge: 6 } };
    expect(await service.updatePricing(next, manager)).toEqual(next);
    expect(await service.getPricing()).toEqual(next);
    expect(repos.state.audit).toEqual([
      expect.objectContaining({
        action: 'settings.pricing',
        payload: { by: 'stf_m', changed: ['wellness'] },
      }),
    ]);
  });

  it('writes no audit entry when nothing changed', async () => {
    const { repos, service } = setup();
    await service.updatePricing(pricingConfig, manager);
    expect(repos.state.audit).toEqual([]);
    expect(repos.state.pricing).toBeNull();
  });

  it('adjusts nights and audits each change, by a manager or the agent', async () => {
    const { repos, service } = setup();
    const saved = await service.adjustRates(
      [
        { date: '2026-05-10', percent: 15 },
        { date: '2026-05-11', percent: 0 },
      ],
      'user',
      manager,
    );
    expect(saved.adjustments).toEqual([{ date: '2026-05-10', percent: 15 }]);
    expect(repos.state.audit.map((a) => [a.actor, a.action, a.payload])).toEqual([
      ['user', 'rates.adjust', { by: 'stf_m', nights: [{ date: '2026-05-10', from: 0, to: 15 }] }],
    ]);

    await service.adjustRates([{ date: '2026-05-10', percent: 15 }], 'agent');
    expect(repos.state.audit).toHaveLength(1);
    await service.adjustRates([{ date: '2026-05-10', percent: 0 }], 'agent');
    expect((await service.getPricing()).adjustments).toEqual([]);
    expect(repos.state.audit.at(-1)).toMatchObject({ actor: 'agent', action: 'rates.adjust' });

    await expect(
      service.adjustRates([{ date: '2026-05-10', percent: 5 }], 'user', receptionist),
    ).rejects.toThrow('Only a manager');
  });

  it('lets only an active manager change rates, room types and rooms', async () => {
    const { repos, service } = setup();
    const body: RoomBody = { name: '102', roomTypeId: double.id, kind: 'room', floor: 1 };
    await expect(service.updatePricing(pricingConfig, receptionist)).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(service.createRoom(body, null)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(service.createRoom(body, { ...manager, active: false })).rejects.toMatchObject({
      code: 'forbidden',
    });
    expect(repos.state.rooms).toHaveLength(1);
  });

  it('rejects invalid rates without saving them', async () => {
    const { repos, service } = setup();
    const bad = {
      ...pricingConfig,
      seasons: [{ name: 'x', from: '02-31', to: '03-01', multiplier: 1 }],
    };
    await expect(service.updatePricing(bad, manager)).rejects.toMatchObject({
      code: 'invalid_input',
    });
    expect(repos.state.pricing).toBeNull();
  });

  it('creates and edits a room type, auditing the price change', async () => {
    const { repos, service } = setup();
    const created = await service.createRoomType(
      { name: 'Loft', maxAdults: 2, maxChildren: 0, basePrice: 1500, description: '' },
      manager,
    );
    expect(created.id).toBe('rt_new1');
    const updated = await service.updateRoomType(
      created.id,
      { ...created, basePrice: 1700 },
      manager,
    );
    expect(updated.basePrice).toBe(1700);
    expect(repos.state.roomTypes).toContainEqual(updated);
    expect(repos.state.audit.map((e) => e.action)).toEqual([
      'room_type.create',
      'room_type.update',
    ]);
    expect(repos.state.audit[1]?.payload).toEqual({
      by: 'stf_m',
      changed: ['basePrice'],
      basePrice: { from: 1500, to: 1700 },
    });
  });

  it('throws not_found for an unknown room type', async () => {
    const { service } = setup();
    const body = { name: 'X', maxAdults: 1, maxChildren: 0, basePrice: 1, description: '' };
    await expect(service.updateRoomType('nope', body, manager)).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(
      service.createRoom({ name: '9', roomTypeId: 'nope', kind: 'room', floor: 1 }, manager),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('adds a clean room with a unique name', async () => {
    const { repos, service } = setup();
    const created = await service.createRoom(
      { name: ' 102 ', roomTypeId: double.id, kind: 'room', floor: 1 },
      manager,
    );
    expect(created).toEqual({
      id: 'rm_new1',
      name: '102',
      roomTypeId: double.id,
      kind: 'room',
      floor: 1,
      status: 'clean',
    });
    await expect(
      service.createRoom({ name: '101', roomTypeId: double.id, kind: 'room', floor: 1 }, manager),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(repos.state.rooms).toHaveLength(2);
  });

  it('edits a room but keeps its housekeeping status', async () => {
    const { repos, service } = setup();
    await repos.rooms.setRoomStatus('rm_1', 'dirty');
    const updated = await service.updateRoom(
      'rm_1',
      { name: '101', roomTypeId: double.id, kind: 'room', floor: 2 },
      manager,
    );
    expect(updated).toMatchObject({ floor: 2, status: 'dirty' });
    expect(repos.state.audit).toEqual([
      expect.objectContaining({
        action: 'room.update',
        payload: { by: 'stf_m', changed: ['floor'] },
      }),
    ]);
  });
});
