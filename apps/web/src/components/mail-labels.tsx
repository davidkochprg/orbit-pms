import { type LabelColor, labelColors, type MailLabel } from '@orbit/shared';
import { Plus, Tag } from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ErrorNotice } from '@/components/error-notice';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useDeleteLabel, useMailLabels, useSaveLabel } from '@/lib/api';
import { cn } from '@/lib/utils';

const labelDotColors: Record<LabelColor, string> = {
  gray: 'bg-muted-foreground',
  blue: 'bg-primary',
  green: 'bg-success',
  amber: 'bg-warning',
  red: 'bg-destructive',
  violet: 'bg-accent-violet',
};

export function LabelDot({ color, className }: { color: LabelColor; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('size-2 shrink-0 rounded-full', labelDotColors[color], className)}
    />
  );
}

/** A conversation's labels as small chips. */
export function LabelChips({
  ids,
  labels,
  hide,
  className,
}: {
  ids: string[];
  labels: MailLabel[];
  /** A label not to repeat, e.g. the one the list is filtered by. */
  hide?: string | null;
  className?: string;
}) {
  const shown = ids.flatMap((id) => (id === hide ? [] : (labels.find((l) => l.id === id) ?? [])));
  if (shown.length === 0) return null;
  return (
    <span className={cn('flex flex-wrap gap-1', className)}>
      {shown.map((l) => (
        <span
          key={l.id}
          className="flex h-5 items-center gap-1 rounded-full bg-ink/5 px-2 text-[0.6875rem] text-muted-foreground"
        >
          <LabelDot color={l.color} className="size-1.5" />
          {l.name}
        </span>
      ))}
    </span>
  );
}

/**
 * Ticks the labels on one or more conversations. `checked` says which labels all of them have;
 * picking one adds it to all, or takes it off all when every one has it.
 */
export function LabelMenu({
  checked,
  onToggle,
  children,
  align = 'end',
}: {
  checked: (labelId: string) => boolean;
  onToggle: (labelId: string, on: boolean) => void;
  children: ReactNode;
  align?: 'start' | 'end';
}) {
  const labels = useMailLabels();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-56">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Label as
          </DropdownMenuLabel>
          {(labels.data ?? []).map((l) => (
            <DropdownMenuCheckboxItem
              key={l.id}
              checked={checked(l.id)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(on) => onToggle(l.id, on)}
            >
              <LabelDot color={l.color} />
              {l.name}
            </DropdownMenuCheckboxItem>
          ))}
          {(labels.data ?? []).length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem onSelect={() => setCreating(true)}>
            <Plus /> New label
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <LabelDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={(l) => onToggle(l.id, true)}
      />
    </>
  );
}

/** Adds a label, or renames, recolors or deletes one. */
export function LabelDialog({
  open,
  onOpenChange,
  label,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label?: MailLabel;
  onSaved?: (label: MailLabel) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="shadow-floating sm:max-w-sm">
        {open && (
          <LabelForm
            label={label}
            onDone={(saved) => {
              onOpenChange(false);
              if (saved) onSaved?.(saved);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function LabelForm({
  label,
  onDone,
}: {
  label: MailLabel | undefined;
  onDone: (saved: MailLabel | null) => void;
}) {
  const save = useSaveLabel();
  const remove = useDeleteLabel();
  const [name, setName] = useState(label?.name ?? '');
  const [color, setColor] = useState<LabelColor>(label?.color ?? 'blue');
  const [deleting, setDeleting] = useState(false);
  const error = save.error ?? remove.error;

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate({ id: label?.id ?? null, body: { name, color } }, { onSuccess: onDone });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{label ? 'Edit label' : 'New label'}</DialogTitle>
      </DialogHeader>
      <FormField label="Name" htmlFor="label-name">
        <Input
          id="label-name"
          autoFocus
          required
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </FormField>
      <div role="radiogroup" aria-label="Color" className="flex gap-2">
        {labelColors.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={color === c}
            aria-label={c}
            onClick={() => setColor(c)}
            className={cn(
              'grid size-7 place-items-center rounded-full outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring',
              color === c && 'ring-2 ring-border-strong',
            )}
          >
            <LabelDot color={c} className="size-3.5" />
          </button>
        ))}
      </div>
      {error && <ErrorNotice message={error.message} />}
      <DialogFooter>
        {label && (
          <Button
            type="button"
            variant="ghost"
            className="mr-auto text-destructive"
            onClick={() => setDeleting(true)}
          >
            Delete
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={() => onDone(null)}>
          Cancel
        </Button>
        <Button type="submit" disabled={!name.trim() || save.isPending}>
          <Tag /> {label ? 'Save' : 'Create'}
        </Button>
      </DialogFooter>
      {label && (
        <ConfirmDialog
          open={deleting}
          onOpenChange={setDeleting}
          title={`Delete the label ${label.name}?`}
          description="Its conversations stay where they are."
          confirmLabel="Delete"
          destructive
          busy={remove.isPending}
          onConfirm={() => remove.mutate(label.id, { onSuccess: () => onDone(null) })}
        />
      )}
    </form>
  );
}
