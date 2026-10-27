import * as React from 'react';
import { cn } from 'cn';
import { Slider as SliderPrimitive } from 'radix-ui';

/** A single-thumb slider. `trackStyle` lets callers paint the track, e.g. with a gradient. */
function Slider({
  className,
  trackStyle,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & { trackStyle?: React.CSSProperties }) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn(
        'relative flex w-full touch-none items-center select-none data-disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative h-2 w-full grow overflow-hidden rounded-full bg-muted ring-1 ring-border"
        style={trackStyle}
      />
      <SliderPrimitive.Thumb
        data-slot="slider-thumb"
        className="block size-4 rounded-full border border-border-strong bg-background shadow-raised transition-shadow outline-none focus-visible:ring-3 focus-visible:ring-ring"
      />
    </SliderPrimitive.Root>
  );
}

export { Slider };
