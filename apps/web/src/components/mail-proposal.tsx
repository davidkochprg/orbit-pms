import type { Inquiry } from '@orbit/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Languages, LoaderCircle, PenLine } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { GuestAvatar } from '@/components/guest-avatar';
import { useCommandPalette } from '@/hooks/use-command-palette';
import { useSession } from '@/hooks/use-session';
import {
  useBookingDetail,
  useDrafts,
  useHealth,
  useInquiry,
  useSaveDraft,
  useTranslateText,
} from '@/lib/api';
import { languageLabels } from '@/lib/format';
import { guessLanguage, senderLabel } from '@/lib/inbox';
import { newDraftId, parseRecipients, type MailAction } from '@/lib/mail';
import { cn } from '@/lib/utils';

interface Addressee {
  name: string | null;
  address: string | null;
}

function toRow(action: MailAction): string | null {
  const row = action.details?.changes.find((c) => c.label === 'To')?.after;
  return row && 'text' in row ? row.text : null;
}

/** Who an email goes to and its subject: the guest of the conversation for a reply. */
function useEnvelope(action: MailAction): {
  to: Addressee[];
  subject: string | null;
  inquiry: Inquiry | undefined;
} {
  const inquiry = useInquiry(
    action.kind === 'send_reply' ? action.input.inquiryId : undefined,
  ).data;
  const booking = useBookingDetail(
    action.kind === 'send_arrival_note' ? action.input.bookingId : null,
  ).data;
  switch (action.kind) {
    case 'send_reply':
      return {
        to: inquiry ? [{ name: senderLabel(inquiry), address: inquiry.senderAddress }] : [],
        subject: inquiry?.subject ? `Re: ${inquiry.subject}` : null,
        inquiry,
      };
    case 'send_email':
      return {
        to: action.input.to.map((r) => ({ name: r.name ?? null, address: r.address })),
        subject: action.input.subject,
        inquiry: undefined,
      };
    case 'send_arrival_note':
      return {
        to: [{ name: booking?.guest.name ?? null, address: toRow(action) }],
        subject: action.input.subject,
        inquiry: undefined,
      };
    case 'send_work_order':
      return {
        to: parseRecipients(toRow(action) ?? '').recipients,
        subject: action.input.subject,
        inquiry: undefined,
      };
  }
}

/**
 * An email the agent proposes, laid out as one: who it goes to, the subject, and the text as it
 * will be sent, with its line breaks. A long text opens clamped; one in another language can be
 * read in the staff member's; a reply can be taken to the inbox to edit before it goes.
 */
export function MailPreview({
  action,
  lines,
  actions,
  onEdit,
}: {
  action: MailAction;
  /** Lines shown before "Show all". */
  lines: 4 | 10;
  /** Confirm and reject, beside the recipient. */
  actions?: ReactNode;
  /** The reply was taken to the inbox to edit; the proposal is no longer needed. */
  onEdit?: () => void;
}) {
  const { to, subject, inquiry } = useEnvelope(action);
  const { current } = useSession();
  const aiOn = useHealth().data?.ai.configured ?? false;
  const translate = useTranslateText();
  const body = action.input.body.trim();
  const myLanguage = current?.language ?? 'en';
  const guessed = guessLanguage(body);
  // Only a text in another language than the staff member's is offered in theirs.
  const foreign = guessed !== null && guessed !== myLanguage ? guessed : null;
  // The draft Orbit wrote for the conversation comes with the staff member's version.
  const known =
    inquiry?.suggestion?.draft?.trim() === body &&
    inquiry.suggestion.draftTranslation?.language === myLanguage
      ? inquiry.suggestion.draftTranslation.text
      : null;
  const mine = known ?? translate.data?.text ?? null;
  const [showMine, setShowMine] = useState(false);
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);
  const text = useRef<HTMLParagraphElement>(null);
  const shown = showMine && mine ? mine : body;

  useLayoutEffect(() => {
    const el = text.current;
    if (el && !open) setClamped(el.scrollHeight > el.clientHeight + 1);
  }, [shown, open, lines]);

  const first = to[0];
  const others = to.length - 1;

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex min-w-0 items-center gap-2.5">
        <GuestAvatar name={first?.name ?? first?.address ?? '?'} size="md" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate font-medium">
            {first ? (first.name ?? first.address) : '…'}
            {others > 0 && (
              <span className="font-normal text-muted-foreground"> and {others} more</span>
            )}
          </p>
          {first?.name && first.address && (
            <p className="truncate text-xs text-muted-foreground">{first.address}</p>
          )}
        </div>
        {foreign && (
          <span className="shrink-0 rounded-full bg-ink/5 px-2 py-0.5 text-[0.6875rem] text-muted-foreground">
            {languageLabels[foreign]}
          </span>
        )}
        {actions}
      </div>
      <div className="flex flex-col gap-1.5 rounded-lg bg-ink/4 px-3 py-2.5">
        {subject && <p className="truncate font-medium">{subject}</p>}
        <p
          ref={text}
          className={cn(
            'leading-6 whitespace-pre-line',
            !open && (lines === 4 ? 'line-clamp-4' : 'line-clamp-10'),
          )}
        >
          {shown}
        </p>
      </div>
      {(clamped || open || (foreign && aiOn) || onEdit) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {(clamped || open) && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="hover:text-foreground"
            >
              {open ? 'Show less' : 'Show all'}
            </button>
          )}
          {foreign && (mine || aiOn) && (
            <button
              type="button"
              disabled={translate.isPending}
              onClick={() => {
                if (mine) {
                  setShowMine((s) => !s);
                } else {
                  translate.mutate({ text: body, to: myLanguage });
                  setShowMine(true);
                }
              }}
              className="flex items-center gap-1 hover:text-foreground disabled:opacity-60"
            >
              {translate.isPending ? (
                <LoaderCircle className="size-3 animate-spin" />
              ) : (
                <Languages className="size-3" />
              )}
              {showMine && mine
                ? `Show ${languageLabels[foreign]}`
                : `Show in ${languageLabels[myLanguage]}`}
            </button>
          )}
          {action.kind === 'send_reply' && onEdit && (
            <EditInInbox inquiryId={action.input.inquiryId} body={body} onEdit={onEdit} />
          )}
          {translate.error && <span className="text-destructive">{translate.error.message}</span>}
        </div>
      )}
    </div>
  );
}

/**
 * Puts the reply in the conversation's reply box as a saved draft and opens it there, for staff
 * to change before sending it themselves.
 */
function EditInInbox({
  inquiryId,
  body,
  onEdit,
}: {
  inquiryId: string;
  body: string;
  onEdit: () => void;
}) {
  const drafts = useDrafts();
  const save = useSaveDraft();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { closePalette } = useCommandPalette();
  const [busy, setBusy] = useState(false);

  const edit = async () => {
    setBusy(true);
    try {
      const existing = drafts.data?.find((d) => d.inquiryId === inquiryId && !d.forwardOf);
      const id = existing?.id ?? newDraftId();
      await save.mutateAsync({ id, body: { inquiryId, body } });
      await queryClient.invalidateQueries({ queryKey: ['mail-drafts'] });
      onEdit();
      closePalette();
      void navigate(`/inbox/${encodeURIComponent(inquiryId)}`, { state: { draft: id } });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      disabled={busy || !drafts.data}
      onClick={() => void edit()}
      className="flex items-center gap-1 hover:text-foreground disabled:opacity-60"
    >
      {busy ? <LoaderCircle className="size-3 animate-spin" /> : <PenLine className="size-3" />}
      Edit in inbox
    </button>
  );
}
