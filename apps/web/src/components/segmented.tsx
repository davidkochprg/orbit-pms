import { cn } from '@/lib/utils';

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}

/** A small set of mutually exclusive choices, shown side by side. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex gap-1 rounded-lg bg-muted p-1', className)}
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
            'flex-1 rounded-md px-3 py-1 text-xs whitespace-nowrap text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
            value === o.value && 'bg-background text-foreground shadow-raised',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
