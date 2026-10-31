import type { StaffMember } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { pricingConfig } from './pricing';
import { createRevenueService } from './revenue-service';
import { booking, room } from './test-fixtures';
import { createMemoryRepositories } from './testing';

const now = new Date('2026-05-10T08:00:00Z');
const manager: StaffMember = {
  id: 'stf_m',
  name: 'Test Manager',
  email: null,
  role: 'manager',
  language: 'en',
  active: true,
};

function setup() {
  const repos = createMemoryRepositories(
    {
      rooms: [room('r1', { name: '101' }), room('r2', { name: '102', status: 'out_of_order' })],
      bookings: [booking({ roomId: 'r1', checkIn: '2026-05-11', checkOut: '2026-05-13' })],
    },
    () => now,
  );
  let n = 0;
  const service = createRevenueService({
    repos,
    defaults: pricingConfig,
    clock: () => now,
    newId: (prefix) => `${prefix}_${++n}`,
  });
  return { repos, service };
}

describe('revenue service', () => {
  it('builds the outlook from today, without weather when there is none', async () => {
    const { service } = setup();
    const outlook = await service.outlook(3, null);
    expect(outlook.today).toBe('2026-05-10');
    expect(outlook.weatherAvailable).toBe(false);
    expect(outlook.nights.map((n) => [n.date, n.roomsSold, n.roomsTotal])).toEqual([
      ['2026-05-10', 0, 1],
      ['2026-05-11', 1, 1],
      ['2026-05-12', 1, 1],
    ]);
  });

  it('lets a manager add and remove events, which the outlook then counts', async () => {
    const { repos, service } = setup();
    const created = await service.createEvent(
      { name: ' Trail race ', firstNight: '2026-05-11', lastNight: '2026-05-11', impact: 'high' },
      manager,
    );
    expect(created).toMatchObject({ id: 'evt_1', name: 'Trail race' });
    const outlook = await service.outlook(3, []);
    expect(outlook.events.map((e) => e.name)).toEqual(['Trail race']);
    expect(outlook.nights[1]!.events).toEqual(['Trail race']);

    await service.deleteEvent('evt_1', manager);
    expect(await service.listEvents()).toEqual([]);
    expect(repos.state.audit.map((a) => a.action)).toEqual(['event.create', 'event.delete']);
    await expect(service.deleteEvent('evt_1', manager)).rejects.toThrow('not found');
    await expect(
      service.createEvent(
        { name: 'x', firstNight: '2026-05-11', lastNight: '2026-05-11', impact: 'low' },
        { ...manager, role: 'receptionist' },
      ),
    ).rejects.toThrow('Only a manager');
  });

  it('keeps a review until what it read changes, and suggests from its signals', async () => {
    const { repos, service } = setup();
    const before = await service.outlook(3, null);
    expect(before.review).toMatchObject({ reviewedAt: null, current: false });

    const { input, basis, review } = await service.reviewInput(null);
    expect(review).toBeNull();
    expect(input.nights).toHaveLength(60);
    expect(basis).toBe(before.review.basis);
    const saved = await service.saveReview(input, [
      {
        firstNight: '2026-05-10',
        lastNight: '2026-05-10',
        direction: 'down',
        strength: 'slight',
        label: 'Road closed',
        reason: 'A guest wrote that the pass road is closed on Sunday.',
      },
    ]);
    expect(saved).toMatchObject({ basis, reviewedAt: now.toISOString() });

    const after = await service.outlook(3, null);
    expect(after.review).toEqual({ basis, reviewedAt: now.toISOString(), current: true });
    expect(after.nights[0]!.factors).toEqual([
      expect.objectContaining({ kind: 'insight', label: 'Road closed', percent: -5 }),
    ]);
    expect(after.nights[0]!.suggestedPercent).toBe(-5);

    // A new booking changes what the rules see: the review is kept but no longer current.
    await repos.bookings.createBooking(
      booking({ id: 'bk_new', roomId: 'r1', checkIn: '2026-05-20', checkOut: '2026-05-21' }),
    );
    const changed = await service.outlook(3, null);
    expect(changed.review.current).toBe(false);
    expect(changed.nights[0]!.suggestedPercent).toBe(-5);
  });
});
