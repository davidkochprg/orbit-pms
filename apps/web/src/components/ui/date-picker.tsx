import * as React from 'react';
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select } from '@/components/ui/select';
import { formatFullDate, hotelTodayIso } from '@/lib/format';

const iso = (d: Date) => format(d, 'yyyy-MM-dd');
const months = Array.from({ length: 12 }, (_, m) => format(new Date(2026, m, 1), 'MMMM'));
const weekdays = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
/** Arrow keys and PageUp/PageDown, and the days or months they move by. */
const dayKeys: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
const monthKeys: Record<string, number> = { PageUp: -1, PageDown: 1 };

interface DatePickerProps {
  /** YYYY-MM-DD, or '' for none. */
  value: string;
  onChange: (value: string) => void;
  /** Earliest and latest dates that can be picked, YYYY-MM-DD. */
  min?: string;
  max?: string;
  id?: string;
  'aria-label'?: string;
  disabled?: boolean;
  placeholder?: string;
  /** A form field, or a raised button for a page's toolbar. */
  variant?: 'field' | 'action';
  /** How the picked date reads on the button; the date with its year by default. */
  display?: (value: string) => string;
  /** Offers to empty the field. */
  clearable?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

/** The app's date field: a button that opens a month calendar, instead of the OS picker. */
function DatePicker({
  value,
  onChange,
  min,
  max,
  id,
  disabled,
  placeholder = 'Pick a date',
  variant = 'field',
  display = formatFullDate,
  clearable = false,
  defaultOpen = false,
  onOpenChange,
  className,
  ...props
}: DatePickerProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  const setOpenAndTell = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };
  return (
    <Popover open={open} onOpenChange={setOpenAndTell}>
      <PopoverTrigger asChild>
        {variant === 'action' ? (
          <Button
            id={id}
            variant="outline"
            size="sm"
            disabled={disabled}
            aria-label={props['aria-label']}
            className={cn('tabular-nums', className)}
          >
            <CalendarDays className="text-muted-foreground" />
            {value ? display(value) : placeholder}
          </Button>
        ) : (
          <button
            type="button"
            id={id}
            disabled={disabled}
            aria-label={props['aria-label']}
            data-slot="date-picker"
            className={cn(
              'flex h-9 w-full min-w-0 items-center gap-2 rounded-control border border-input bg-background px-3 text-left text-sm tabular-nums shadow-[inset_0_1px_2px_var(--shadow-soft)] outline-none focus-visible:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50 aria-expanded:border-primary/60',
              !value && 'text-subtle-foreground',
              className,
            )}
          >
            <span className="min-w-0 flex-1 truncate">{value ? display(value) : placeholder}</span>
            <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto p-2.5"
        // The calendar focuses the picked day (or today) itself.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Calendar
          value={value}
          min={min}
          max={max}
          clearable={clearable}
          onPick={(next) => {
            onChange(next);
            setOpenAndTell(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** A month of days from Monday, with the month and year to jump to and arrow keys to move. */
function Calendar({
  value,
  min,
  max,
  clearable,
  onPick,
}: {
  value: string;
  min?: string;
  max?: string;
  clearable: boolean;
  onPick: (value: string) => void;
}) {
  const today = hotelTodayIso();
  const [focused, setFocused] = React.useState(() => clamp(value || today, min, max));
  const grid = React.useRef<HTMLDivElement>(null);
  const month = startOfMonth(parseISO(focused));
  const days: Date[] = [];
  for (
    let d = startOfWeek(month, { weekStartsOn: 1 });
    d <= endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    d = addDays(d, 1)
  ) {
    days.push(d);
  }
  const outside = (date: string) =>
    (min !== undefined && date < min) || (max !== undefined && date > max);
  const year = month.getFullYear();
  const firstYear = min ? Number(min.slice(0, 4)) : Math.min(year, Number(today.slice(0, 4))) - 5;
  const lastYear = max ? Number(max.slice(0, 4)) : Math.max(year, Number(today.slice(0, 4))) + 5;

  // The focused day keeps keyboard focus as it moves, also across months, and has it on open.
  React.useEffect(() => {
    grid.current
      ?.querySelector<HTMLElement>(`[data-date="${focused}"]`)
      ?.focus({ preventScroll: true });
  }, [focused]);

  const go = (date: string) => setFocused(clamp(date, min, max));
  const jump = (months: number) => go(iso(addMonths(parseISO(focused), months)));

  return (
    <div className="flex w-[16.5rem] flex-col gap-2">
      <div className="flex items-center gap-1">
        <Select
          aria-label="Month"
          value={String(month.getMonth())}
          onValueChange={(m) =>
            go(iso(new Date(year, Number(m), Math.min(parseISO(focused).getDate(), 28))))
          }
          className="h-8 flex-1 px-2 text-[0.8125rem]"
        >
          {months.map((name, m) => (
            <option key={name} value={String(m)}>
              {name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Year"
          value={String(year)}
          onValueChange={(y) =>
            go(
              iso(new Date(Number(y), month.getMonth(), Math.min(parseISO(focused).getDate(), 28))),
            )
          }
          className="h-8 w-[5.5rem] px-2 text-[0.8125rem]"
        >
          {Array.from({ length: lastYear - firstYear + 1 }, (_, i) => lastYear - i).map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </Select>
        <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => jump(-1)}>
          <ChevronLeft />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => jump(1)}>
          <ChevronRight />
        </Button>
      </div>
      <div
        ref={grid}
        role="grid"
        aria-label={format(month, 'MMMM yyyy')}
        className="grid grid-cols-7 gap-0.5"
        onKeyDown={(e) => {
          const days = dayKeys[e.key];
          const months = monthKeys[e.key];
          if (days === undefined && months === undefined) return;
          e.preventDefault();
          if (days !== undefined) go(iso(addDays(parseISO(focused), days)));
          else jump(months!);
        }}
      >
        {weekdays.map((d) => (
          <span
            key={d}
            role="columnheader"
            className="grid h-7 place-items-center text-[0.6875rem] text-subtle-foreground"
          >
            {d}
          </span>
        ))}
        {days.map((d) => {
          const date = iso(d);
          const picked = date === value;
          return (
            <button
              key={date}
              type="button"
              role="gridcell"
              data-date={date}
              aria-selected={picked}
              aria-label={format(d, 'EEEE, MMMM d, yyyy')}
              tabIndex={date === focused ? 0 : -1}
              disabled={outside(date)}
              onClick={() => onPick(date)}
              onFocus={() => date !== focused && setFocused(date)}
              className={cn(
                'grid h-8 place-items-center rounded-md text-[0.8125rem] tabular-nums outline-none transition-colors duration-150 ease-snap hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-35',
                !isSameMonth(d, month) && 'text-subtle-foreground',
                date === today && !picked && 'font-semibold text-primary-text',
                picked && 'bg-ink text-ink-foreground hover:bg-ink',
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
      {(clearable || !outside(today)) && (
        <div className="flex items-center justify-between gap-2 border-t pt-2">
          {!outside(today) ? (
            <Button variant="ghost" size="xs" onClick={() => onPick(today)}>
              Today
            </Button>
          ) : (
            <span />
          )}
          {clearable && value && (
            <Button variant="ghost" size="xs" onClick={() => onPick('')}>
              Clear
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function clamp(date: string, min?: string, max?: string): string {
  if (min !== undefined && date < min) return min;
  if (max !== undefined && date > max) return max;
  return date;
}

export { DatePicker };
