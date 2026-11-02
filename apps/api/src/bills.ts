import type { SupplierInvoiceReader } from '@orbit/ai';
import {
  DomainError,
  type InboxService,
  type MailboxService,
  type ReadSource,
  type SupplierInvoiceService,
} from '@orbit/domain';
import type { AuditActor, SupplierInvoice } from '@orbit/shared';
import { isPdf, pdfText } from './pdf/pdf-text';

const imageTypes: Record<string, (b: Uint8Array) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/webp': (b) =>
    String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...b.subarray(8, 12)) === 'WEBP',
};

/** What a file is, from its first bytes rather than what the browser said. */
export function billFileKind(bytes: Uint8Array, contentType: string): 'pdf' | 'photo' | null {
  if (isPdf(bytes)) return 'pdf';
  return imageTypes[contentType]?.(bytes) ? 'photo' : null;
}

/**
 * Reads a bill from a file: a PDF by its text with Muse Spark, a photo with the vision model.
 * The result goes to the domain as a bill to check. A scanned PDF has no text and has to be
 * photographed instead.
 */
export function createBillReader(
  reader: SupplierInvoiceReader,
  bills: SupplierInvoiceService,
  mail: { mailbox: Pick<MailboxService, 'readAttachment'>; inbox: Pick<InboxService, 'get'> },
) {
  const service = {
    photos: reader.photos,
    async read(
      file: { name: string; contentType: string; bytes: Uint8Array },
      from: Omit<ReadSource, 'file'> & { file?: ReadSource['file'] },
      actor: AuditActor,
    ): Promise<SupplierInvoice> {
      const kind = billFileKind(file.bytes, file.contentType);
      if (!kind) {
        throw new DomainError(
          'invalid_input',
          'Send the bill as a PDF, or a JPEG, PNG or WebP photo.',
        );
      }
      let reading;
      if (kind === 'pdf') {
        const text = await pdfText(file.bytes);
        if (!text) {
          throw new DomainError(
            'invalid_input',
            'This PDF is a scan with no text in it. Take a photo of the bill instead.',
          );
        }
        reading = await reader.read({ kind: 'text', text });
      } else {
        if (!reader.photos) {
          throw new DomainError(
            'invalid_input',
            'Reading photos needs a vision model (META_MODEL_VISION). Upload the PDF instead.',
          );
        }
        reading = await reader.read({
          kind: 'photo',
          bytes: file.bytes,
          mediaType: file.contentType,
        });
      }
      return bills.fromReading(
        reading,
        {
          ...from,
          file:
            from.file === undefined
              ? {
                  name: file.name,
                  contentType: kind === 'pdf' ? 'application/pdf' : file.contentType,
                  bytes: file.bytes,
                }
              : from.file,
        },
        actor,
      );
    },

    /** A file attached to an email, read as a bill from whoever sent the email. */
    async readAttachment(
      attachmentId: string,
      inquiryId: string | null,
      actor: AuditActor,
    ): Promise<SupplierInvoice> {
      const { attachment, bytes } = await mail.mailbox.readAttachment(attachmentId);
      const inquiry = inquiryId ? await mail.inbox.get(inquiryId) : null;
      return service.read(
        { name: attachment.name, contentType: attachment.contentType, bytes },
        {
          source: 'email',
          inquiryId,
          senderAddress: inquiry?.senderAddress ?? null,
          file: attachment,
        },
        actor,
      );
    },
  };
  return service;
}

export type BillReader = ReturnType<typeof createBillReader>;
