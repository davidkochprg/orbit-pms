import { Lock } from 'lucide-react';
import { useBlocker } from 'react-router';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ErrorNotice } from '@/components/error-notice';
import { Button } from '@/components/ui/button';
import { useSession } from '@/hooks/use-session';

interface SaveState {
  isPending: boolean;
  isSuccess: boolean;
  error: Error | null;
  reset: () => void;
}

interface SaveBarProps {
  save: SaveState;
  dirty: boolean;
  onSave: () => void;
  onDiscard: () => void;
  /** Shown while there are changes. */
  unsaved: string;
  /** Shown after a save. */
  saved: string;
  /** Leaving for a path under this prefix keeps the draft, e.g. another settings tab. */
  keepWithin?: string;
}

/**
 * The bar under a form that saves as a whole: what is unsaved, Discard and Save. Leaving the
 * page with unsaved changes asks first.
 */
export function SaveBar({
  save,
  dirty,
  onSave,
  onDiscard,
  unsaved,
  saved,
  keepWithin,
}: SaveBarProps) {
  // Only leaving the page counts: opening a booking (`?booking=`) keeps it.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      nextLocation.pathname !== currentLocation.pathname &&
      !(keepWithin && nextLocation.pathname.startsWith(keepWithin)),
  );

  return (
    <>
      {(dirty || save.error || save.isSuccess) && (
        <div className="flex shrink-0 items-center gap-3 border-t px-6 py-3">
          {save.error ? (
            <ErrorNotice message={save.error.message} className="min-w-0 flex-1" />
          ) : (
            <p className="flex-1 text-sm text-muted-foreground">{dirty ? unsaved : saved}</p>
          )}
          {dirty && (
            <>
              <Button
                variant="ghost"
                size="sm"
                disabled={save.isPending}
                onClick={() => {
                  save.reset();
                  onDiscard();
                }}
              >
                Discard
              </Button>
              <Button size="sm" disabled={save.isPending} onClick={onSave}>
                Save changes
              </Button>
            </>
          )}
        </div>
      )}
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => !open && blocker.reset?.()}
        title="Discard your changes?"
        description="They haven't been saved yet."
        cancelLabel="Keep editing"
        confirmLabel="Discard"
        destructive
        onConfirm={() => blocker.proceed?.()}
      />
    </>
  );
}

/** Tells staff who aren't managers why the form below can't be changed. */
export function ReadOnlyNotice({ what }: { what: string }) {
  const { canManage, current } = useSession();
  if (canManage || !current) return null;
  return (
    <p className="flex items-center gap-2 rounded-control bg-surface-sunken px-3 py-2.5 text-sm text-muted-foreground">
      <Lock className="size-4 shrink-0" />
      Only managers can change {what}.
    </p>
  );
}
