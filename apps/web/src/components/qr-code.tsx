import { useMemo } from 'react';
import { encode } from 'uqr';
import { cn } from '@/lib/utils';

/** A QR code drawn in the text color on the background, so it works in light and dark mode. */
export function QrCode({ value, className }: { value: string; className?: string }) {
  const { size, path } = useMemo(() => {
    const qr = encode(value, { ecc: 'M', border: 2 });
    let d = '';
    qr.data.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) d += `M${x} ${y}h1v1h-1z`;
      }),
    );
    return { size: qr.size, path: d };
  }, [value]);
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="QR code for the scan link"
      shapeRendering="crispEdges"
      className={cn('rounded-control bg-white text-black', className)}
    >
      <path d={path} fill="currentColor" />
    </svg>
  );
}
