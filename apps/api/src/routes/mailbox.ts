import type { InboxService, MailboxService } from '@orbit/domain';
import {
  bulkBodySchema,
  draftBodySchema,
  labelBodySchema,
  labelsBodySchema,
  MAX_ATTACHMENT_BYTES,
  starBodySchema,
  trashBodySchema,
} from '@orbit/shared';
import { Hono } from 'hono';
import { errorBody } from '../http';
import { validate } from '../validate';

/** Files a browser may show in place. Anything else downloads, so an uploaded page can't run. */
const INLINE = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp']);

/** Multipart overhead on top of the file itself. */
const FORM_SLACK = 64 * 1024;

/**
 * The mailbox around the conversations: labels, drafts, attached files, stars, the trash and
 * changes to many conversations at once. Registered before `/inbox/:id`, so these paths win.
 */
export function mailboxRoutes({
  inbox,
  mailbox,
}: {
  inbox: InboxService;
  mailbox: MailboxService;
}) {
  return new Hono()
    .get('/inbox/labels', async (c) => c.json(await mailbox.listLabels()))
    .post('/inbox/labels', validate('json', labelBodySchema), async (c) =>
      c.json(await mailbox.createLabel(c.req.valid('json')), 201),
    )
    .put('/inbox/labels/:id', validate('json', labelBodySchema), async (c) =>
      c.json(await mailbox.updateLabel(c.req.param('id'), c.req.valid('json'))),
    )
    .delete('/inbox/labels/:id', async (c) => {
      await mailbox.deleteLabel(c.req.param('id'));
      return c.body(null, 204);
    })
    .get('/inbox/drafts', async (c) => c.json(await mailbox.listDrafts()))
    .put('/inbox/drafts/:id', validate('json', draftBodySchema), async (c) =>
      c.json(await mailbox.saveDraft(c.req.param('id'), c.req.valid('json'))),
    )
    .delete('/inbox/drafts/:id', async (c) => {
      await mailbox.deleteDraft(c.req.param('id'));
      return c.body(null, 204);
    })
    .post('/inbox/attachments', async (c) => {
      if (Number(c.req.header('content-length') ?? 0) > MAX_ATTACHMENT_BYTES + FORM_SLACK) {
        return c.json(errorBody('too_large', 'Files can be up to 4 MB.'), 413);
      }
      const form = await c.req.formData().catch(() => null);
      const file = form?.get('file');
      if (!(file instanceof File)) {
        return c.json(errorBody('invalid_input', 'Send the file as "file".'), 400);
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        return c.json(errorBody('too_large', 'Files can be up to 4 MB.'), 413);
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      return c.json(
        await mailbox.addAttachment({ name: file.name, contentType: file.type, bytes }),
        201,
      );
    })
    .get('/inbox/attachments/:id', async (c) => {
      const { attachment, bytes } = await mailbox.readAttachment(c.req.param('id'));
      const inline = INLINE.has(attachment.contentType) && c.req.query('download') === undefined;
      const name = encodeURIComponent(attachment.name);
      return c.body(new Uint8Array(bytes), 200, {
        'content-type': inline ? attachment.contentType : 'application/octet-stream',
        'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${name}`,
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
      });
    })
    .post('/inbox/bulk', validate('json', bulkBodySchema), async (c) =>
      c.json(await inbox.bulk(c.req.valid('json'), 'user')),
    )
    .post('/inbox/:id/star', validate('json', starBodySchema), async (c) =>
      c.json(await inbox.setStarred(c.req.param('id'), c.req.valid('json').starred)),
    )
    .post('/inbox/:id/trash', validate('json', trashBodySchema), async (c) =>
      c.json(await inbox.setTrashed(c.req.param('id'), c.req.valid('json').trashed, 'user')),
    )
    .post('/inbox/:id/labels', validate('json', labelsBodySchema), async (c) =>
      c.json(await inbox.setLabels(c.req.param('id'), c.req.valid('json').labelIds)),
    )
    .delete('/inbox/:id', async (c) => {
      await inbox.deleteForever(c.req.param('id'), 'user');
      return c.body(null, 204);
    });
}
