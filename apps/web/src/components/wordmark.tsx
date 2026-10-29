import { LogoMark } from '@/components/logo-mark';
import { cn } from '@/lib/utils';

const sizes = {
  sm: 'text-[15px]/none',
  md: 'text-xl/none',
  lg: 'text-[1.75rem]/none',
};

/** Orbit's logo: the mark, then the name in lowercase Geist, set tight. `short` shows the mark only. */
export function Wordmark({
  size = 'md',
  short = false,
  className,
}: {
  size?: keyof typeof sizes;
  short?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-baseline gap-[0.26em] font-semibold tracking-[-0.055em] text-foreground select-none',
        sizes[size],
        className,
      )}
    >
      {/* Beside the name the ring centres on the x-height (0.53em in Geist, so 0.275em up) and the
          tails reach past the ascenders and below the baseline. It sits on the baseline, so
          `top` = 1.1em / 2 − 0.275em. */}
      <LogoMark className={short ? 'size-[1.2em]' : 'relative top-[0.275em] size-[1.1em]'} />
      {short ? <span className="sr-only">Orbit</span> : 'orbit'}
    </span>
  );
}
