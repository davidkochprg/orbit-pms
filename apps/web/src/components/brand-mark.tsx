import { cn } from '@/lib/utils';

const sizes = {
  md: 'size-7',
  lg: 'size-9',
};

/** Orbit's mark: an aurora orb with a thin ring around it. */
export function BrandMark({
  size = 'md',
  className,
}: {
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn('relative flex shrink-0 items-center justify-center', sizes[size], className)}
    >
      <span className="bg-orb absolute inset-[18%] rounded-full shadow-[inset_0_-2px_4px_rgb(0_0_0/0.2),0_2px_6px_-1px_rgb(0_0_0/0.25)]" />
      <svg viewBox="0 0 28 28" fill="none" className="absolute inset-0 size-full text-foreground">
        <g
          transform="rotate(-20 14 14)"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        >
          {/* The ring's far half passes behind the orb, the near half in front of it. */}
          <path d="M1.5 14a12.5 3.6 0 0 1 25 0" strokeOpacity="0.18" />
          <path d="M1.5 14a12.5 3.6 0 0 0 25 0" strokeOpacity="0.7" />
        </g>
      </svg>
    </span>
  );
}
