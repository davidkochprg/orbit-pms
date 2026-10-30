import type { BookingDetail } from '@orbit/shared';
import { AlertTriangle, CircleCheck, CircleDashed, KeyRound } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { BookingGuests } from '@/components/booking-guests';
import { PaymentForm } from '@/components/booking-bill';
import { ErrorNotice } from '@/components/error-notice';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useBookingAction, useFolio, useGuestBook } from '@/lib/api';
import { formatMoney, formatParty, formatRange } from '@/lib/format';
import { keepOpenWhileEditing } from '@/lib/inline-edit';
import { guestBookProgress } from '@/lib/registration';
import { cn } from '@/lib/utils';

const steps = ['Guests & IDs', 'Bill', 'Room'] as const;
type Step = (typeof steps)[number];

const roomStatusText = {
  inspected: 'Inspected and ready',
  clean: 'Clean',
  dirty: 'Still dirty',
  out_of_order: 'Out of order',
} as const;

/**
 * Check-in, step by step: put everyone in the guest book (scanning IDs with a phone), settle what
 * is due if the guest wants to, then hand over the room. Missing IDs don't block it; they stay
 * flagged on the booking to scan later.
 */
export function CheckInDialog({
  detail,
  open,
  onOpenChange,
}: {
  detail: BookingDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onEscapeKeyDown={keepOpenWhileEditing}
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 shadow-floating sm:max-w-2xl"
      >
        {open && <Flow detail={detail} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Flow({ detail, onDone }: { detail: BookingDetail; onDone: () => void }) {
  const { booking, guest, room } = detail;
  const [step, setStep] = useState<Step>('Guests & IDs');
  const [paying, setPaying] = useState(false);
  const book = useGuestBook(booking.id);
  const folio = useFolio(booking.id);
  const checkIn = useBookingAction(booking.id);
  const index = steps.indexOf(step);

  if (paying && folio.data) {
    return (
      <div className="p-5">
        <PaymentForm
          bookingId={booking.id}
          balance={folio.data.balance}
          onDone={() => {
            setPaying(false);
            setStep('Room');
          }}
          onCancel={() => setPaying(false)}
        />
      </div>
    );
  }

  return (
    <>
      <DialogHeader className="gap-1 border-b p-5 pb-4">
        <DialogTitle>Check in {guest.name}</DialogTitle>
        <DialogDescription>
          Room {room.name} · {formatRange(booking.checkIn, booking.checkOut)} ·{' '}
          {formatParty(booking.adults, booking.childAges)}
        </DialogDescription>
        <ol className="mt-3 flex items-center gap-2">
          {steps.map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              {i > 0 && <span className="h-px w-6 bg-border-strong" aria-hidden />}
              <button
                type="button"
                onClick={() => setStep(s)}
                aria-current={s === step ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                  s === step
                    ? 'bg-primary-soft text-primary-text'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="font-mono">{i + 1}</span> {s}
              </button>
            </li>
          ))}
        </ol>
      </DialogHeader>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto bg-surface-sunken p-5">
        {step === 'Guests & IDs' && (
          <div className="flex flex-col gap-3">
            <BookingGuests bookingId={booking.id} editable compact />
          </div>
        )}

        {step === 'Bill' &&
          (folio.data ? (
            <div className="flex flex-col gap-3">
              <SummaryRow
                ok={folio.data.balance <= 0}
                title={
                  folio.data.balance > 0
                    ? `${formatMoney(folio.data.balance)} still due`
                    : folio.data.balance < 0
                      ? `${formatMoney(-folio.data.balance)} owed to the guest`
                      : 'Paid in full'
                }
                detail={`${formatMoney(folio.data.charged)} charged, ${formatMoney(folio.data.paid)} paid`}
              />
              {folio.data.balance > 0 && (
                <Button variant="outline" className="self-start" onClick={() => setPaying(true)}>
                  Take payment now
                </Button>
              )}
            </div>
          ) : (
            <Skeleton className="h-24" />
          ))}

        {step === 'Room' && (
          <div className="flex flex-col gap-2">
            <SummaryRow
              ok={room.status === 'clean' || room.status === 'inspected'}
              title={`Room ${room.name}: ${roomStatusText[room.status].toLowerCase()}`}
            />
            {book.data && (
              <SummaryRow
                ok={book.data.missing === 0 && book.data.extra === 0}
                title={guestBookProgress(book.data)}
                detail={
                  book.data.extra > 0 ? 'More people listed than the booking is for' : undefined
                }
                action={
                  (book.data.missing > 0 || book.data.extra > 0) && (
                    <Button variant="ghost" size="xs" onClick={() => setStep('Guests & IDs')}>
                      {book.data.extra > 0 ? 'Review' : 'Scan now'}
                    </Button>
                  )
                }
              />
            )}
            {folio.data && (
              <SummaryRow
                ok={folio.data.balance <= 0}
                title={
                  folio.data.balance > 0 ? `${formatMoney(folio.data.balance)} due` : 'Bill settled'
                }
              />
            )}
          </div>
        )}
      </div>

      {checkIn.error && (
        <div className="border-t px-5 pt-3">
          <ErrorNotice message={checkIn.error.message} />
        </div>
      )}
      <DialogFooter className="mx-0! mb-0! px-5 py-3 sm:justify-between">
        <Button
          variant="ghost"
          onClick={() => (index === 0 ? onDone() : setStep(steps[index - 1]!))}
        >
          {index === 0 ? 'Cancel' : 'Back'}
        </Button>
        {step === 'Room' ? (
          <Button
            disabled={checkIn.isPending}
            onClick={() => checkIn.mutate('check_in', { onSuccess: onDone })}
          >
            <KeyRound /> Check in
          </Button>
        ) : (
          <Button onClick={() => setStep(steps[index + 1]!)}>
            {/* Checking in without every ID is normal; the summary and the booking keep reminding. */}
            Continue
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

function SummaryRow({
  ok,
  title,
  detail,
  action,
}: {
  ok: boolean;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  const Icon = ok ? CircleCheck : title.startsWith('Room') ? AlertTriangle : CircleDashed;
  return (
    <div className="flex items-start gap-3 rounded-stage bg-background p-3 shadow-[0_1px_2px_var(--shadow-soft)] stroke-lit">
      <Icon className={cn('mt-0.5 size-4 shrink-0', ok ? 'text-success' : 'text-warning')} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium">{title}</span>
        {detail && <span className="text-sm text-muted-foreground">{detail}</span>}
      </div>
      {action}
    </div>
  );
}
