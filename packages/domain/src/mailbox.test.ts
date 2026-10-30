import { describe, expect, it } from 'vitest';
import { attachmentName, createMailboxService } from './mailbox';
import { conversation, createMemoryRepositories } from './testing';

const now = new Date('2026-05-10T08:00:00Z');

function setup() {
  const repos = createMemoryRepositories({ inquiries: [conversation({ id: 'inq_1' })] }, () => now);
  let n = 0;
  const mailbox = createMailboxService({ repos, clock: () => now, newId: (p) => `${p}_${++n}` });
  return { repos, mailbox };
}

const emptyDraft = {
  inquiryId: null,
  forwardOf: null,
  to: [],
  cc: [],
  bcc: [],
  subject: '',
  body: '',
  attachmentIds: [],
};

describe('labels', () => {
  it('creates, renames and deletes labels, taking a deleted one off conversations', async () => {
    const { repos, mailbox } = setup();
    const groups = await mailbox.createLabel({ name: 'Groups', color: 'blue' });
    await mailbox.createLabel({ name: 'Agencies', color: 'gray' });
    expect((await mailbox.listLabels()).map((l) => l.name)).toEqual(['Agencies', 'Groups']);
    await expect(mailbox.createLabel({ name: 'groups', color: 'red' })).rejects.toThrow(
      'already a label',
    );
    expect(await mailbox.updateLabel(groups.id, { name: 'Group stays', color: 'green' })).toEqual({
      id: groups.id,
      name: 'Group stays',
      color: 'green',
    });
    repos.state.inquiries[0] = { ...repos.state.inquiries[0]!, labelIds: [groups.id] };
    await mailbox.deleteLabel(groups.id);
    expect(repos.state.inquiries[0]?.labelIds).toEqual([]);
    await expect(mailbox.deleteLabel(groups.id)).rejects.toThrow('not found');
  });
});

describe('drafts', () => {
  it('saves a draft under the ID the app made, with its files, and replaces it', async () => {
    const { mailbox } = setup();
    const file = await mailbox.addAttachment({
      name: 'menu.pdf',
      contentType: 'application/pdf',
      bytes: new Uint8Array([1, 2, 3]),
    });
    const draft = await mailbox.saveDraft('drf_abc123', {
      ...emptyDraft,
      inquiryId: 'inq_1',
      body: 'Dear guest',
      attachmentIds: [file.id],
    });
    expect(draft).toMatchObject({
      id: 'drf_abc123',
      inquiryId: 'inq_1',
      body: 'Dear guest',
      attachments: [file],
      updatedAt: now.toISOString(),
    });
    await mailbox.saveDraft('drf_abc123', { ...emptyDraft, inquiryId: 'inq_1', body: 'Dear' });
    expect(await mailbox.listDrafts()).toEqual([
      expect.objectContaining({ body: 'Dear', attachments: [] }),
    ]);
    await mailbox.deleteDraft('drf_abc123');
    expect(await mailbox.listDrafts()).toEqual([]);
    await expect(mailbox.deleteDraft('drf_abc123')).rejects.toThrow('not found');
  });

  it('refuses a bad ID or a conversation that does not exist', async () => {
    const { mailbox } = setup();
    await expect(mailbox.saveDraft('../x', emptyDraft)).rejects.toThrow('Invalid draft ID');
    await expect(
      mailbox.saveDraft('drf_abc123', { ...emptyDraft, forwardOf: 'inq_x' }),
    ).rejects.toThrow('not found');
  });
});

describe('attachments', () => {
  it('keeps a file and reads it back, refusing empty or oversized ones', async () => {
    const { mailbox } = setup();
    const file = await mailbox.addAttachment({
      name: 'C:\\Users\\desk\\invoice.pdf',
      contentType: 'weird type',
      bytes: new Uint8Array([7, 8]),
    });
    expect(file).toEqual({
      id: 'att_1',
      name: 'invoice.pdf',
      contentType: 'application/octet-stream',
      size: 2,
    });
    expect(Array.from((await mailbox.readAttachment(file.id)).bytes)).toEqual([7, 8]);
    await expect(
      mailbox.addAttachment({ name: 'x', contentType: 'text/plain', bytes: new Uint8Array() }),
    ).rejects.toThrow('empty');
    await expect(
      mailbox.addAttachment({
        name: 'big',
        contentType: 'text/plain',
        bytes: new Uint8Array(4 * 1024 * 1024 + 1),
      }),
    ).rejects.toThrow('4 MB');
    await expect(mailbox.readAttachment('att_x')).rejects.toThrow('not found');
  });

  it('names a file by its own name, without a path or control characters', () => {
    expect(attachmentName('/tmp/a/b.png')).toBe('b.png');
    expect(attachmentName('\u0007 ')).toBe('file');
  });
});
