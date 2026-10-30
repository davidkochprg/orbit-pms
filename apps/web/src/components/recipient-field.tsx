import type { Recipient } from '@orbit/shared';
import { X } from 'lucide-react';
import { type KeyboardEvent, useId, useMemo, useState } from 'react';
import {
  type AddressEntry,
  parseRecipients,
  recipientLabel,
  suggestAddresses,
  uniqueRecipients,
} from '@/lib/mail';
import { cn } from '@/lib/utils';

interface RecipientFieldProps {
  label: string;
  value: Recipient[];
  onChange: (value: Recipient[]) => void;
  book: AddressEntry[];
  autoFocus?: boolean;
  /** Shown at the end of the line, e.g. the Cc and Bcc toggles. */
  trailing?: React.ReactNode;
}

const kindLabels: Record<AddressEntry['kind'], string> = {
  guest: 'Guest',
  contact: 'Contact',
  mail: 'Mail',
};

/**
 * A mail header line of addresses: each a chip, typed or picked from guests, contacts and the
 * mailbox. Enter, Tab, a comma or leaving the field turns what was typed into chips.
 */
export function RecipientField({
  label,
  value,
  onChange,
  book,
  autoFocus,
  trailing,
}: RecipientFieldProps) {
  const id = useId();
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const [invalid, setInvalid] = useState<string[]>([]);
  const suggestions = useMemo(() => suggestAddresses(book, text, value), [book, text, value]);

  const add = (more: Recipient[]) => onChange(uniqueRecipients([...value, ...more]));
  function commit(raw = text): boolean {
    if (!raw.trim()) return false;
    const { recipients, invalid: bad } = parseRecipients(raw);
    add(recipients);
    setInvalid(bad);
    setText(bad.join(', '));
    setActive(0);
    return recipients.length > 0;
  }
  function pick(entry: AddressEntry) {
    add([{ name: entry.name, address: entry.address }]);
    setText('');
    setInvalid([]);
    setActive(0);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (suggestions.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + suggestions.length) % suggestions.length);
    } else if (
      e.key === 'Enter' ||
      (e.key === 'Tab' && text.trim()) ||
      e.key === ',' ||
      e.key === ';'
    ) {
      const suggestion = suggestions[active];
      if (e.key !== ',' && e.key !== ';' && suggestion && !text.includes('@')) {
        e.preventDefault();
        pick(suggestion);
      } else if (text.trim()) {
        e.preventDefault();
        commit();
      }
    } else if (e.key === 'Backspace' && !text && value.length > 0) {
      onChange(value.slice(0, -1));
    } else if (e.key === 'Escape' && text) {
      e.stopPropagation();
      setText('');
    }
  }

  return (
    <div className="relative flex min-h-10 items-center gap-3 border-b px-4">
      <label htmlFor={id} className="w-14 shrink-0 text-sm text-muted-foreground">
        {label}
      </label>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 py-1.5">
        {value.map((r) => (
          <span
            key={r.address}
            title={r.address}
            className="flex h-6 max-w-64 items-center gap-1 rounded-full bg-ink/5 pr-1 pl-2.5 text-xs"
          >
            <span className="truncate">{recipientLabel(r)}</span>
            <button
              type="button"
              aria-label={`Remove ${recipientLabel(r)}`}
              onClick={() => onChange(value.filter((x) => x !== r))}
              className="grid size-4 place-items-center rounded-full text-muted-foreground hover:bg-ink/10 hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          autoFocus={autoFocus}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setActive(0);
            setInvalid([]);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => commit()}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData('text');
            if (/[,;\n]/.test(pasted)) {
              e.preventDefault();
              commit(`${text}${pasted}`);
            }
          }}
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-controls={`${id}-list`}
          aria-invalid={invalid.length > 0 || undefined}
          className={cn(
            'h-7 min-w-32 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle-foreground',
            invalid.length > 0 && 'text-destructive',
          )}
        />
      </div>
      {trailing}
      {suggestions.length > 0 && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute top-full left-16 z-30 mt-1 w-[min(26rem,calc(100%-5rem))] overflow-hidden rounded-stage bg-popover p-1 text-sm shadow-floating backdrop-blur-2xl stroke-lit"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.address}
              role="option"
              aria-selected={i === active}
              // Before the input's blur turns the typed text into a chip.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                'flex cursor-default items-center gap-2 rounded-lg px-2.5 py-1.5',
                i === active && 'bg-accent',
              )}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{s.name ?? s.address}</span>
                {s.name && (
                  <span className="truncate text-xs text-muted-foreground">{s.address}</span>
                )}
              </span>
              <span className="shrink-0 text-xs text-subtle-foreground">{kindLabels[s.kind]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
