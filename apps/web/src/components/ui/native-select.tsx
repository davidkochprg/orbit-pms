import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from 'cn';

/** A styled native select: keyboard and screen-reader behavior come from the browser. */
function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select
        data-slot="native-select"
        className={cn(
          'h-9 w-full min-w-0 appearance-none rounded-control border border-input bg-background py-1 pr-8 pl-3 text-sm shadow-[inset_0_1px_2px_var(--shadow-soft)] outline-none focus-visible:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

export { NativeSelect };
