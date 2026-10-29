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
        'inline-flex shrink-0 items-baseline gap-[0.3em] font-semibold tracking-[-0.055em] text-foreground select-none',
        sizes[size],
        className,
      )}
    >
      {/* Beside the name: as tall as the "b" (0.705em in Geist), on the baseline with the "o"'s overshoot. */}
      <LogoMark className={short ? 'size-[1.2em]' : 'relative top-[0.012em] size-[0.74em]'} />
      {short ? <span className="sr-only">Orbit</span> : 'orbit'}
    </span>
  );
}
