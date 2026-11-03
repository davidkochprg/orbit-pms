import {
  type Attachment,
  type AuditActor,
  type Contact,
  type Currency,
  formatMoney,
  type HousekeepingTask,
  type InvoiceScan,
  type InvoiceScanPhoneView,
  isoDateSchema,
  type IsoDate,
  type PaySupplierInvoiceBody,
  type PricingConfig,
  type Room,
  type SupplierInvoice,
  type SupplierInvoiceBody,
  type SupplierInvoicePatch,
  type SupplierInvoiceReading,
  type SupplierInvoiceSource,
  type SupplierInvoiceStatus,
  type SupplierInvoiceView,
} from '@orbit/shared';
import { addDays, hotelToday } from './dates';
import { DomainError } from './errors';
import { currentPricing } from './rates';
import type { Repositories } from './repositories';
import { normalizeText } from './text';

function isoDate(value: string | null): IsoDate | null {
  return value !== null && isoDateSchema.safeParse(value).success ? value : null;
}

const tidy = (value: string | null, max: number) =>
  value?.trim().replace(/\s+/g, ' ').slice(0, max) || null;

/** Whole units, rounded half up from what was printed; null for no amount. */
function wholeUnits(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? Math.round(value) : null;
}

/**
 * The contact a bill is from: the one whose email sent it or is printed on it, or else the one
 * whose name it carries. Null when none matches clearly.
 */
export function matchContact(
  reading: Pick<SupplierInvoiceReading, 'supplierName' | 'supplierEmail'>,
  contacts: Contact[],
  senderAddress: string | null = null,
): Contact | null {
  const emails = [senderAddress, reading.supplierEmail]
    .filter((e): e is string => !!e)
    .map((e) => e.trim().toLowerCase());
  const byEmail = contacts.find((c) => c.email && emails.includes(c.email.toLowerCase()));
  if (byEmail) return byEmail;
  if (!reading.supplierName) return null;
  const printed = normalizeText(reading.supplierName);
  const byName = contacts.filter((c) => {
    const name = normalizeText(c.name);
    return name.length >= 4 && (printed.includes(name) || name.includes(printed));
  });
  return byName.length === 1 ? byName[0]! : null;
}

/** The repair a contact's bill is most likely for: their newest one, open ones first. */
export function repairFor(contactId: string, tasks: HousekeepingTask[]): HousekeepingTask | null {
  const theirs = tasks
    .filter((t) => t.type === 'maintenance' && t.contactId === contactId)
    .sort(
      (a, b) =>
        Number(b.status !== 'done') - Number(a.status !== 'done') ||
        b.createdAt.localeCompare(a.createdAt),
    );
  return theirs[0] ?? null;
}

export interface ReadingContext {
  today: IsoDate;
  currency: Currency;
  contacts: Contact[];
  tasks: HousekeepingTask[];
  existing: SupplierInvoice[];
  /** Who emailed it, when it came by email. */
  senderAddress: string | null;
}

/**
 * Turns what the model read into a bill for staff to check. Anything malformed is dropped rather
 * than guessed; amounts are rounded to whole units; the contact and repair are matched; and what
 * staff should look at (no total, another currency, a likely duplicate) becomes a warning.
 */
