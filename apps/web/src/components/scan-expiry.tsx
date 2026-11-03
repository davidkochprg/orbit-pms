import { useEffect, useState } from 'react';
import { minutesLeft } from '@/lib/scan';

/** "Expires in 12 minutes", counting down while the QR code is shown. */
export function ScanExpiry({ expiresAt }: { expiresAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  if (!expiresAt) return null;
  const left = minutesLeft(expiresAt, now);
  return (
    <p className="text-muted-foreground">
      {left === 0
        ? 'This code has expired'
        : `Expires in ${left} ${left === 1 ? 'minute' : 'minutes'}`}
    </p>
  );
}
