import { cn } from '@/lib/utils';

/** One half of the mark, on a horizontal axis: half a ring whose ends taper into tails. */
const half =
  'M5.57 -0.62A5.6 5.6 0 0 0 -5.57 -0.62L-13.8 -0.62A1.2 1.2 0 0 1 -13.8 -3.02C-9.8 -3.02 -9.59 -3.48 -6.02 -6.69A9 9 0 0 1 6.02 -6.69C9.59 -3.48 9.8 -3.02 13.8 -3.02A1.2 1.2 0 0 1 13.8 -0.62Z';

/**
 * Orbit's mark: a ring split along its diagonal into two halves that sweep out into tails, like a
 * planet spinning. Drawn in `currentColor`.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" aria-hidden className={cn('shrink-0', className)}>
      <g transform="translate(16 16) rotate(-45)">
        <path d={half} />
        <path d={half} transform="rotate(180)" />
      </g>
    </svg>
  );
}
