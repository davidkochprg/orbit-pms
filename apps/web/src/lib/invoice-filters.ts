import type { InvoiceView, SupplierInvoiceView } from '@orbit/shared';
import { addDaysIso } from '@/lib/tape-chart';

/** The documents the hotel issued, or the bills it was sent. */
export type InvoiceTab = 'issued' | 'bills';

/** Where an issued document stands. Unpaid includes overdue. */
export const issuedFolders = ['all', 'unpaid', 'overdue', 'paid', 'void'] as const;
export type IssuedFolder = (typeof issuedFolders)[number];

/** Where a bill stands. To pay includes overdue. */
export const billFolders = ['all', 'to_review', 'unpaid', 'overdue', 'paid'] as const;
export type BillFolder = (typeof billFolders)[number];

export const issuedFolderLabels: Record<IssuedFolder, string> = {
  all: 'All issued',
  unpaid: 'Unpaid',
  overdue: 'Overdue',
  paid: 'Paid',
  void: 'Void',
};

export const billFolderLabels: Record<BillFolder, string> = {
  all: 'All bills',
  to_review: 'To check',
  unpaid: 'To pay',
  overdue: 'Overdue',
  paid: 'Paid',
};

export const periods = ['any', 'this_month', 'last_month', 'last_90', 'this_year'] as const;
export type Period = (typeof periods)[number];

export const periodLabels: Record<Period, string> = {
  any: 'Any time',
  this_month: 'This month',
  last_month: 'Last month',
  last_90: 'Last 90 days',
  this_year: 'This year',
};

/** What narrows the list besides the folder. */
export interface DocumentFilter {
  query: string;
  period: Period;
  /** Whole units; null for no bound. */
  min: number | null;
  max: number | null;
  /** The supplier, or the buyer an issued document is made out to. */
  party: string | null;
}

export const noFilter: DocumentFilter = {
  query: '',
  period: 'any',
  min: null,
  max: null,
  party: null,
};

/** Whether anything besides the folder narrows the list. */
export function isFiltered(f: DocumentFilter): boolean {
  return (
    f.query.trim() !== '' ||
    f.period !== 'any' ||
    f.min !== null ||
    f.max !== null ||
    f.party !== null
  );
}

/** The first and last day of a period, inclusive; null for any time. */
export function periodRange(period: Period, today: string): [string, string] | null {
  const month = today.slice(0, 7);
  switch (period) {
    case 'any':
      return null;
    case 'this_month':
      return [`${month}-01`, today];
    case 'last_month': {
      const firstOfThis = `${month}-01`;
      const lastOfPrevious = addDaysIso(firstOfThis, -1);
      return [`${lastOfPrevious.slice(0, 7)}-01`, lastOfPrevious];
    }
    case 'last_90':
      return [addDaysIso(today, -89), today];
    case 'this_year':
      return [`${today.slice(0, 4)}-01-01`, today];
  }
}

/** Who an issued document is made out to, as the list and the rail name them. */
export function buyerOf(i: InvoiceView): string {
  return i.buyer.company ?? i.buyer.name;
}

/** The day a bill counts from: its issue date, or the day it arrived. */
export function billDate(b: SupplierInvoiceView): string {
  return b.issuedOn ?? b.createdAt.slice(0, 10);
}

export function issuedFolder(i: InvoiceView): Exclude<IssuedFolder, 'all'> {
  if (i.status === 'void') return 'void';
  if (i.settled) return 'paid';
  return i.overdue ? 'overdue' : 'unpaid';
}

export function inIssuedFolder(i: InvoiceView, folder: IssuedFolder): boolean {
  const at = issuedFolder(i);
  if (folder === 'all') return true;
  if (folder === 'unpaid') return at === 'unpaid' || at === 'overdue';
  return at === folder;
}

export function inBillFolder(b: SupplierInvoiceView, folder: BillFolder): boolean {
  if (folder === 'all') return true;
  if (folder === 'overdue') return b.overdue;
  return b.status === folder;
}

function common(
  date: string,
  total: number,
  party: string,
  words: (string | null | undefined)[],
  f: DocumentFilter,
  today: string,
): boolean {
  const range = periodRange(f.period, today);
  if (range && (date < range[0] || date > range[1])) return false;
  if (f.min !== null && total < f.min) return false;
  if (f.max !== null && total > f.max) return false;
  if (f.party !== null && party !== f.party) return false;
  const query = f.query.trim().toLowerCase();
  if (!query) return true;
  // A number with no words, like "1,180" or "$1180", finds a total of 1180.
  const amount = query.replace(/[\s,.$]|kč|czk|usd/g, '');
  if (/^\d+$/.test(amount) && String(total).includes(amount)) return true;
  return words.some((w) => w?.toLowerCase().includes(query));
}

export function matchesIssued(
  i: InvoiceView,
  folder: IssuedFolder,
  f: DocumentFilter,
  today: string,
): boolean {
  return (
    inIssuedFolder(i, folder) &&
    common(
      i.issuedOn,
      i.total,
      buyerOf(i),
      [i.number, i.buyer.name, i.buyer.company, i.guestName, i.stay.roomName],
      f,
      today,
    )
  );
}

export function matchesBill(
  b: SupplierInvoiceView,
  folder: BillFolder,
  f: DocumentFilter,
  today: string,
): boolean {
  return (
    inBillFolder(b, folder) &&
    common(
      billDate(b),
      b.total,
      b.supplierName,
      [b.supplierName, b.number, b.note, b.repairLabel, ...b.lines.map((l) => l.label)],
      f,
      today,
    )
  );
}

/** The parties in a list with how many documents each has, the most first. */
export function partyCounts(names: string[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
