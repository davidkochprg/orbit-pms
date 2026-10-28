import type { Guest, IdDocumentReading } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { checkReading, createIdScanService, tidyName } from './id-scan';
import { hotelPolicy } from './policy';
import { booking, room } from './test-fixtures';
import { createMemoryRepositories } from './testing';

const today = '2026-05-10';

const reading: IdDocumentReading = {
  readable: true,
  documentType: 'passport',
  fullName: 'ANNA MARIA MÜLLER-LÜDENSCHEID',
  nationality: 'de',
  dateOfBirth: '1985-03-14',
  documentNumber: 'C01X 00T47',
  address: null,
  expiresOn: '2031-01-01',
};

describe('tidyName', () => {
  it('title-cases names printed in capitals and keeps mixed case as it is', () => {
    expect(tidyName('ANNA MARIA MÜLLER-LÜDENSCHEID')).toBe('Anna Maria Müller-Lüdenscheid');
    expect(tidyName("  SEÁN  O'BRIEN ")).toBe("Seán O'Brien");
    expect(tidyName('Jan van der Berg')).toBe('Jan van der Berg');
  });
});

describe('checkReading', () => {
  it('normalizes what the model read', () => {
    expect(checkReading(reading, today)).toEqual({
      name: 'Anna Maria Müller-Lüdenscheid',
      nationality: 'DE',
      dateOfBirth: '1985-03-14',
      documentType: 'passport',
      documentNumber: 'C01X00T47',
      address: null,
      expiresOn: '2031-01-01',
      warnings: [],
    });
  });

  it('drops malformed values instead of guessing', () => {
    const result = checkReading(
      {
        ...reading,
        nationality: 'DEU',
        dateOfBirth: '14.03.1985',
        documentNumber: 'X',
        expiresOn: '2031-02-30',
      },
      today,
    );
    expect(result).toMatchObject({
      nationality: null,
      dateOfBirth: null,
      documentNumber: null,
      expiresOn: null,
    });
  });

  it('flags an expired document, a future birth date and a document that is not an ID', () => {
    const result = checkReading(
      { ...reading, documentType: 'other', dateOfBirth: '2027-01-01', expiresOn: '2026-05-09' },
      today,
    );
    expect(result.dateOfBirth).toBe(null);
    expect(result.documentType).toBe(null);
    expect(result.warnings).toEqual([
      'The date of birth is not in the past.',
      'The document expired on 2026-05-09.',
      'This is not an ID card or passport. Ask for one of those.',
    ]);
  });
});

describe('createIdScanService', () => {
  const guest: Guest = {
    id: 'g',
    name: 'Anna Example',
    email: null,
    phone: null,
    language: 'de',
    notes: null,
  };

  function setup() {
    let at = new Date('2026-05-10T08:00:00Z');
    const repos = createMemoryRepositories({
      guests: [guest],
      rooms: [room('rm_1', { name: '12' })],
      bookings: [
        booking({ id: 'bk', roomId: 'rm_1', guestId: 'g' }),
        booking({ id: 'gone', roomId: 'rm_1', guestId: 'g', status: 'cancelled' }),
      ],
    });
    let n = 0;
    const scans = createIdScanService({
      repos,
      policy: hotelPolicy,
      clock: () => at,
      newToken: () => `tok${++n}`,
    });
    return {
      repos,
      scans,
      advance: (minutes: number) => (at = new Date(at.getTime() + minutes * 60_000)),
    };
  }

  it('opens a scan, shows the phone only the first name and room, and gives the desk the result', async () => {
    const { scans } = setup();
    const scan = await scans.start('bk', 'sg_bk');
    expect(scan).toMatchObject({
      id: 'tok1',
      status: 'waiting',
      expiresAt: '2026-05-10T08:15:00.000Z',
    });
    expect(await scans.getForPhone('tok1')).toEqual({
      status: 'waiting',
      firstName: 'Anna',
      roomName: '12',
      error: null,
      expiresAt: '2026-05-10T08:15:00.000Z',
    });
    await scans.beginReading('tok1');
    await expect(scans.beginReading('tok1')).rejects.toMatchObject({ code: 'conflict' });
    await scans.complete('tok1', reading);
    const done = await scans.getForDesk('bk', 'tok1');
    expect(done).toMatchObject({ status: 'done', result: { nationality: 'DE' } });
    expect(await scans.getForPhone('tok1')).not.toHaveProperty('result');
  });

  it('fails a photo without a readable ID and lets the phone retake it', async () => {
    const { scans } = setup();
    await scans.start('bk', null);
    await scans.beginReading('tok1');
    const failed = await scans.complete('tok1', { ...reading, readable: false });
    expect(failed.status).toBe('failed');
    expect(failed.error).toMatch(/Couldn't read an ID/);
    await scans.beginReading('tok1');
    expect((await scans.complete('tok1', reading)).status).toBe('done');
  });

  it('expires links and cleans up expired scans when the next one opens', async () => {
    const { repos, scans, advance } = setup();
    await scans.start('bk', null);
    advance(15);
    await expect(scans.getForPhone('tok1')).rejects.toMatchObject({ code: 'not_found' });
    await scans.start('bk', null);
    expect(repos.state.idScans.map((s) => s.id)).toEqual(['tok2']);
  });

  it('refuses cancelled bookings, unknown guests and another booking asking for the result', async () => {
    const { scans } = setup();
    await expect(scans.start('gone', null)).rejects.toMatchObject({ code: 'invalid_transition' });
    await expect(scans.start('bk', 'sg_nope')).rejects.toMatchObject({ code: 'not_found' });
    await scans.start('bk', null);
    await expect(scans.getForDesk('gone', 'tok1')).rejects.toMatchObject({ code: 'not_found' });
  });
});