export function checkSupplierReading(
  reading: SupplierInvoiceReading,
  ctx: ReadingContext,
): Omit<SupplierInvoice, 'id' | 'file' | 'source' | 'inquiryId' | 'createdAt'> {
  const warnings: string[] = [];
  const contact = matchContact(reading, ctx.contacts, ctx.senderAddress);
  const supplierName = tidy(reading.supplierName, 120) ?? contact?.name ?? null;
  if (!supplierName) warnings.push("Who it is from wasn't found. Add the supplier.");

  const total = wholeUnits(reading.total);
  if (total === null || total < 0) warnings.push("No total was found. Enter what's to pay.");
  else if (reading.total !== total) {
    warnings.push(`The total ${reading.total} is rounded to ${formatMoney(total, ctx.currency)}.`);
  }
  const printedCurrency = reading.currency?.trim().toUpperCase();
  if (printedCurrency && printedCurrency !== ctx.currency) {
    warnings.push(`The amounts are in ${printedCurrency}, not ${ctx.currency}.`);
  }

  const issuedOn = isoDate(reading.issuedOn);
  let dueOn = isoDate(reading.dueOn);
  if (issuedOn && dueOn && dueOn < issuedOn) {
    warnings.push('The due date was before the issue date, so it was left out.');
    dueOn = null;
  }
  const number = tidy(reading.number, 60);
  const duplicate =
    number &&
    ctx.existing.find(
      (i) =>
        i.number === number &&
        (i.contactId === (contact?.id ?? null) ||
          normalizeText(i.supplierName) === normalizeText(supplierName ?? '')),
    );
  if (duplicate) warnings.push(`Bill ${number} from this supplier is already in the list.`);

  const tax = wholeUnits(reading.tax);
  return {
    status: 'to_review',
    contactId: contact?.id ?? null,
    supplierName: supplierName ?? 'Unknown supplier',
    supplierTaxId: tidy(reading.supplierTaxId, 40),
    number,
    issuedOn,
    dueOn,
    currency: ctx.currency,
    total: total !== null && total >= 0 ? total : 0,
    tax: tax !== null && tax >= 0 ? tax : null,
    lines: reading.lines.slice(0, 20).flatMap((l) => {
      const label = tidy(l.description, 200);
      return label ? [{ label, amount: wholeUnits(l.amount) }] : [];
    }),
    bankAccount: tidy(reading.bankAccount, 120),
    paymentReference: tidy(reading.paymentReference, 60),
    taskId: contact ? (repairFor(contact.id, ctx.tasks)?.id ?? null) : null,
    note: null,
    warnings,
    paidOn: null,
    paidMethod: null,
  };
}

/** "Bathroom tap is dripping · Room 203". */
export function repairLabel(task: HousekeepingTask, rooms: Room[]): string {
  const room = rooms.find((r) => r.id === task.roomId);
  return [task.notes ?? 'Repair', room && `Room ${room.name}`].filter(Boolean).join(' · ');
}

export function viewSupplierInvoice(
  invoice: SupplierInvoice,
  ctx: { contacts: Contact[]; tasks: HousekeepingTask[]; rooms: Room[]; today: IsoDate },
): SupplierInvoiceView {
  const task = invoice.taskId ? ctx.tasks.find((t) => t.id === invoice.taskId) : undefined;
  return {
    ...invoice,
    contactName: ctx.contacts.find((c) => c.id === invoice.contactId)?.name ?? null,
    repairLabel: task ? repairLabel(task, ctx.rooms) : null,
    overdue: invoice.status === 'unpaid' && invoice.dueOn !== null && invoice.dueOn < ctx.today,
  };
}

const unreadable =
  "Couldn't read a bill in that file. Take the photo again with the whole page in view, or type it in.";

const tooSlow = 'Reading the photo took too long. Take it again.';

/** How long a photo may be read before the scan counts as failed (see `ID_SCAN_READ_TIMEOUT_MS`). */
export const INVOICE_SCAN_READ_TIMEOUT_MS = 90_000;

/** A scan as it stands at `now`: a read that ran past the timeout has failed. */
export function settleInvoiceScan(scan: InvoiceScan, now: Date): InvoiceScan {
  if (scan.status !== 'reading') return scan;
  const since = scan.readingSince ? new Date(scan.readingSince).getTime() : 0;
  if (now.getTime() - since <= INVOICE_SCAN_READ_TIMEOUT_MS) return scan;
  return { ...scan, status: 'failed', error: tooSlow, readingSince: null };
}

export interface SupplierInvoiceDeps {
  repos: Repositories;
  /** For the currency until a manager saves rates. */
  pricing: PricingConfig;
  /** How long a phone scan link stays open. */
  scanMinutes: number;
  clock: () => Date;
  newId: (prefix: string) => string;
  /** An unguessable token; it is the only key to a phone scan link. */
  newToken: () => string;
}

