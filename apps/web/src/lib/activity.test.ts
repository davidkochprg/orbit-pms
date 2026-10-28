import { describe, expect, it } from 'vitest';
import { activityDetail, activityLabel } from './activity';

describe('activityLabel', () => {
  it('names known actions and falls back to the raw action', () => {
    expect(activityLabel('folio.payment')).toBe('Took a payment');
    expect(activityLabel('something.new')).toBe('something.new');
  });
});

describe('activityDetail', () => {
  it('says which guest-book fields changed, or that a scan filled them, never the values', () => {
    expect(
      activityDetail('booking.update_guest', {
        stayGuestId: 'sg_1',
        fields: ['nationality', 'dateOfBirth'],
      }),
    ).toBe('Changed nationality, date of birth');
    expect(
      activityDetail('booking.add_guest', { stayGuestId: 'sg_2', fields: [], scanned: true }),
    ).toBe('From an ID scan');
    expect(activityDetail('booking.add_guest', { stayGuestId: 'sg_2', fields: [] })).toBe(null);
  });

  it('summarises money, status and changed fields', () => {
    expect(activityDetail('folio.payment', { amount: 4500, method: 'bank_transfer' })).toBe(
      '$4,500 by bank transfer',
    );
    expect(activityDetail('folio.charge', { label: 'Sauna', amount: 300 })).toBe('Sauna, $300');
    expect(activityDetail('room.status', { from: 'dirty', to: 'out_of_order' })).toBe(
      'dirty → out of order',
    );
    expect(activityDetail('booking.change_dates', { total: { from: 2000, to: 3000 } })).toBe(
      'Total $2,000 → $3,000',
    );
    expect(activityDetail('settings.pricing', { by: 'x', changed: ['cityTax', 'dog'] })).toBe(
      'Changed city tax, dog',
    );
  });

  it('shows nothing for payloads without a detail', () => {
    expect(activityDetail('booking.confirm', { from: 'hold', to: 'confirmed' })).toBeNull();
    expect(activityDetail('booking.update', { total: { from: 1, to: 1 }, changed: [] })).toBeNull();
    expect(activityDetail('guest.create', null)).toBeNull();
  });
});
