import type {
  Attachment,
  Contact,
  HotelProfile,
  Inquiry,
  MailDraft,
  MailLabel,
  StaffMember,
} from '@orbit/shared';
import { thread } from './conversations';
import type { SeedRegion } from './regions';

const HOUR = 3600_000;

export interface SeedFile {
  attachment: Attachment;
  bytes: Uint8Array;
}

export interface SeedMail {
  labels: MailLabel[];
  /** Conversations besides the guest requests: a group enquiry, a supplier order, spam. */
  inquiries: Inquiry[];
  drafts: MailDraft[];
  files: SeedFile[];
  /** Labels and stars for the guest requests the seed already has, by conversation ID. */
  marks: Record<string, Pick<Inquiry, 'labelIds' | 'starred'>>;
}

/** A one-page PDF with lines of plain text, enough for any viewer to open. */
export function textPdf(lines: string[]): Uint8Array {
  const escape = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, '?');
  const text = lines
    .map((l, i) => `BT /F1 ${i === 0 ? 16 : 11} Tf 56 ${780 - i * 22} Td (${escape(l)}) Tj ET`)
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

function file(id: string, name: string, contentType: string, bytes: Uint8Array): SeedFile {
  return { attachment: { id, name, contentType, size: bytes.length }, bytes };
}

/**
 * The mailbox around the guest requests, so it reads like a working hotel inbox: labels, a
 * starred group enquiry with copies and a guest list, a supplier order with a PDF, a newsletter
 * in the trash, and two drafts. All synthetic: example.com addresses and made-up names.
 */
