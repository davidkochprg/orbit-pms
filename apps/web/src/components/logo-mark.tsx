import { cn } from '@/lib/utils';

/** One half of the mark, on a horizontal axis: half a ring whose ends run out into tapering tails. */
const half =
  'M5.57 -0.62A5.6 5.6 0 0 0 -5.57 -0.62L-15.1 -0.62A0.3 0.3 0 0 1 -15.1 -1.22C-10.1 -2.42 -9.59 -3.48 -6.02 -6.69A9 9 0 0 1 6.02 -6.69C9.59 -3.48 10.1 -2.42 15.1 -1.22A0.3 0.3 0 0 1 15.1 -0.62Z';

/**
 * Orbit's mark: a ring split along its diagonal into two halves that sweep out into tails, like a
 * planet spinning. Drawn in `currentColor`.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={cn('shrink-0', className)}>
      <g transform="translate(12 12) rotate(-45)">
        <path d={half} />
        <path d={half} transform="rotate(180)" />
      </g>
    </svg>
  );
}
