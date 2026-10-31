import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import { Slot } from 'radix-ui';
import { Tip } from '@/components/ui/tooltip';

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-control border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[color,background-color,box-shadow,transform,filter] duration-150 ease-snap outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/40 active:not-aria-[haspopup]:scale-[0.975] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        /* The one action that matters here: ink, lit from above. */
        default:
          'bg-ink bg-linear-to-b bg-clip-border from-white/14 to-transparent text-ink-foreground shadow-button hover:brightness-125 disabled:shadow-none dark:from-transparent dark:to-black/8 dark:hover:brightness-95',
        /* A raised pill: the surface with a sheen, a lit hairline and a soft drop. */
        outline:
          'relative fill-action stroke-lit text-foreground shadow-action hover:brightness-[1.03] aria-expanded:brightness-[0.98] dark:hover:brightness-125',
        /* A quiet chip for secondary actions in a row. */
        secondary:
          'border-ink/7 bg-ink/5 text-muted-foreground hover:bg-ink/8 hover:text-foreground aria-expanded:bg-ink/8 aria-expanded:text-foreground',
        ghost:
          'text-muted-foreground hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground',
        destructive:
          'bg-destructive/10 text-destructive hover:bg-destructive/15 focus-visible:ring-destructive/20 dark:bg-destructive/15 dark:hover:bg-destructive/25',
        link: 'rounded-sm text-primary-text underline-offset-4 hover:underline',
      },
      size: {
        default:
          'h-9 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3',
        xs: "h-6 gap-1 px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3.5 text-[0.8125rem] has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-10 gap-2 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4',
        icon: 'size-9',
        'icon-xs': "size-6 [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  tooltip,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /** Shown on hover and focus in the app's tooltip; use it instead of `title`. */
    tooltip?: React.ReactNode;
  }) {
  const Comp = asChild ? Slot.Root : 'button';
  const button = (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
  if (!tooltip) return button;
  // A disabled button gets no pointer events, so a wrapper carries its tooltip.
  return (
    <Tip label={tooltip}>
      {props.disabled ? <span className="inline-flex">{button}</span> : button}
    </Tip>
  );
}

export { Button, buttonVariants };
