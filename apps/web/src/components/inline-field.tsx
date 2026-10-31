import { Check, LoaderCircle, Pencil } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useRef, useState } from 'react';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { type Suggestion, SuggestInput } from '@/components/ui/suggest-input';
import { Textarea } from '@/components/ui/textarea';
import { INLINE_EDITOR } from '@/lib/inline-edit';
import { cn } from '@/lib/utils';

interface InlineBaseProps {
  label: string;
  /** What to show when not editing; falls back to a muted placeholder. */
  display?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  /** Marks the value as still needed. */
  missing?: boolean;
  className?: string;
}

interface InlineTextProps extends InlineBaseProps {
  value: string | null;
  /** Resolves when saved; a rejection keeps the editor open. */
  onSave: (value: string) => Promise<unknown>;
  type?: 'text' | 'email' | 'tel';
  /** A textarea: Enter saves, Shift+Enter starts a new line. */
  multiline?: boolean;
  inputProps?: Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'type'>;
  transform?: (value: string) => string;
  /** Offered in a list as the value is typed; any text is still accepted. */
  suggestions?: Suggestion[];
}

function Display({
  label,
  display,
  placeholder = 'Add',
  disabled,
  missing,
  className,
  multiline = false,
  onEdit,
}: InlineBaseProps & { multiline?: boolean; onEdit: () => void }) {
  const empty = display === undefined || display === null || display === '';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onEdit}
      aria-label={`Edit ${label}`}
      className={cn(
        'group/inline -mx-1.5 flex min-h-7 w-[calc(100%+0.75rem)] min-w-0 items-center gap-1.5 rounded-md px-1.5 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none',
        className,
      )}
    >
      <span
        className={cn(
          'min-w-0 flex-1',
          multiline ? 'py-1 break-words whitespace-pre-wrap' : 'truncate',
          empty && 'text-subtle-foreground',
          empty && missing && 'text-warning',
        )}
      >
        {empty ? placeholder : display}
      </span>
      {!disabled && (
        <Pencil className="size-3 shrink-0 text-subtle-foreground opacity-0 transition-opacity group-hover/inline:opacity-100 group-focus-visible/inline:opacity-100" />
      )}
    </button>
  );
}

/**
 * A value that turns into an input on click. Enter or leaving the field saves, Escape cancels;
 * an empty field saves as blank, which clears it.
 */
export function InlineText({
  value,
  onSave,
  type = 'text',
  inputProps,
  transform,
  multiline = false,
  suggestions,
  ...base
}: InlineTextProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function commit(next = draft) {
    if (next === null) return;
    if (next.trim() === (value ?? '')) {
      setDraft(null);
      return;
    }
    setSaving(true);
    try {
      await onSave(next.trim());
      setDraft(null);
    } catch {
      // The caller shows the error; keep the draft so it can be fixed.
    } finally {
      setSaving(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void commit();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setDraft(null);
    }
  }

  if (draft === null) {
    return (
      <Display
        {...base}
        display={base.display ?? value}
        multiline={multiline}
        onEdit={() => setDraft(value ?? '')}
      />
    );
  }
  if (multiline) {
    return (
      <div {...{ [INLINE_EDITOR]: '' }} className={cn('-mx-1.5', base.className)}>
        <Textarea
          autoFocus
          aria-label={base.label}
          value={draft}
          disabled={saving}
          rows={3}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={onKeyDown}
          className="min-h-16 px-1.5 py-1"
        />
      </div>
    );
  }
  const shape = (v: string) => (transform ? transform(v) : v);
  return (
    <div {...{ [INLINE_EDITOR]: '' }} className={cn('relative -mx-1.5', base.className)}>
      {suggestions ? (
        <SuggestInput
          autoFocus
          type={type}
          aria-label={base.label}
          value={draft}
          disabled={saving}
          suggestions={suggestions}
          onValueChange={(v) => setDraft(shape(v))}
          onPick={(v) => void commit(shape(v))}
          onBlur={() => void commit()}
          onKeyDown={onKeyDown}
          className="h-7 px-1.5 pr-7"
          {...inputProps}
        />
      ) : (
        <Input
          autoFocus
          type={type}
          aria-label={base.label}
          value={draft}
          disabled={saving}
          onChange={(e) => setDraft(shape(e.target.value))}
          onBlur={() => void commit()}
          onKeyDown={onKeyDown}
          className="h-7 px-1.5 pr-7"
          {...inputProps}
        />
      )}
      <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground">
        {saving ? (
          <LoaderCircle className="size-3.5 animate-spin" />
        ) : (
          <Check className="size-3.5" />
        )}
      </span>
    </div>
  );
}

interface InlineDateProps extends InlineBaseProps {
  value: string | null;
  /** Resolves when saved; '' clears the date. */
  onSave: (value: string) => Promise<unknown>;
  min?: string;
  max?: string;
}

/** A date that opens a calendar on click and saves the day picked. */
export function InlineDate({ value, onSave, min, max, ...base }: InlineDateProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  // Picking closes the calendar in the same tick; the editor stays until the save is done.
  const savingNow = useRef(false);

  if (!editing) {
    return <Display {...base} display={base.display ?? value} onEdit={() => setEditing(true)} />;
  }
  return (
    <div {...{ [INLINE_EDITOR]: '' }} className={cn('-mx-1.5', base.className)}>
      <DatePicker
        aria-label={base.label}
        value={value ?? ''}
        min={min}
        max={max}
        clearable
        defaultOpen
        disabled={saving}
        onOpenChange={(open) => !open && !savingNow.current && setEditing(false)}
        onChange={(next) => {
          if (next === (value ?? '')) return;
          savingNow.current = true;
          setSaving(true);
          onSave(next)
            .catch(() => undefined)
            .finally(() => {
              savingNow.current = false;
              setSaving(false);
              setEditing(false);
            });
        }}
        className="h-7 px-1.5"
      />
    </div>
  );
}

interface InlineSelectProps<T extends string> extends InlineBaseProps {
  value: T | null;
  options: { value: T; label: string }[];
  onSave: (value: T) => Promise<unknown>;
}

/** A value that turns into a select on click and saves on change. */
export function InlineSelect<T extends string>({
  value,
  options,
  onSave,
  ...base
}: InlineSelectProps<T>) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  // Picking closes the list in the same tick; the editor stays until the save is done.
  const savingNow = useRef(false);
  const current = options.find((o) => o.value === value);

  if (!editing) {
    return (
      <Display {...base} display={base.display ?? current?.label} onEdit={() => setEditing(true)} />
    );
  }
  return (
    <div {...{ [INLINE_EDITOR]: '' }} className={cn('-mx-1.5', base.className)}>
      <Select
        aria-label={base.label}
        value={value ?? ''}
        disabled={saving}
        defaultOpen
        onOpenChange={(open) => !open && !savingNow.current && setEditing(false)}
        onValueChange={(next) => {
          savingNow.current = true;
          setSaving(true);
          onSave(next as T)
            .catch(() => undefined)
            .finally(() => {
              savingNow.current = false;
              setSaving(false);
              setEditing(false);
            });
        }}
        className="h-7 pl-1.5"
      >
        {value === null && <option value="">Choose…</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
