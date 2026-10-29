import { cn } from '@/lib/utils';

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  /** `sm` is button height, for a page header. */
  size?: 'default' | 'sm';
  className?: string;
}

/** A small set of mutually exclusive choices, shown side by side. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  size = 'default',
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'inline-flex border border-ink/6 bg-ink/4',
        size === 'sm' ? 'h-8 gap-0.5 rounded-control p-0.5' : 'gap-1 rounded-[0.625rem] p-1',
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            'relative flex-1 text-[0.8125rem] whitespace-nowrap text-muted-foreground outline-none transition-[color,background-color,box-shadow] duration-150 ease-snap hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
            size === 'sm' ? 'rounded-[0.3125rem] px-2.5' : 'rounded-md px-3.5 py-1.5',
            value === o.value && 'fill-action text-foreground shadow-action stroke-lit',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
