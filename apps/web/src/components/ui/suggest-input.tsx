import * as React from 'react';
import { cn } from 'cn';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { Input } from '@/components/ui/input';

export interface Suggestion {
  value: string;
  label: string;
}

type SuggestInputProps = Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'list'> & {
  value: string;
  onValueChange: (value: string) => void;
  /** Offered as the field is typed in, matched on value and label. */
  suggestions: Suggestion[];
  /** Called with a suggestion picked from the list. */
  onPick?: (value: string) => void;
};

/**
 * A text field that offers matching suggestions in a list under it, in place of a browser
 * datalist. Any text is still accepted; arrow keys and Enter pick from the list.
 */
function SuggestInput({
  value,
  onValueChange,
  suggestions,
  onPick,
  onKeyDown,
  onFocus,
  onBlur,
  className,
  ...props
}: SuggestInputProps) {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const listId = React.useId();
  const query = value.trim().toLowerCase();
  const matches = suggestions
    .filter(
      (s) =>
        !query || s.value.toLowerCase().startsWith(query) || s.label.toLowerCase().includes(query),
    )
    .slice(0, 8);
  const shown =
    open && matches.length > 0 && !(matches.length === 1 && matches[0]!.value === value);

  const pick = (s: Suggestion) => {
    onValueChange(s.value);
    onPick?.(s.value);
    setOpen(false);
  };

  return (
    <PopoverPrimitive.Root open={shown}>
      <PopoverPrimitive.Anchor asChild>
        <Input
          {...props}
          value={value}
          role="combobox"
          aria-expanded={shown}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={shown ? `${listId}-${active}` : undefined}
          autoComplete="off"
          className={className}
          onChange={(e) => {
            onValueChange(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={(e) => {
            setOpen(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setOpen(false);
            onBlur?.(e);
          }}
          onKeyDown={(e) => {
            if (shown && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
              e.preventDefault();
              const step = e.key === 'ArrowDown' ? 1 : -1;
              setActive((a) => (a + step + matches.length) % matches.length);
              return;
            }
            if (shown && e.key === 'Enter' && matches[active]) {
              e.preventDefault();
              pick(matches[active]);
              return;
            }
            if (shown && e.key === 'Escape') {
              e.stopPropagation();
              setOpen(false);
              return;
            }
            onKeyDown?.(e);
          }}
        />
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          className="z-50 min-w-(--radix-popover-trigger-width) rounded-xl bg-popover p-1.5 text-popover-foreground shadow-floating backdrop-blur-2xl data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95"
        >
          <ul id={listId} role="listbox" className="flex flex-col">
            {matches.map((s, i) => (
              <li
                key={s.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                // Keeps focus in the field, so picking doesn't count as leaving it.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(s)}
                className={cn(
                  'flex cursor-default items-center justify-between gap-4 rounded-md px-2 py-1.5 text-sm select-none',
                  i === active && 'bg-accent text-accent-foreground',
                )}
              >
                <span className="truncate">{s.label}</span>
                <span className="font-mono text-xs text-muted-foreground">{s.value}</span>
              </li>
            ))}
          </ul>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export { SuggestInput };