/** Where a read file came from. */
export interface ReadSource {
  source: Exclude<SupplierInvoiceSource, 'manual'>;
  /** A new file to keep, or one already kept, e.g. attached to an email. */
  file: { name: string; contentType: string; bytes: Uint8Array } | Attachment | null;
  /** The email it came with, and who sent it. */
  inquiryId: string | null;
  senderAddress: string | null;
}

/**
 * Bills from suppliers and contractors. Orbit reads a photo or PDF into a bill to check; once
 * checked it is a bill to pay until marked paid. The file is kept with the mailbox's files. Every
 * change is audited on the bill.
 */
/** What the supplier printed on a bill: read from the file, then checked, then left alone. */
const printedFields = [
  'supplierName',
  'supplierTaxId',
  'number',
  'issuedOn',
  'dueOn',
  'total',
  'tax',
  'bankAccount',
  'paymentReference',
] as const;

/**
 * The printed fields a patch would change. Once a bill is checked only the hotel's own links,
 * its contact, repair and note, can change.
 */
export function printedChanges(
  invoice: SupplierInvoice,
  patch: Partial<Pick<SupplierInvoice, (typeof printedFields)[number]>>,
): string[] {
  return printedFields.filter((f) => patch[f] !== undefined && patch[f] !== invoice[f]);
}

