import type { Guest } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { assertUniqueGuestEmail, createGuestService } from './guests';
import { createMemoryRepositories } from './testing';

const guest: Guest = {
  id: 'gst_1',
  name: 'Known Guest',
  email: 'Known@Example.com',
  phone: null,
  language: 'de',
  notes: null,
};

function setup() {
  const repos = createMemoryRepositories({ guests: [guest] });
  let n = 0;
  return { repos, service: createGuestService({ repos, newId: (p) => `${p}_${++n}` }) };
}

describe('assertUniqueGuestEmail', () => {
  it('rejects an email another guest has, ignoring case', () => {
    expect(() => assertUniqueGuestEmail([guest], 'known@example.com')).toThrow(
      'known@example.com already belongs to Known Guest',
    );
    expect(() => assertUniqueGuestEmail([guest], 'known@example.com', 'gst_1')).not.toThrow();
    expect(() => assertUniqueGuestEmail([guest], null)).not.toThrow();
  });
});

describe('createGuestService', () => {
  it('creates a guest and audits it', async () => {
    const { repos, service } = setup();
    const created = await service.create(
      { name: 'New Guest', email: null, phone: '+420 000 000 000', language: 'cs', notes: null },
      'user',
    );
    expect(created).toMatchObject({ id: 'gst_1', name: 'New Guest' });
    expect(repos.state.guests).toHaveLength(2);
    expect(repos.state.audit).toEqual([
      expect.objectContaining({ action: 'guest.create', subjectId: created.id }),
    ]);
  });

  it('edits a guest and audits the changed fields', async () => {
    const { repos, service } = setup();
    const updated = await service.update('gst_1', { phone: '+49 000', language: 'de' }, 'user');
    expect(updated.phone).toBe('+49 000');
    expect(repos.state.audit[0]).toMatchObject({
      action: 'guest.update',
      payload: { changed: ['phone'] },
    });
  });

  it('refuses a duplicate email and unknown guests, and skips no-op edits', async () => {
    const { repos, service } = setup();
    await expect(
      service.create(
        { name: 'Copy', email: 'KNOWN@example.com', phone: null, language: 'en', notes: null },
        'user',
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
    await expect(service.update('nope', { name: 'X' }, 'user')).rejects.toMatchObject({
      code: 'not_found',
    });
    await service.update('gst_1', { name: 'Known Guest' }, 'user');
    expect(repos.state.audit).toEqual([]);
  });
});
