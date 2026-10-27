import type { BookingAction } from '@orbit/shared';
import { Ban, ExternalLink, LoaderCircle, Pencil, Sparkles, User } from 'lucide-react';
import { type ComponentType, type ReactElement, type ReactNode, useState } from 'react';
import { useNavigate } from 'react-router';
import { ConfirmDialog } from '@/components/confirm-dialog';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useBookingDrawer } from '@/hooks/use-booking-drawer';
import { useBookingEditor } from '@/hooks/use-booking-editor';
import { useCommandPalette } from '@/hooks/use-command-palette';
import { useBookingAction, useBookingDetail } from '@/lib/api';
import { actionLabels, formatRange } from '@/lib/format';

/** The parts a menu is built from, so one item list serves context and dropdown menus. */
interface MenuKit {
  Item: ComponentType<{
    onSelect?: () => void;
    variant?: 'default' | 'destructive';
    disabled?: boolean;
    children: ReactNode;
  }>;
  Separator: ComponentType;
}

const contextKit: MenuKit = { Item: ContextMenuItem, Separator: ContextMenuSeparator };
const dropdownKit: MenuKit = { Item: DropdownMenuItem, Separator: DropdownMenuSeparator };

interface BookingMenuProps {
  bookingId: string;
  /** Leave out "Open details", e.g. inside the booking inspector itself. */
  inInspector?: boolean;
}

/** Right-click menu with everything staff can do with a booking. */
export function BookingContextMenu({
  bookingId,
  children,
}: BookingMenuProps & { children: ReactElement }) {
  const [cancelling, setCancelling] = useState(false);
  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <BookingMenuItems
            kit={contextKit}
            bookingId={bookingId}
            onCancel={() => setCancelling(true)}
          />
        </ContextMenuContent>
      </ContextMenu>
      <CancelBookingDialog bookingId={bookingId} open={cancelling} onOpenChange={setCancelling} />
    </>
  );
}

/** The same actions behind a button, e.g. "More" in the booking inspector. */
export function BookingDropdownMenu({
  bookingId,
  inInspector,
  children,
}: BookingMenuProps & { children: ReactElement }) {
  const [cancelling, setCancelling] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <BookingMenuItems
            kit={dropdownKit}
            bookingId={bookingId}
            inInspector={inInspector}
            onCancel={() => setCancelling(true)}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      <CancelBookingDialog bookingId={bookingId} open={cancelling} onOpenChange={setCancelling} />
    </>
  );
}

function BookingMenuItems({
  kit: { Item, Separator },
  bookingId,
  inInspector = false,
  onCancel,
}: BookingMenuProps & { kit: MenuKit; onCancel: () => void }) {
  // Loaded when the menu opens; the server says which status actions are allowed today.
  const detail = useBookingDetail(bookingId);
  const action = useBookingAction(bookingId);
  const { open } = useBookingDrawer();
  const { openEdit } = useBookingEditor();
  const { openPalette } = useCommandPalette();
  const navigate = useNavigate();
  const d = detail.data;
  const steps =
    d?.allowedActions.filter((a): a is Exclude<BookingAction, 'cancel'> => a !== 'cancel') ?? [];

  return (
    <>
      {!inInspector && (
        <Item onSelect={() => open(bookingId)}>
          <ExternalLink /> Open details
        </Item>
      )}
      <Item onSelect={() => openEdit(bookingId)}>
        <Pencil /> Edit booking…
      </Item>
      {!d ? (
        <Item disabled>
          <LoaderCircle className="animate-spin" /> Loading actions…
        </Item>
      ) : (
        steps.map((a) => (
          <Item key={a} onSelect={() => action.mutate(a)}>
            <span className="size-4" aria-hidden />
            {actionLabels[a]}
          </Item>
        ))
      )}
      <Separator />
      {d && (
        <Item onSelect={() => void navigate(`/guests/${d.guest.id}`)}>
          <User /> Guest profile
        </Item>
      )}
      {d && (
        <Item
          onSelect={() =>
            openPalette({
              mode: 'agent',
              text: `About ${d.guest.name}'s booking ${d.booking.id} in room ${d.room.name}: `,
            })
          }
        >
          <Sparkles /> Ask Orbit
        </Item>
      )}
      {d?.allowedActions.includes('cancel') && (
        <>
          <Separator />
          <Item variant="destructive" onSelect={onCancel}>
            <Ban /> Cancel booking…
          </Item>
        </>
      )}
    </>
  );
}

/** Asks before cancelling: a cancelled booking cannot be restored. */
export function CancelBookingDialog({
  bookingId,
  open,
  onOpenChange,
}: {
  bookingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const detail = useBookingDetail(open ? bookingId : null);
  const action = useBookingAction(bookingId);
  const d = detail.data;
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Cancel this booking?"
      description={
        <>
          {d
            ? `${d.guest.name}, room ${d.room.name}, ${formatRange(d.booking.checkIn, d.booking.checkOut)}. `
            : ''}
          The room becomes free again. A cancelled booking cannot be restored.
          {action.error && (
            <span className="mt-2 block text-destructive">{action.error.message}</span>
          )}
        </>
      }
      confirmLabel="Cancel booking"
      destructive
      busy={action.isPending}
      onConfirm={() => action.mutate('cancel', { onSuccess: () => onOpenChange(false) })}
    />
  );
}
