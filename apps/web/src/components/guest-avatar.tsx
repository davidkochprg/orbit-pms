import type { CSSProperties } from 'react';
import { initials, orbShift } from '@/lib/format';
import { cn } from '@/lib/utils';

const sizes = {
  sm: 'size-6 text-[9px]',
  md: 'size-8 text-[11px]',
  lg: 'size-11 text-sm',
};

/** A person as an aurora orb with their initials, the orb's hue turned a little per name. */
export function GuestAvatar({
  name,
  size = 'sm',
  className,
}: {
  name: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      style={{ '--orb-shift': `${orbShift(name)}deg` } as CSSProperties}
      className={cn(
        'bg-orb inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-wide text-white shadow-[inset_0_-2px_4px_rgb(0_0_0/0.18),0_1px_2px_rgb(0_0_0/0.12)] [text-shadow:0_1px_1px_rgb(0_0_0/0.25)]',
        sizes[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
