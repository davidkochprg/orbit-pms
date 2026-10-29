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
        'inline-flex shrink-0 items-center gap-[0.28em] font-semibold tracking-[-0.055em] text-foreground select-none',
        sizes[size],
        className,
      )}
    >
      <LogoMark className="size-[1.2em]" />
      {short ? <span className="sr-only">Orbit</span> : 'orbit'}
    </span>
  );
}
