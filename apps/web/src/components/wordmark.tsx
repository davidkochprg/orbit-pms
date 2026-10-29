import { cn } from '@/lib/utils';

const sizes = {
  sm: 'text-[15px]/none',
  md: 'text-xl/none',
  lg: 'text-[1.75rem]/none',
};

/** Orbit's logo: the name in lowercase Geist, set tight. `short` shows only the "o". */
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
        'inline-block shrink-0 font-semibold tracking-[-0.055em] text-foreground select-none',
        sizes[size],
        className,
      )}
    >
      {short ? (
        <>
          <span aria-hidden>o</span>
          <span className="sr-only">Orbit</span>
        </>
      ) : (
        'orbit'
      )}
    </span>
  );
}