export function createSupplierInvoiceService({
  repos,
  pricing,
  scanMinutes,
  clock,
  newId,
  newToken,
}: SupplierInvoiceDeps) {
  const today = () => hotelToday(clock());

  async function load(r: Repositories, id: string): Promise<SupplierInvoice> {
    const invoice = await r.supplierInvoices.get(id);
    if (!invoice) throw new DomainError('not_found', `Bill ${id} not found`);
    return invoice;
  }

  async function context(r: Repositories) {
    const [contacts, tasks, rooms] = await Promise.all([
      r.contacts.list(),
      r.housekeeping.listTasks(),
      r.rooms.listRooms(),
    ]);
    return { contacts, tasks, rooms, today: today() };
  }

  /** Throws unless the contact and repair a bill points to exist. */
  async function assertLinks(
    r: Repositories,
    { contactId, taskId }: { contactId?: string | null; taskId?: string | null },
  ) {
    if (contactId && !(await r.contacts.get(contactId))) {
      throw new DomainError('not_found', `Contact ${contactId} not found`);
    }
    if (taskId) {
      const task = await r.housekeeping.getTask(taskId);
      if (task?.type !== 'maintenance') {
        throw new DomainError('not_found', `Repair ${taskId} not found`);
      }
    }
  }

  function planCreate(body: SupplierInvoiceBody, currency: Currency): SupplierInvoice {
    if (body.issuedOn && body.dueOn && body.dueOn < body.issuedOn) {
      throw new DomainError('invalid_input', 'The due date is before the issue date');
    }
    return {
      id: newId('sinv'),
      status: 'unpaid',
      ...body,
      currency,
      lines: [],
      file: null,
      source: 'manual',
      inquiryId: null,
      warnings: [],
      paidOn: null,
      paidMethod: null,
      createdAt: clock().toISOString(),
    };
  }

  async function planUpdate(r: Repositories, id: string, patch: SupplierInvoicePatch) {
    const invoice = await load(r, id);
    await assertLinks(r, patch);
    const { checked, ...fields } = patch;
    const printed = printedChanges(invoice, fields);
    if (invoice.status !== 'to_review' && printed.length > 0) {
      throw new DomainError(
        'invalid_transition',
        `The bill is checked, so what the supplier printed (${printed.join(', ')}) stays as it is. Delete it and add it again to correct it.`,
      );
    }
    const updated: SupplierInvoice = {
      ...invoice,
      ...fields,
      ...(checked && invoice.status === 'to_review' && { status: 'unpaid', warnings: [] }),
    };
    if (updated.issuedOn && updated.dueOn && updated.dueOn < updated.issuedOn) {
      throw new DomainError('invalid_input', 'The due date is before the issue date');
    }
    if (JSON.stringify(updated) === JSON.stringify(invoice)) {
      throw new DomainError('invalid_input', 'Nothing to change');
    }
    return { invoice, updated };
  }

  async function planPay(r: Repositories, id: string, body: PaySupplierInvoiceBody) {
    const invoice = await load(r, id);
    if (invoice.status === 'paid') {
      throw new DomainError('invalid_transition', `Already paid on ${invoice.paidOn}`);
    }
    const paidOn = body.paidOn ?? today();
    if (paidOn > addDays(today(), 1)) {
      throw new DomainError('invalid_input', 'The payment date is in the future');
    }
    const paid: SupplierInvoice = {
      ...invoice,
      status: 'paid',
      warnings: [],
      paidOn,
      paidMethod: body.method,
    };
    return { invoice, paid };
  }

  async function audit(
    r: Repositories,
    actor: AuditActor,
    action: string,
    invoice: SupplierInvoice,
    extra: Record<string, unknown> = {},
  ) {
    await r.audit.append({
      actor,
      action,
      subjectId: invoice.id,
      payload: {
        supplierName: invoice.supplierName,
        number: invoice.number,
        total: invoice.total,
        ...extra,
      },
    });
  }

  async function loadScan(id: string): Promise<InvoiceScan> {
    const scan = await repos.invoiceScans.get(id);
    const now = clock();
    if (!scan || scan.expiresAt <= now.toISOString()) {
      throw new DomainError('not_found', 'This scan link has expired. Open a new one at the desk.');
    }
    return settleInvoiceScan(scan, now);
  }

  const service = {
    /** Newest first; bills to check, then to pay, then paid. */
    async list(filter: { status?: SupplierInvoiceStatus } = {}): Promise<SupplierInvoiceView[]> {
      const [invoices, ctx] = await Promise.all([
        repos.supplierInvoices.list(filter.status ? { status: [filter.status] } : {}),
        context(repos),
      ]);
      const order: Record<SupplierInvoiceStatus, number> = { to_review: 0, unpaid: 1, paid: 2 };
      return invoices
        .map((i) => viewSupplierInvoice(i, ctx))
        .sort((a, b) => order[a.status] - order[b.status]);
    },

    async get(id: string): Promise<SupplierInvoiceView> {
      return viewSupplierInvoice(await load(repos, id), await context(repos));
    },

    /** Checks a bill typed in against current data without saving it. */
    async previewCreate(body: SupplierInvoiceBody): Promise<SupplierInvoice> {
      await assertLinks(repos, body);
      return planCreate(body, (await currentPricing(repos, pricing)).currency);
    },

    /** A bill typed in by hand: checked already, so it goes straight to the bills to pay. */
    async create(body: SupplierInvoiceBody, actor: AuditActor): Promise<SupplierInvoice> {
      return repos.transaction(async (tx) => {
        await assertLinks(tx, body);
        const invoice = planCreate(body, (await currentPricing(tx, pricing)).currency);
        await tx.supplierInvoices.save(invoice);
        await audit(tx, actor, 'supplier_invoice.create', invoice);
        return invoice;
      });
    },

    /**
     * A bill from what the model read, for staff to check. The file is kept so the bill can be
     * compared with it. Throws when the model found no bill.
     */
    async fromReading(
      reading: SupplierInvoiceReading,
      from: ReadSource,
      actor: AuditActor,
    ): Promise<SupplierInvoice> {
      if (!reading.readable) throw new DomainError('invalid_input', unreadable);
      return repos.transaction(async (tx) => {
        const ctx = await context(tx);
        const checked = checkSupplierReading(reading, {
          ...ctx,
          currency: (await currentPricing(tx, pricing)).currency,
          existing: await tx.supplierInvoices.list(),
          senderAddress: from.senderAddress,
        });
        let file: Attachment | null = null;
        if (from.file && !('bytes' in from.file)) file = from.file;
        else if (from.file) {
          file = {
            id: newId('att'),
            name: from.file.name,
            contentType: from.file.contentType,
            size: from.file.bytes.length,
          };
          await tx.mail.saveAttachment(file, from.file.bytes);
        }
        const invoice: SupplierInvoice = {
          id: newId('sinv'),
          ...checked,
          file,
          source: from.source,
          inquiryId: from.inquiryId,
          createdAt: clock().toISOString(),
        };
        await tx.supplierInvoices.save(invoice);
        await audit(tx, actor, 'supplier_invoice.read', invoice, { source: from.source });
        return invoice;
      });
    },

    /** Checks a correction against current data without saving it. */
    previewUpdate: (id: string, patch: SupplierInvoicePatch) => planUpdate(repos, id, patch),

    /** Corrects a bill; `checked` moves one Orbit read to the bills to pay. */
    async update(
      id: string,
      patch: SupplierInvoicePatch,
      actor: AuditActor,
    ): Promise<SupplierInvoice> {
      return repos.transaction(async (tx) => {
        const { updated } = await planUpdate(tx, id, patch);
        await tx.supplierInvoices.save(updated);
        await audit(tx, actor, 'supplier_invoice.update', updated, {
          changed: Object.keys(patch),
        });
        return updated;
      });
    },

    previewPay: (id: string, body: PaySupplierInvoiceBody) => planPay(repos, id, body),

    async pay(
      id: string,
      body: PaySupplierInvoiceBody,
      actor: AuditActor,
    ): Promise<SupplierInvoice> {
      return repos.transaction(async (tx) => {
        const { paid } = await planPay(tx, id, body);
        await tx.supplierInvoices.save(paid);
        await audit(tx, actor, 'supplier_invoice.pay', paid, { method: body.method });
        return paid;
      });
    },

    /** Checks a removal without making it. */
    previewRemove: (id: string) => load(repos, id),

    async remove(id: string, actor: AuditActor): Promise<void> {
      await repos.transaction(async (tx) => {
        const invoice = await load(tx, id);
        await tx.supplierInvoices.delete(id);
        await audit(tx, actor, 'supplier_invoice.remove', invoice);
      });
    },

    /** The document a bill was read from. */
    async file(id: string) {
      const invoice = await load(repos, id);
      const file = invoice.file && (await repos.mail.readAttachment(invoice.file.id));
      if (!file) throw new DomainError('not_found', 'This bill has no file');
      return file;
    },

    /** Bills to check, and bills to pay that are late or due within a week, for Today. */
    async due() {
      const views = await service.list();
      const soon = addDays(today(), 7);
      return {
        toReview: views.filter((i) => i.status === 'to_review'),
        overdue: views.filter((i) => i.overdue),
        dueSoon: views.filter(
          (i) => i.status === 'unpaid' && !i.overdue && i.dueOn !== null && i.dueOn <= soon,
        ),
      };
    },

    /** Opens a link for photographing a bill with a phone. */
    async startScan(): Promise<InvoiceScan> {
      const now = clock();
      await repos.invoiceScans.deleteExpired(now.toISOString());
      const scan: InvoiceScan = {
        id: newToken(),
        status: 'waiting',
        supplierInvoiceId: null,
        error: null,
        readingSince: null,
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + scanMinutes * 60_000).toISOString(),
      };
      await repos.invoiceScans.save(scan);
      return scan;
    },

    /** The scan with the bill it became, for the desk that opened it. */
    getScan: loadScan,

    async getScanForPhone(id: string): Promise<InvoiceScanPhoneView> {
      const { status, error, expiresAt } = await loadScan(id);
      return { status, error, expiresAt };
    },

    /** Marks a photo as being read; a retake is fine, two uploads at once are not. */
    async beginScan(id: string): Promise<void> {
      const scan = await loadScan(id);
      if (scan.status === 'reading') {
        throw new DomainError('conflict', 'A photo is already being read. Wait a moment.');
      }
      await repos.invoiceScans.save({
        ...scan,
        status: 'reading',
        error: null,
        readingSince: clock().toISOString(),
      });
    },

    async completeScan(id: string, supplierInvoiceId: string): Promise<void> {
      const scan = await loadScan(id);
      await repos.invoiceScans.save({
        ...scan,
        status: 'done',
        supplierInvoiceId,
        error: null,
        readingSince: null,
      });
    },

    async failScan(id: string, error: string): Promise<void> {
      const scan = await loadScan(id);
      await repos.invoiceScans.save({ ...scan, status: 'failed', error, readingSince: null });
    },
  };
  return service;
}

export type SupplierInvoiceService = ReturnType<typeof createSupplierInvoiceService>;