export function buildMail(
  region: SeedRegion,
  contacts: Contact[],
  team: StaffMember[],
  profile: HotelProfile,
  now: Date,
): SeedMail {
  const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * HOUR).toISOString();
  const manager = team.find((s) => s.active && s.role === 'manager')?.name;
  const desk = team.find((s) => s.active && s.role === 'receptionist')?.name;
  const labels: MailLabel[] = [
    { id: 'lbl_groups', name: 'Groups', color: 'blue' },
    { id: 'lbl_suppliers', name: 'Suppliers', color: 'amber' },
    { id: 'lbl_follow_up', name: 'Follow up', color: 'red' },
  ];

  const guestList = file(
    'att_seed_guests',
    'Wedding guest list.csv',
    'text/csv',
    new TextEncoder().encode(
      'Name,Nights,Room\nRiley Example,2,King\nJordan Sample,2,King\nCasey Example,2,Queen\nMorgan Placeholder,2,Queen\nTaylor Test,1,Queen\nAvery Demo,2,Family\n',
    ),
  );
  const planner = { name: 'Quinn Example', address: 'quinn@weddings.example' };
  const couple = { name: 'Riley Example', address: 'riley@example.com' };
  const wedding = thread(
    'inq_seed_wedding',
    now,
    [
      {
        direction: 'in',
        hoursAgo: 20,
        cc: [couple],
        attachments: [guestList.attachment],
        body: `Hello,\n\nI'm planning Riley and Jordan's wedding in your area next spring and we would love to put their guests at ${profile.name}. We are looking at a block of about six rooms for two nights, Friday and Saturday.\n\nThe guest list is attached. Could you send availability and a group rate? Riley is copied in.\n\nThanks so much,\nQuinn Example\nExample Weddings`,
      },
      {
        direction: 'out',
        hoursAgo: 18,
        ...(manager && { author: manager }),
        cc: [couple],
        body: `Hi Quinn,\n\nthank you, we would love to host them. I'm checking which weekend works best and will send a proposal for the block shortly.\n\nKind regards,\n${manager ?? 'Reception'}`,
      },
      {
        direction: 'in',
        hoursAgo: 3,
        cc: [couple],
        body: `Wonderful, thank you! The couple would also like to know whether the sauna can be booked for the group on the Saturday afternoon.\n\nBest,\nQuinn`,
      },
    ],
    {
      channel: 'email',
      partner: null,
      subject: 'Room block for a wedding',
      senderName: planner.name,
      senderAddress: planner.address,
      status: 'new',
      unread: true,
      starred: true,
      labelIds: ['lbl_groups', 'lbl_follow_up'],
    },
  );

  const inquiries: Inquiry[] = [wedding];
  const files: SeedFile[] = [guestList];
  const supplier = contacts.find((c) => c.trades.includes('supplies') && c.email);
  if (supplier) {
    const czech = region === 'cz';
    const order = file(
      'att_seed_order',
      czech ? 'Objednavka pecivo.pdf' : 'Breakfast order.pdf',
      'application/pdf',
      textPdf(
        czech
          ? [
              'Objednavka peciva',
              profile.name,
              'Rohliky: 60 ks denne',
              'Chleb: 4 ks denne',
              'Croissanty: 30 ks o vikendu',
              'Dodani v 6:30',
            ]
          : [
              'Breakfast order',
              profile.name,
              'Sourdough loaves: 4 daily',
              'Croissants: 40 daily',
              'Muffins: 24 on weekends',
              'Delivery at 6:30',
            ],
      ),
    );
    files.push(order);
    const to = { name: supplier.person ?? supplier.name, address: supplier.email! };
    inquiries.push(
      thread(
        'inq_seed_supplier',
        now,
        [
          {
            direction: 'out',
            hoursAgo: 50,
            ...(manager && { author: manager }),
            to: [to],
            attachments: [order.attachment],
            body: czech
              ? `Dobrý den,\n\nposílám objednávku pečiva na příští týden v příloze. Prosíme o dodání jako obvykle v 6:30.\n\nDěkuji,\n${manager ?? 'Recepce'}`
              : `Hello,\n\nplease find next week's breakfast order attached. Delivery at 6:30 as usual.\n\nThank you,\n${manager ?? 'Reception'}`,
          },
          {
            direction: 'in',
            hoursAgo: 46,
            body: czech
              ? 'Dobrý den, objednávku jsme přijali, dodáme jako obvykle. Pěkný den!'
              : 'Hi, order received, we will deliver as usual. Have a good week!',
          },
        ],
        {
          channel: 'email',
          partner: null,
          subject: czech ? 'Objednávka pečiva' : 'Breakfast order for next week',
          senderName: supplier.name,
          senderAddress: supplier.email,
          labelIds: ['lbl_suppliers'],
          archivedAt: at(45),
        },
      ),
    );
  }

  inquiries.push(
    thread(
      'inq_seed_newsletter',
      now,
      [
        {
          direction: 'in',
          hoursAgo: 70,
          body: 'Boost your bookings by 300%! Our SEO package puts your hotel on page one of every search engine. Reply YES for a free audit.',
        },
      ],
      {
        channel: 'email',
        partner: null,
        subject: 'Get more direct bookings today',
        senderName: 'Growth Example',
        senderAddress: 'offers@growth.example',
        status: 'declined',
        trashedAt: at(60),
      },
    ),
  );

  const drafts: MailDraft[] = [
    {
      id: 'drf_seed_wedding',
      inquiryId: wedding.id,
      forwardOf: null,
      to: [],
      cc: [couple],
      bcc: [],
      subject: '',
      body: `Hi Quinn,\n\nyes, the sauna can be reserved for the group on Saturday afternoon. `,
      attachments: [],
      updatedAt: at(1),
    },
  ];
  const laundry = contacts.find((c) => c.trades.includes('cleaning') && c.email);
  if (laundry) {
    drafts.push({
      id: 'drf_seed_linen',
      inquiryId: null,
      forwardOf: null,
      to: [{ name: laundry.person ?? laundry.name, address: laundry.email! }],
      cc: [],
      bcc: [],
      subject: region === 'cz' ? 'Svoz prádla navíc' : 'Extra linen pickup',
      body:
        region === 'cz'
          ? 'Dobrý den,\n\nmohli bychom tento týden přidat ještě jeden svoz?'
          : `Hi ${laundry.person ?? 'there'},\n\ncould we add an extra pickup this week? We are expecting a full house on the weekend.\n\n${desk ?? ''}`.trim(),
      attachments: [],
      updatedAt: at(2),
    });
  }

  return {
    labels,
    inquiries,
    drafts,
    files,
    // The group request in the seed's guest messages is starred and filed with groups.
    marks: { inq_07: { labelIds: ['lbl_groups'], starred: true } },
  };
}
