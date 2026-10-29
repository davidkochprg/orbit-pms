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
});
